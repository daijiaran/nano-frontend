import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Clapperboard, ArrowLeft, Edit } from 'lucide-react';
import { getEpisodes, createEpisode, getProjects, updateEpisode } from '../../services/reviewService';
import { ReviewEpisode, ReviewProject, User } from '../../types';
import { Modal } from '../../components/Modal';
import { api, buildFileUrl } from '../../services/api';

export default function ProjectDetailsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<ReviewEpisode[]>([]);
  const [project, setProject] = useState<ReviewProject | null>(null);
  const [user, setUser] = useState<User | null>(null);
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
        <h1 className="text-2xl font-bold text-white">{project?.name || '项目详情'} - 单集列表</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-600"
        >
          <Plus size={20} /> 新建一集
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {episodes.length === 0 && !error && (
          <div className="col-span-full text-center py-12 text-gray-400">
            暂无单集，点击上方按钮创建
          </div>
        )}
        {episodes.map((ep) => (
          <div
            key={ep.id}
            className="bg-gray-800 rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-700 relative"
          >
            <div onClick={() => navigate(`/review/episodes/${ep.id}`)}>
              <div className="h-32 bg-gray-700 flex items-center justify-center">
                {ep.coverFileId ? (
                  <img src={buildFileUrl(ep.coverFileId)} alt={ep.name} className="w-full h-full object-cover" />
                ) : (
                  <Clapperboard size={32} className="text-gray-400" />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-white">{ep.name}</h3>
                <p className="text-sm text-gray-400 mt-1">创建日期: {new Date(ep.createdAt).toLocaleDateString()}</p>
                <p className="text-sm text-gray-400">分镜数: {ep.storyboardCount || 0}</p>
              </div>
            </div>
            {(user && (user.id === ep.userId || user.role === 'admin')) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(ep);
                }}
                className="absolute top-2 right-2 p-2 bg-blue-600 rounded-full text-white hover:bg-blue-700 transition"
              >
                <Edit size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

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