import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { api, clearAuthToken, getAuthToken } from './services/api';
import type { ModelInfo, User } from './types';
import { LoginPage } from './pages/LoginPage';
import { ImagePage } from './pages/ImagePage';
import { SlicerPage } from './pages/SlicerPage';
import { VideoPage } from './pages/VideoPage';
import { LibraryPage } from './pages/LibraryPage';
import { AdminPage } from './pages/AdminPage';
import NanoBanana3DStudio from './pages/NanoBanana3DStudio';
import ReviewProjectsPage from './pages/review/ReviewProjectsPage';
import ProjectDetailsPage from './pages/review/ProjectDetailsPage';
import EpisodeDetailsPage from './pages/review/EpisodeDetailsPage';
import { ProviderSettingsModal } from './components/ProviderSettingsModal';
import { Spinner } from './components/Spinner';
import { ErrorBoundary } from './components/ErrorBoundary';

type Tab = 'image' | 'slicer' | 'video' | 'library' | 'admin' | 'review' | 'studio';

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`relative px-2 py-2 text-sm font-medium ${props.active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
    >
      {props.children}
      {props.active ? <span className="absolute left-0 right-0 -bottom-1 h-[2px] bg-white/50" /> : null}
    </button>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [tab, setTab] = useState<Tab>('image');
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // 从裁切工具传递到图片生成页面的参考图
  const slicerReferenceFilesRef = useRef<File[]>([]);
  const [slicerRefTrigger, setSlicerRefTrigger] = useState(0);
  // 从裁切工具传递到视频生成页面的参考图
  const slicerVideoReferenceFilesRef = useRef<File[]>([]);
  const [slicerVideoRefTrigger, setSlicerVideoRefTrigger] = useState(0);

  const isAuthed = !!user;
  const isAdmin = user?.role === 'admin';

  // 处理从裁切工具导入到图片生成
  const handleUseAsImageReference = (files: File[]) => {
    slicerReferenceFilesRef.current = files;
    setSlicerRefTrigger((t) => t + 1); // 触发 ImagePage 重新检查
    setTab('image'); // 切换到图片生成页面
  };

  // 处理从裁切工具导入到视频生成
  const handleUseAsVideoReference = (files: File[]) => {
    slicerVideoReferenceFilesRef.current = files;
    setSlicerVideoRefTrigger((t) => t + 1);
    setTab('video');
  };

  // 获取并清除图片参考图
  const getAndClearSlicerReferences = (): File[] => {
    const files = slicerReferenceFilesRef.current;
    slicerReferenceFilesRef.current = [];
    return files;
  };
  // 获取并清除视频参考图
  const getAndClearSlicerVideoReferences = (): File[] => {
    const files = slicerVideoReferenceFilesRef.current;
    slicerVideoReferenceFilesRef.current = [];
    return files;
  };

  async function bootstrap() {
    setLoading(true);
    try {
      if (getAuthToken()) {
        const me = await api.me();
        setUser(me);
        const m = await api.getModels();
        setModels(m || []);
      }
    } catch {
      clearAuthToken();
      setUser(null);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === 新增：互斥登录的心跳与自动登出逻辑 ===
  useEffect(() => {
    // 只有用户登录了才运行这套逻辑
    if (!user) return;

    // 1. 定时发送心跳 (每 5 分钟 = 300000 毫秒)
    // 建议时间小于后端的 10 分钟超时时间
    const heartbeatInterval = setInterval(() => {
      api.sendHeartbeat();
    }, 5 * 60 * 1000); 

    // 2. 监听页面关闭/刷新事件，尝试发送登出请求
    // 这样用户关闭网页后，后端状态能迅速变为“未登录”，方便下次立即登录
    const handleUnload = () => {
      const token = getAuthToken();
      if (token) {
        // 使用 fetch 的 keepalive: true 选项，确保请求在页面关闭后也能发出
        // 或者使用 navigator.sendBeacon
        const headers = new Headers();
        headers.append('Authorization', `Bearer ${token}`);
        headers.append('Content-Type', 'application/json');
        
        fetch(`${(import.meta as any).env?.VITE_API_BASE || ''}/api/auth/logout`, {
            method: 'POST',
            headers: headers,
            keepalive: true // 关键：允许请求在页面卸载后继续存活
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    // 清理函数
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user]); // 依赖项为 user，当 user 变化时重新设置

  // 监听路径变化，自动切换Tab
  useEffect(() => {
    if (location.pathname.startsWith('/review')) {
      setTab('review');
    }
  }, [location.pathname]);

  async function handleLogin(username: string, password: string) {
    setLoginError(null);
    try {
      const res = await api.login(username, password);
      setUser(res.user);
      const m = await api.getModels();
      setModels(m || []);
      setTab('image');
    } catch (e: any) {
      let errorMessage = e?.message || String(e);
      
      // === 修改：针对互斥登录的错误处理 ===
      // 特别针对"互斥登录"的提示优化
      if (errorMessage.includes("已在其他设备登录")) {
         errorMessage = "该账号当前在线。请先在其他设备退出，或等待 10 分钟自动清理。";
      }
      
      setLoginError(errorMessage);
      throw e;
    }
  }

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // 修改：Tab 切换处理函数
  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === 'review') {
      navigate('/review');
    } else {
      navigate('/');
    }
  };

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    clearAuthToken();
    setUser(null);
    setModels([]);
    setTab('image');
    setLogoutConfirmOpen(false);
  }

  const page = useMemo(() => {
    if (tab === 'image') {
      return (
        <ImagePage
          models={models}
          onOpenProviderSettings={() => setProviderOpen(true)}
          getInitialReferenceFiles={getAndClearSlicerReferences}
          slicerRefTrigger={slicerRefTrigger}
        />
      );
    }
    if (tab === 'slicer') {
      return (
        <SlicerPage
          models={models}
          onOpenProviderSettings={() => setProviderOpen(true)}
          onUseAsReference={handleUseAsImageReference}
          onUseAsVideoReference={handleUseAsVideoReference}
        />
      );
    }
    if (tab === 'video') {
      return (
        <VideoPage
          models={models}
          onOpenProviderSettings={() => setProviderOpen(true)}
          getInitialReferenceFiles={getAndClearSlicerVideoReferences}
          slicerRefTrigger={slicerVideoRefTrigger}
        />
      );
    }
    if (tab === 'library') {
      return <LibraryPage />;
    }
    if (tab === 'studio') {
      return <NanoBanana3DStudio />;
    }
    if (tab === 'review') {
      return (
        <Routes>
          <Route path="/review" element={<ReviewProjectsPage />} />
          <Route path="/review/projects/:projectId" element={<ProjectDetailsPage />} />
          <Route path="/review/episodes/:episodeId" element={<EpisodeDetailsPage />} />
          <Route path="*" element={<Navigate to="/review" replace />} />
        </Routes>
      );
    }
    if (tab === 'admin') {
      return <AdminPage />;
    }
    return null;
  }, [models, tab, slicerRefTrigger, slicerVideoRefTrigger]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-zinc-300">
        <Spinner size={18} />
        <span className="ml-2 text-sm">加载中…</span>
      </div>
    );
  }

  if (!isAuthed) {
    return <LoginPage onLogin={handleLogin} error={loginError} />;
  }

  return (
    <ErrorBoundary>
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/5 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <TabButton active={tab === 'image'} onClick={() => handleTabChange('image')}>
              图片生成
            </TabButton>
            <TabButton active={tab === 'slicer'} onClick={() => handleTabChange('slicer')}>
              裁切工具
            </TabButton>
            <TabButton active={tab === 'video'} onClick={() => handleTabChange('video')}>
              视频生成
            </TabButton>
            <TabButton active={tab === 'library'} onClick={() => handleTabChange('library')}>
              角色/场景库
            </TabButton>
            <TabButton active={tab === 'studio'} onClick={() => handleTabChange('studio')}>
              多角度工作室
            </TabButton>
            <TabButton active={tab === 'review'} onClick={() => handleTabChange('review')}>
              影视审阅
            </TabButton>
            {isAdmin ? (
              <TabButton active={tab === 'admin'} onClick={() => handleTabChange('admin')}>
                管理
              </TabButton>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setProviderOpen(true)}
              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              title="接口设置"
            >
              接口设置
            </button>
            {/* 用户名下拉菜单 */}
            <div className="relative group">
              <div className="flex items-center gap-1 px-3 py-2 text-xs text-zinc-300 cursor-pointer rounded-lg hover:bg-white/5">
                <span>{user?.username}</span>
                <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {/* 下拉菜单 */}
              <div className="absolute right-0 top-full mt-1 min-w-[100px] rounded-lg bg-zinc-800 ring-1 ring-white/10 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="w-full px-4 py-2 text-xs text-zinc-200 hover:bg-white/10 rounded-lg text-left"
                >
                  退出登录
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1">{page}</div>

        <ProviderSettingsModal open={providerOpen} onClose={() => setProviderOpen(false)} />

        {/* 退出登录确认弹窗 */}
        {logoutConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgba(25, 25, 30, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="text-center">
                <div className="text-lg font-semibold text-white mb-2">确认退出</div>
                <div className="text-sm text-zinc-400 mb-6">确定要退出登录吗？</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setLogoutConfirmOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-2.5 rounded-xl bg-red-600/50 text-sm font-medium text-white hover:bg-red-600/70 transition-colors"
                  >
                    确认退出
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 将所有路径都匹配给 AppContent，由 AppContent 内部决定显示什么 */}
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  );
}