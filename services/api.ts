import type {
  AdminSettings,
  AdminUserRow,
  Generation,
  GenerationType,
  LibraryItem,
  LibraryKind,
  ModelInfo,
  PromptPreset,
  ProviderSettings,
  ReferenceUpload,
  User,
  VideoRun,
} from '../types';

const TOKEN_KEY = 'nb_token';

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

const API_BASE = trimTrailingSlash((import.meta as any).env?.VITE_API_BASE || '');

function url(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

function normalizeErrorMessage(msg: string): string {
  if (/insufficient credits/i.test(msg)) return 'API\u63a5\u53e3\u4f59\u989d\u4e0d\u8db3';
  return msg;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearAuthToken() {
  setAuthToken(null);
}

export function buildFileUrl(
  fileId: string,
  opts?: { download?: boolean; filename?: string; thumb?: boolean }
): string {
  const token = getAuthToken();
  const path = `/api/files/${fileId}`;
  
  // 构建查询参数
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (opts?.download) params.set('download', '1');
  if (opts?.thumb) params.set('thumb', '1');
  if (opts?.filename) params.set('filename', opts.filename);
  
  const queryString = params.toString();
  const fullPath = queryString ? `${path}?${queryString}` : path;
  
  // 如果设置了API_BASE，返回完整URL；否则返回相对路径（由proxy转发）
  if (API_BASE) {
    return `${API_BASE}${fullPath}`;
  }
  return fullPath;
}

async function apiFetch<T>(path: string, options?: RequestInit & { raw?: boolean }): Promise<T> {
  const token = getAuthToken();

  const headers = new Headers(options?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url(path), {
    ...options,
    headers,
  });

  if (!res.ok) {
    let msg = `\u8bf7\u6c42\u5931\u8d25 (${res.status})`;
    try {
      const data = await res.json();
      msg = data?.error || data?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(normalizeErrorMessage(msg));
  }

  if (options?.raw) return (res as any) as T;
  return (await res.json()) as T;
}

// 辅助函数：将File对象转换为base64字符串
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 返回完整的data URL格式 (data:image/png;base64,...)
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const api = {
  // ---------- auth ----------
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    setAuthToken(data.token);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  async me(): Promise<User> {
    return apiFetch<User>('/api/auth/me');
  },

  // === 新增：发送心跳 ===
  async sendHeartbeat(): Promise<void> {
    const token = getAuthToken();
    if (!token) return;

    // 注意：这里不需要抛出严重错误干扰UI，失败了通常意味着网络问题或token过期
    try {
      await apiFetch('/api/auth/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.warn('Heartbeat failed:', error);
    }
  },

  // ---------- models ----------
  async getModels(): Promise<ModelInfo[]> {
    return apiFetch<ModelInfo[]>('/api/models');
  },

  // ---------- settings ----------
  async getProviderSettings(): Promise<ProviderSettings> {
    return apiFetch<ProviderSettings>('/api/settings/provider');
  },

  async updateProviderSettings(payload: { providerHost: string; apiKey?: string }): Promise<ProviderSettings> {
    return apiFetch<ProviderSettings>('/api/settings/provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // ---------- generations ----------
  async listGenerations(params?: {
    type?: GenerationType;
    onlyFavorites?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Generation[]; total: number }> {
    const u = new URL(url('/api/generations'), window.location.origin);
    if (params?.type) u.searchParams.set('type', params.type);
    if (params?.onlyFavorites) u.searchParams.set('onlyFavorites', '1');
    if (typeof params?.limit === 'number') u.searchParams.set('limit', String(params.limit));
    if (typeof params?.offset === 'number') u.searchParams.set('offset', String(params.offset));

    const res = await fetch(u.toString(), {
      headers: (() => {
        const h = new Headers();
        const t = getAuthToken();
        if (t) h.set('Authorization', `Bearer ${t}`);
        return h;
      })(),
    });

    if (!res.ok) throw new Error(normalizeErrorMessage(`\u8bf7\u6c42\u5931\u8d25 (${res.status})`));
    return (await res.json()) as { items: Generation[]; total: number };
  },

  async getGeneration(id: string): Promise<Generation> {
    return apiFetch<Generation>(`/api/generations/${id}`);
  },

  async toggleFavorite(id: string): Promise<Generation> {
    return apiFetch<Generation>(`/api/generations/${id}/favorite`, { method: 'PATCH' });
  },

  async deleteGeneration(id: string): Promise<void> {
    await apiFetch(`/api/generations/${id}`, { method: 'DELETE' });
  },

  async generateImages(payload: {
    prompt: string;
    model: string;
    imageSize: string;
    aspectRatio: string;
    batch: number;
    // 有序的参考图列表，每项要么有 fileId，要么有 file (需转 base64)
    orderedReferences: Array<{ fileId?: string; file?: File }>;
  }): Promise<{ created: Generation[] }> {
    // 按顺序构建参考图列表：fileId 或 base64
    const referenceList: Array<{ type: 'fileId' | 'base64'; value: string }> = [];
    for (const ref of payload.orderedReferences || []) {
      if (ref.fileId) {
        referenceList.push({ type: 'fileId', value: ref.fileId });
      } else if (ref.file) {
        const base64 = await fileToBase64(ref.file);
        referenceList.push({ type: 'base64', value: base64 });
      }
    }

    // 使用JSON格式发送数据（有序参考图列表）
    return apiFetch<{ created: Generation[] }>('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: payload.prompt,
        model: payload.model,
        imageSize: payload.imageSize,
        aspectRatio: payload.aspectRatio,
        batch: payload.batch,
        referenceList: referenceList,
      }),
    });
  },

  async generateVideo(payload: {
    prompt: string;
    model: string;
    aspectRatio: string;
    duration: number;
    videoSize: 'small' | 'large';
    runId?: string;
    referenceFileIds?: string[];
    referenceUpload?: File | null;
  }): Promise<{ created: Generation; runId: string }> {
    // 将上传的文件转换为base64
    let referenceBase64 = '';
    if (payload.referenceUpload) {
      referenceBase64 = await fileToBase64(payload.referenceUpload);
    }

    // 使用JSON格式发送数据（包含base64图片）
    return apiFetch<{ created: Generation; runId: string }>('/api/generate/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: payload.prompt,
        model: payload.model,
        aspectRatio: payload.aspectRatio,
        duration: payload.duration,
        videoSize: payload.videoSize,
        runId: payload.runId,
        referenceFileIds: payload.referenceFileIds || [],
        referenceBase64: referenceBase64,
      }),
    });
  },

  // ---------- presets ----------
  async listPresets(): Promise<PromptPreset[]> {
    return apiFetch<PromptPreset[]>('/api/presets');
  },

  async createPreset(payload: { name: string; prompt: string }): Promise<PromptPreset> {
    return apiFetch<PromptPreset>('/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async deletePreset(id: string): Promise<void> {
    await apiFetch(`/api/presets/${id}`, { method: 'DELETE' });
  },

  // ---------- library ----------
  async listLibrary(kind?: LibraryKind): Promise<LibraryItem[]> {
    const u = new URL(url('/api/library'), window.location.origin);
    if (kind) u.searchParams.set('kind', kind);
    const token = getAuthToken();
    const res = await fetch(u.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(normalizeErrorMessage(`\u8bf7\u6c42\u5931\u8d25 (${res.status})`));
    return (await res.json()) as LibraryItem[];
  },

  async uploadLibraryItem(payload: { kind: LibraryKind; name: string; file: File }): Promise<LibraryItem> {
    const fd = new FormData();
    fd.append('kind', payload.kind);
    fd.append('name', payload.name);
    fd.append('file', payload.file);
    return apiFetch<LibraryItem>('/api/library', {
      method: 'POST',
      body: fd,
    });
  },

  async deleteLibraryItem(id: string): Promise<void> {
    await apiFetch(`/api/library/${id}`, { method: 'DELETE' });
  },

  // ---------- reference uploads ----------
  async listReferenceUploads(params?: { limit?: number }): Promise<ReferenceUpload[]> {
    const u = new URL(url('/api/reference-uploads'), window.location.origin);
    if (typeof params?.limit === 'number') u.searchParams.set('limit', String(params.limit));
    const token = getAuthToken();
    const res = await fetch(u.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(normalizeErrorMessage(`\u8bf7\u6c42\u5931\u8d25 (${res.status})`));
    return (await res.json()) as ReferenceUpload[];
  },

  async uploadReferenceUploads(files: File[]): Promise<ReferenceUpload[]> {
    const fd = new FormData();
    for (const file of files) {
      fd.append('files', file);
    }
    return apiFetch<ReferenceUpload[]>('/api/reference-uploads', {
      method: 'POST',
      body: fd,
    });
  },

  async deleteReferenceUpload(id: string): Promise<void> {
    await apiFetch(`/api/reference-uploads/${id}`, { method: 'DELETE' });
  },

  // ---------- video runs ----------
  async listVideoRuns(): Promise<VideoRun[]> {
    return apiFetch<VideoRun[]>('/api/video/runs');
  },

  async createVideoRun(payload: { name: string }): Promise<VideoRun> {
    return apiFetch<VideoRun>('/api/video/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  // ---------- admin ----------
  async adminListUsers(): Promise<AdminUserRow[]> {
    return apiFetch<AdminUserRow[]>('/api/admin/users');
  },

  async adminCreateUser(payload: { username: string; password: string; role: 'admin' | 'user' }): Promise<AdminUserRow> {
    return apiFetch<AdminUserRow>('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async adminDeleteUser(userId: string): Promise<void> {
    await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
  },

  async adminUpdateUserStatus(userId: string, disabled: boolean): Promise<AdminUserRow> {
    return apiFetch<AdminUserRow>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled }),
    });
  },

  async adminGetSettings(): Promise<AdminSettings> {
    return apiFetch<AdminSettings>('/api/admin/settings');
  },

  async adminUpdateSettings(payload: Partial<AdminSettings>): Promise<AdminSettings> {
    return apiFetch<AdminSettings>('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};

