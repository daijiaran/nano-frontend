import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Edit, Trash2 } from 'lucide-react';
import { getProjects, createProject, updateProject, deleteProject } from '../../services/reviewService';
import { ReviewProject, User } from '../../types';
import { Modal } from '../../components/Modal';
import { api, buildFileUrl } from '../../services/api';

export default function ReviewProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ReviewProject[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCover, setNewCover] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  };

  const loadProjects = () => getProjects().then(setProjects).catch(err => {
    console.error('加载项目失败:', err);
    setError(err.message);
  });

  const handleCreate = async () => {
    if (!newName) return;
    setIsLoading(true);
    setError(null);
    try {
      if (editingId) {
        await updateProject(editingId, newName, newCover || undefined);
      } else {
        await createProject(newName, newCover || undefined);
      }
      setIsModalOpen(false);
      setEditingId(null);
      setNewName('');
      setNewCover(null);
      loadProjects();
    } catch (err: any) {
      console.error(editingId ? '更新项目失败:' : '创建项目失败:', err);
      setError(err.message || (editingId ? '更新项目失败' : '创建项目失败'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (project: ReviewProject) => {
    setEditingId(project.id);
    setNewName(project.name);
    setNewCover(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个项目吗？此操作不可恢复。')) return;
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    }
  };

  return (
    <div className="container mx-auto p-6 bg-[#09090b] min-h-full">
      {error && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-200">关闭</button>
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">影视项目审阅</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-600"
        >
          <Plus size={20} /> 创建影视项目
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {projects.length === 0 && !error && (
          <div className="col-span-full text-center py-12 text-gray-400">
            暂无项目，点击上方按钮创建
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="bg-[#18181d] rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-700 relative"
          >
            <div onClick={() => navigate(`/review/projects/${p.id}`)}>
              <div className="h-40 bg-gray-700 flex items-center justify-center">
                {p.coverFileId ? (
                  <img src={buildFileUrl(p.coverFileId)} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <Film size={40} className="text-gray-400" />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg text-white">{p.name}</h3>
                <p className="text-sm text-gray-400 mt-1">创建日期: {new Date(p.createdAt).toLocaleDateString()}</p>
                <p className="text-sm text-gray-400">集数: {p.episodeCount || 0}</p>
              </div>
            </div>
            {(user && (user.id === p.userId || user.role === 'admin')) && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(p);
                  }}
                  className="absolute top-2 right-2 p-2 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p.id);
                  }}
                  className="absolute top-2 right-14 p-2 bg-red-600 rounded-full text-white hover:bg-red-700 transition"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "修改影视项目" : "创建影视项目"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">项目名称</label>
            <input
              className="w-full border rounded p-2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">封面 (可选)</label>
            <input
              type="file"
              onChange={(e) => setNewCover(e.target.files?.[0] || null)}
              className="w-full"
            />
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