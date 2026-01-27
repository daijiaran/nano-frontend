import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Image as ImageIcon, ChevronLeft, ChevronRight, X, Edit } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { getStoryboards, createStoryboard, reorderStoryboards, updateStoryboardStatus, updateStoryboard } from '../../services/reviewService';
import { ReviewStoryboard, User } from '../../types';
import { Modal } from '../../components/Modal';
import { api, buildFileUrl } from '../../services/api';

// --- 可拖拽的分镜卡片组件 ---
function SortableStoryboardCard({ item, onClick, onEdit, canEdit, isAdmin }: { item: ReviewStoryboard; onClick: () => void; onEdit: () => void; canEdit: boolean; isAdmin: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging // <--- 新增解构
  } = useSortable({ id: item.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition, // <--- 关键修复
    zIndex: isDragging ? 999 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  // 状态颜色逻辑
  let statusColor = "bg-gray-800 border-gray-600"; // 未审阅
  if (item.status === 'approved') statusColor = "bg-green-900/40 border-green-600 ring-1 ring-green-500";
  if (item.status === 'rejected') statusColor = "bg-red-900/40 border-red-600 ring-1 ring-red-500";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer hover:shadow-md transition group ${statusColor}`}
    >
      <img 
        src={item.imageUrl || buildFileUrl(item.imageFileId)} 
        alt="storyboard" 
        className="w-full h-full object-cover" 
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition">
        {isAdmin ? '点击审阅' : '点击查看'}
      </div>
      {/* 状态角标 */}
      <div className="absolute top-1 right-1 px-2 py-0.5 rounded text-xs font-bold text-white bg-black/60 backdrop-blur-sm">
        {item.status === 'pending' && '待审'}
        {item.status === 'approved' && '通过'}
        {item.status === 'rejected' && '驳回'}
      </div>
      {/* 编辑按钮 */}
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute top-2 left-2 p-2 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition opacity-0 group-hover:opacity-100"
        >
          <Edit size={16} />
        </button>
      )}
      {/* 审阅按钮 (仅管理员可见) */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="absolute top-2 right-2 p-2 bg-green-600 rounded-full text-white hover:bg-green-700 transition opacity-0 group-hover:opacity-100"
        >
          <ImageIcon size={16} />
        </button>
      )}
    </div>
  );
}

// --- 主页面组件 ---
export default function EpisodeDetailsPage() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const navigate = useNavigate();
  const [storyboards, setStoryboards] = useState<ReviewStoryboard[]>([]);
  const [user, setUser] = useState<User | null>(null);
  
  // --- 新增传感器配置 --- 
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 0, // 消除激活延迟
        tolerance: 5, // 降低拖拽触发阈值
      },
    })
  );
  // --------------------
  
  // 创建Modal状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 审阅Modal状态
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    if (episodeId) loadData();
    loadUser();
  }, [episodeId]);

  const loadUser = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  };

  const loadData = () => {
    if (episodeId) {
      getStoryboards(episodeId).then(setStoryboards).catch(err => {
        console.error('加载分镜失败:', err);
        setError(err.message);
      });
    }
  };

  // 拖拽结束处理
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStoryboards((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      
      // 分离异步请求，不阻塞UI更新
      const newOrder = storyboards.map(i => i.id);
      reorderStoryboards(newOrder).catch(err => {
        console.error('排序失败:', err);
        // 可以添加失败回滚逻辑
      });
    }
  };

  // 创建分镜
  const handleCreate = async () => {
    if (!episodeId || (!newImage && !editingId)) return;
    setIsCreating(true);
    setError(null);
    try {
      if (editingId) {
        await updateStoryboard(editingId, newName || '未命名分镜', newImage || undefined);
      } else {
        await createStoryboard(episodeId, newName || '未命名分镜', newImage);
      }
      setIsCreateOpen(false);
      setEditingId(null);
      setNewName('');
      setNewImage(null);
      loadData();
    } catch (err: any) {
      console.error(editingId ? '更新分镜失败:' : '创建分镜失败:', err);
      setError(err.message || (editingId ? '更新分镜失败' : '创建分镜失败'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = (storyboard: ReviewStoryboard) => {
    setEditingId(storyboard.id);
    setNewName(storyboard.name);
    setNewImage(null);
    setIsCreateOpen(true);
  };

  // 审阅逻辑
  const activeStoryboard = storyboards.find(s => s.id === reviewingId);
  const activeIndex = storyboards.findIndex(s => s.id === reviewingId);

  const handleReviewAction = async (status: 'approved' | 'rejected') => {
    if (!reviewingId) return;
    if (status === 'rejected' && !isRejecting) {
      setIsRejecting(true); // 显示输入框
      return;
    }

    setIsReviewing(true);
    try {
      await updateStoryboardStatus(reviewingId, status, status === 'rejected' ? rejectReason : undefined);
      
      // 更新本地状态
      setStoryboards(prev => prev.map(s => 
        s.id === reviewingId ? { ...s, status, feedback: status === 'rejected' ? rejectReason : undefined } : s
      ));

      // 重置拒绝状态
      setIsRejecting(false);
      setRejectReason('');
    } catch (err: any) {
      console.error('更新状态失败:', err);
      setError(err.message || '操作失败');
    } finally {
      setIsReviewing(false);
    }
  };

  const navigateReview = (direction: -1 | 1) => {
    const newIndex = activeIndex + direction;
    if (newIndex >= 0 && newIndex < storyboards.length) {
      setReviewingId(storyboards[newIndex].id);
      setIsRejecting(false);
      setRejectReason('');
    }
  };

  return (
    <div className="container mx-auto p-6 bg-[#09090b] min-h-screen">
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">关闭</button>
        </div>
      )}
      <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white mb-4">
        <ArrowLeft size={16} className="mr-1" /> 返回单集
      </button>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">分镜列表 (可拖拽排序)</h1>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-600"
        >
          <Plus size={20} /> 新建分镜
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={storyboards} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {storyboards.length === 0 && !error && (
              <div className="col-span-full text-center py-12 text-gray-400">
                暂无分镜，点击上方按钮创建
              </div>
            )}
            {storyboards.map((item) => {
              const isAdmin = user?.role === 'admin';
              const canEdit = user && (user.id === item.userId || user.role === 'admin');
              return (
                <SortableStoryboardCard 
                  key={item.id} 
                  item={item} 
                  onClick={() => setReviewingId(item.id)} 
                  onEdit={() => handleEdit(item)} 
                  canEdit={canEdit} 
                  isAdmin={isAdmin} 
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* 创建分镜 Modal */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title={editingId ? "修改分镜" : "新建分镜"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">分镜名称</label>
            <input
              className="w-full border rounded p-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如: 镜头1-全景"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">分镜图片 (必要)</label>
            <input type="file" accept="image/*" onChange={(e) => setNewImage(e.target.files?.[0] || null)} className="w-full" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-gray-600" disabled={isCreating}>取消</button>
            <button onClick={handleCreate} disabled={isCreating || (!newImage && !editingId)} className="px-4 py-2 bg-gray-700 text-white rounded disabled:bg-gray-500">
              {isCreating ? (editingId ? '更新中...' : '创建中...') : '确认'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 审阅全屏 Modal */}
      {reviewingId && activeStoryboard && (
        <div className="fixed inset-0 z-50 bg-black flex text-white">
          {/* 左侧 3/4 图片展示区 */}
          <div className="w-3/4 h-full relative flex items-center justify-center bg-gray-900">
            <img 
              src={activeStoryboard.imageUrl || `/api/files/${activeStoryboard.imageFileId}`} 
              className="max-h-full max-w-full object-contain"
              alt="Review" 
            />
            
            {/* 导航按钮 */}
            <button 
              onClick={() => navigateReview(-1)} 
              disabled={activeIndex === 0}
              className="absolute left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full disabled:opacity-30"
            >
              <ChevronLeft size={32} />
            </button>
            <button 
              onClick={() => navigateReview(1)} 
              disabled={activeIndex === storyboards.length - 1}
              className="absolute right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full disabled:opacity-30"
            >
              <ChevronRight size={32} />
            </button>

            <button 
              onClick={() => setReviewingId(null)}
              className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 rounded-full"
            >
              <X size={24} />
            </button>
          </div>

          {/* 右侧 1/4 操作区 */}
          <div className="w-1/4 h-full bg-gray-800 p-6 flex flex-col border-l border-gray-700">
            <h2 className="text-xl font-bold mb-4">审阅操作</h2>
            <div className="mb-4">
              <span className={`px-2 py-1 rounded text-sm font-bold 
                ${activeStoryboard.status === 'approved' ? 'bg-green-600' : 
                  activeStoryboard.status === 'rejected' ? 'bg-red-600' : 'bg-gray-600'}`}>
                当前状态: {
                  activeStoryboard.status === 'pending' ? '未审阅' :
                  activeStoryboard.status === 'approved' ? '已通过' : '未通过'
                }
              </span>
            </div>

            {/* 修改建议显示 */}
            {activeStoryboard.feedback && !isRejecting && (
               <div className="mb-6 bg-red-900/30 p-3 rounded border border-red-700">
                 <p className="text-xs text-red-300 font-bold mb-1">修改建议:</p>
                 <p className="text-sm">{activeStoryboard.feedback}</p>
               </div>
            )}

            <div className="flex flex-col gap-4 mt-auto mb-10">
              {isRejecting ? (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                  <label className="text-sm font-medium">输入修改建议:</label>
                  <textarea 
                    className="w-full h-32 bg-gray-700 border border-gray-600 rounded p-2 text-sm focus:outline-none focus:border-gray-500"
                    placeholder="请输入具体的修改意见..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex gap-2">
                     <button 
                      onClick={() => setIsRejecting(false)}
                      className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded"
                      disabled={isReviewing}
                    >
                      取消
                    </button>
                    <button 
                      onClick={() => handleReviewAction('rejected')}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded font-bold"
                      disabled={isReviewing}
                    >
                      {isReviewing ? '提交中...' : '确认驳回'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button 
                    onClick={() => handleReviewAction('approved')}
                    disabled={isReviewing}
                    className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-lg shadow-lg disabled:opacity-50"
                  >
                    {isReviewing ? '提交中...' : '通过'}
                  </button>
                  <button 
                    onClick={() => handleReviewAction('rejected')}
                    disabled={isReviewing}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-lg shadow-lg disabled:opacity-50"
                  >
                    不通过
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}