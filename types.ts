export type GenerationType = 'image' | 'video';

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export interface ModelInfo {
  id: string;
  name: string;
  type: GenerationType;
  supportsImageSize?: boolean;
  supportsAspectRatio?: boolean;
  tags?: string[];
}

export interface StoredFile {
  id: string;
  mimeType: string;
  url: string;
  filename?: string;
  createdAt: number;
}

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface Generation {
  id: string;
  type: GenerationType;
  prompt: string;
  model: string;
  status: GenerationStatus;
  createdAt: number;
  updatedAt: number;
  progress?: number;
  startedAt?: number;
  elapsedSeconds?: number;
  error?: string;
  favorite?: boolean;
  failureReason?: string;
  failure_reason?: string;

  // image params
  imageSize?: string;
  aspectRatio?: string;

  // video params
  duration?: number;
  videoSize?: 'small' | 'large';

  outputFile?: StoredFile | null;
  referenceFileIds?: string[];
  // video graph
  runId?: string;
  nodePosition?: number;

}

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: number;
}

export type LibraryKind = 'role' | 'scene';

export interface LibraryItem {
  id: string;
  name: string;
  kind: LibraryKind;
  file: StoredFile;
  createdAt: number;
}

export interface ProviderSettings {
  providerHost: string;
  hasApiKey: boolean;
}

export interface AdminSettings {
  fileRetentionHours: number;
  referenceHistoryLimit: number;
  imageTimeoutSeconds: number;
  videoTimeoutSeconds: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
}

export interface VideoRun {
  id: string;
  name: string;
  createdAt: number;
}

export interface VideoNode {
  id: string;
  runId: string;
  generationId: string;
  position: number;
}

export type ReferenceSource = 'upload' | 'history' | 'library' | 'upload-history' | 'slicer';

export interface ReferenceItem {
  source: ReferenceSource;
  // for uploads
  file?: File;
  // for history/library
  fileId?: string;

  previewUrl: string;
  label?: string;
}

export interface ReferenceUpload {
  id: string;
  createdAt: number;
  file?: StoredFile | null;
  originalName?: string; // 原始文件名，用于匹配上传的文件
}

// 影视审阅系统相关类型
export interface ReviewProject {
  id: string;
  name: string;
  userId: string;
  coverFileId?: string;
  episodeCount?: number;
  createdAt: number;
}

export interface ReviewEpisode {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  coverFileId?: string;
  storyboardCount?: number;
  createdAt: number;
}

export interface ReviewStoryboard {
  id: string;
  episodeId: string;
  userId: string;
  name: string;
  imageFileId: string;
  imageUrl?: string; // 后端返回的完整URL或通过FileID构建
  status: 'pending' | 'approved' | 'rejected';
  feedback?: string;
  sortOrder: number;
  createdAt: number;
}
