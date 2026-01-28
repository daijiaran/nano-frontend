import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Clapperboard, ArrowLeft, Edit } from 'lucide-react';

// --- 新增引用 ---
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// ----------------

import { 
  getEpisodes, 
  createEpisode, 
  getProjects, 
  updateEpisode, 
  reorderEpisodes // <--- 新增引入
} from '../../services/reviewService';
import { ReviewEpisode, ReviewProject, User } from '../../types';
import { Modal } from '../../components/Modal';
import { api, buildFileUrl } from '../../services/api';

// --- 新增可拖拽单集卡片组件 ---
function SortableEpisodeCard({ 
  episode, 
  onClick, 
  onEdit, 
  canEdit 
}: { 
  episode: ReviewEpisode; 
  onClick: () => void; 
  onEdit: () => void; 
  canEdit: boolean 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging // <--- 新增解构
  } = useSortable({ id: episode.id });
  
  const style = {
    transform: CSS.Transform.toString(transform), // 使用 dnd-kit 提供的工具函数
    transition: isDragging ? 'none' : transition, // <--- 关键修复：拖拽时禁用过渡
    zIndex: isDragging ? 999 : 'auto',            // <--- 优化：拖拽时层级置顶
    opacity: isDragging ? 0.8 : 1,                // <--- 优化：拖拽时半透明
    touchAction: 'none' // 优化触摸设备
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-[#18181d] rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-700 relative touch-none"
    >
      <div onClick={onClick}>
        <div className="h-32 bg-gray-700 flex items-center justify-center">
          {episode.coverFileId ? (
            <img src={buildFileUrl(episode.coverFileId)} alt={episode.name} className="w-full h-full object-cover" />
          ) : (
            <Clapperboard size={32} className="text-gray-400" />
          )}
        </div>
        <div className="p-4">
          <h3 className="font-bold text-white">{episode.name}</h3>
          <p className="text-sm text-gray-400 mt-1">创建日期: {new Date(episode.createdAt).toLocaleDateString()}</p>
          <p className="text-sm text-gray-400">分镜数: {episode.storyboardCount || 0}</p>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute top-2 right-2 p-2 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition"
        >
          <Edit size={16} />
        </button>
      )}
    </div>
  );
}

export default function ProjectDetailsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<ReviewEpisode[]>([]);
  const [project, setProject] = useState<ReviewProject | null>(null);
  const [user, setUser] = useState<User | null>(null);
  
  // --- 新增传感器配置 ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // 改为基于距离触发，解决点击冲突
        distance: 8,
      },
    })
  );
  // --------------------
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCover, setNewCover] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      loadData();
      getProjects().then(list => setProject(list.find(p => p.id === projectId) || null)).catch(err => {
        console.error('加载项目失败:', err);
      });
    }
    loadUser();
  }, [projectId]);

  const loadUser = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  };

  const loadData = () => {
    if (projectId) {
      getEpisodes(projectId).then(setEpisodes).catch(err => {
        console.error('加载单集失败:', err);
        setError(err.message);
      });
    }
  };

  const handleCreate = async () => {
    if (!projectId || !newName) return;
    setIsLoading(true);
    setError(null);
    try {
      if (editingId) {
        await updateEpisode(editingId, newName, newCover || undefined);
      } else {
        await createEpisode(projectId, newName, newCover || undefined);
      }
      setIsModalOpen(false);
      setEditingId(null);
      setNewName('');
      setNewCover(null);
      loadData();
    } catch (err: any) {
      console.error(editingId ? '更新单集失败:' : '创建单集失败:', err);
      setError(err.message || (editingId ? '更新单集失败' : '创建单集失败'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (episode: ReviewEpisode) => {
    setEditingId(episode.id);
    setNewName(episode.name);
    setNewCover(null);
    setIsModalOpen(true);
  };

  // --- 新增拖拽结束处理函数 ---
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEpisodes((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      
      // 分离异步请求，不阻塞UI更新
      const newOrder = episodes.map(i => i.id);
      reorderEpisodes(newOrder).catch(err => {
        console.error('排序失败:', err);
        // 可以添加失败回滚逻辑
      });
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
      <button onClick={() => navigate('/review')} className="flex items-center text-gray-400 hover:text-white mb-4">
        <ArrowLeft size={16} className="mr-1" /> 返回项目列表
      </button>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">{project?.name || '项目详情'} - 单集列表 (可拖拽排序)</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-600"
        >
          <Plus size={20} /> 新建一集
        </button>
      </div>

      {/* --- 修改列表区域：添加 DndContext 和 SortableContext --- */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={episodes} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {episodes.length === 0 && !error && (
              <div className="col-span-full text-center py-12 text-gray-400">
                暂无单集，点击上方按钮创建
              </div>
            )}
            {episodes.map((ep) => {
              const canEdit = user && (user.id === ep.userId || user.role === 'admin');
              return (
                <SortableEpisodeCard
                  key={ep.id}
                  episode={ep}
                  onClick={() => navigate(`/review/episodes/${ep.id}`)}
                  onEdit={() => handleEdit(ep)}
                  canEdit={!!canEdit}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Modal open={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingId(null); setNewName(''); setNewCover(null); setError(null); }} title={editingId ? "修改单集" : "新建一集"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">单集名称</label>
            <input
              className="w-full border rounded p-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">封面 (可选)</label>
            <input type="file" onChange={(e) => setNewCover(e.target.files?.[0] || null)} className="w-full" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600" disabled={isLoading}>取消</button>
            <button onClick={handleCreate} disabled={isLoading || !newName} className="px-4 py-2 bg-gray-700 text-white rounded disabled:bg-gray-500">
              {isLoading ? (editingId ? '更新中...' : '创建中...') : '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}