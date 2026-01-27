import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film } from 'lucide-react';
import { getProjects, createProject } from '../../services/reviewService';
import { ReviewProject } from '../../types';
import { Modal } from '../../components/Modal';

export default function ReviewProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ReviewProject[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCover, setNewCover] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => getProjects().then(setProjects).catch(err => {
    console.error('加载项目失败:', err);
    setError(err.message);
  });

  const handleCreate = async () => {
    if (!newName) return;
    setIsLoading(true);
    setError(null);
    try {
      await createProject(newName, newCover || undefined);
      setIsModalOpen(false);
      setNewName('');
      setNewCover(null);
      loadProjects();
    } catch (err: any) {
      console.error('创建项目失败:', err);
      setError(err.message || '创建项目失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-300 hover:text-red-100">关闭</button>
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">影视项目审阅</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-800"
        >
          <Plus size={20} /> 创建影视项目
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {projects.length === 0 && !error && (
          <div className="col-span-full text-center py-12 text-gray-500">
            暂无项目，点击上方按钮创建
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/review/projects/${p.id}`)}
            className="bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer overflow-hidden border border-gray-100"
          >
            <div className="h-40 bg-gray-200 flex items-center justify-center">
              {p.coverFileId ? (
                <img src={`/api/files/${p.coverFileId}`} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <Film size={40} className="text-gray-400" />
              )}
            </div>
            <div className="p-4">
              <h3 className="font-bold text-lg">{p.name}</h3>
              <p className="text-sm text-gray-500 mt-1">创建日期: {new Date(p.createdAt).toLocaleDateString()}</p>
              <p className="text-sm text-gray-500">集数: {p.episodeCount || 0}</p>
            </div>
          </div>
        ))}
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="创建影视项目">
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
              {isLoading ? '创建中...' : '确认'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}