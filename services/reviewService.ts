import { ReviewProject, ReviewEpisode, ReviewStoryboard } from '../types';
import { getAuthToken } from './api';

const API_BASE = '/api/review';

// 辅助：获取 Token
const getHeaders = () => {
  const token = getAuthToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// --- 项目相关 ---
export const getProjects = async (): Promise<ReviewProject[]> => {
  const res = await fetch(`${API_BASE}/projects`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch projects');
  const data = await res.json();
  return data || [];
};

export const createProject = async (name: string, cover?: File): Promise<ReviewProject> => {
  const formData = new FormData();
  formData.append('name', name);
  if (cover) formData.append('cover', cover);

  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: getHeaders(), // FormData 不需要 Content-Type，浏览器会自动设置
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
};

// --- 单集相关 ---
export const getEpisodes = async (projectId: string): Promise<ReviewEpisode[]> => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/episodes`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch episodes');
  const data = await res.json();
  return data || [];
};

export const createEpisode = async (projectId: string, name: string, cover?: File): Promise<ReviewEpisode> => {
  const formData = new FormData();
  formData.append('name', name);
  if (cover) formData.append('cover', cover);

  const res = await fetch(`${API_BASE}/projects/${projectId}/episodes`, {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to create episode');
  return res.json();
};

// --- 分镜相关 ---
export const getStoryboards = async (episodeId: string): Promise<ReviewStoryboard[]> => {
  const res = await fetch(`${API_BASE}/episodes/${episodeId}/storyboards`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch storyboards');
  const data = await res.json();
  return data || [];
};

export const createStoryboard = async (episodeId: string, name: string, image: File): Promise<ReviewStoryboard> => {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('image', image);

  const res = await fetch(`${API_BASE}/episodes/${episodeId}/storyboards`, {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to create storyboard');
  return res.json();
};

export const updateStoryboardStatus = async (id: string, status: string, feedback?: string) => {
  const res = await fetch(`${API_BASE}/storyboards/${id}/status`, {
    method: 'PATCH',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, feedback }),
  });
  if (!res.ok) throw new Error('Failed to update status');
  return res.json();
};

export const updateProject = async (id: string, name: string, cover?: File): Promise<ReviewProject> => {
  const formData = new FormData();
  formData.append('name', name);
  if (cover) formData.append('cover', cover);

  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to update project');
  return res.json();
};

export const updateEpisode = async (id: string, name: string, cover?: File): Promise<ReviewEpisode> => {
  const formData = new FormData();
  formData.append('name', name);
  if (cover) formData.append('cover', cover);

  const res = await fetch(`${API_BASE}/episodes/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to update episode');
  return res.json();
};

export const updateStoryboard = async (id: string, name: string, image?: File): Promise<ReviewStoryboard> => {
  const formData = new FormData();
  formData.append('name', name);
  if (image) formData.append('image', image);

  const res = await fetch(`${API_BASE}/storyboards/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to update storyboard');
  return res.json();
};

export const reorderStoryboards = async (storyboardIds: string[]) => {
  const res = await fetch(`${API_BASE}/storyboards/reorder`, {
    method: 'PUT',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyboardIds }),
  });
  if (!res.ok) throw new Error('Failed to reorder');
  return res.json();
};

export const reorderEpisodes = async (episodeIds: string[]) => {
  const res = await fetch(`${API_BASE}/episodes/reorder`, {
    method: 'PUT',
    headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ episodeIds }),
  });
  if (!res.ok) throw new Error('Failed to reorder');
  return res.json();
};

export const deleteStoryboard = async (id: string) => {
  const res = await fetch(`${API_BASE}/storyboards/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete storyboard');
  return res.json();
};