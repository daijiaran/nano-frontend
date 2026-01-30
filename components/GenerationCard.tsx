import React, { useEffect, useMemo, useState } from 'react';
import type { Generation } from '../types';
import { buildFileUrl, getAuthToken } from '../services/api';

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-zinc-200 ring-1 ring-white/10">
      {children}
    </span>
  );
}

const VIDEO_SIZE_LABELS: Record<string, string> = {
  small: '小尺寸',
  large: '大尺寸',
};
const MODEL_LABELS: Record<string, string> = {
  'nano-banana-fast': 'nano banana flash',
  'nano-banana': 'nano banana',
  'nano-banana-pro': 'nano banana pro',
  'nano-banana-pro-vt': 'nano banana pro vt',
  'sora-2': 'sora 2',
};
const FAILURE_REASON_LABELS: Record<string, string> = {
  output_moderation: '输出违规',
  input_moderation: '输入违规',
  error: '其他错误',
};

function normalizeErrorText(message?: string | null): string | null {
  if (!message) return null;
  if (/insufficient credits/i.test(message)) return 'API接口余额不足';
  return message;
}

function resolveFailureReason(g: Generation): string | null {
  const raw = g.failureReason || g.failure_reason;
  if (!raw) return null;
  return FAILURE_REASON_LABELS[raw] || raw;
}

function buildFailureText(g: Generation): string | null {
  const reasonText = resolveFailureReason(g);
  const errorText = normalizeErrorText(g.error);
  if (reasonText && errorText && reasonText !== errorText) {
    return `失败原因：${reasonText}（${errorText}）`;
  }
  if (reasonText) return `失败原因：${reasonText}`;
  if (errorText) return errorText;
  return null;
}

// 生成下载文件名：时间 + 扩展名
function generateDownloadFilename(g: Generation): string {
  // 格式化时间：2026/1/15 17:00:35 -> 2026-1-15_17-00-35
  const date = new Date(g.createdAt);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const timeStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  // 根据文件类型确定扩展名
  let ext = '.png';
  if (g.outputFile?.mimeType) {
    if (g.outputFile.mimeType.startsWith('video/')) {
      ext = '.mp4';
    } else if (g.outputFile.mimeType === 'image/jpeg' || g.outputFile.mimeType === 'image/jpg') {
      ext = '.jpg';
    } else if (g.outputFile.mimeType === 'image/png') {
      ext = '.png';
    }
  } else if (g.type === 'video') {
    ext = '.mp4';
  }

  return `${timeStr}${ext}`;
}

const handleDownload = async (g: Generation) => {
    if (!g.outputFile) return;
    try {
        const fileUrl = buildFileUrl(g.outputFile.id);
        const filename = generateDownloadFilename(g);
        const token = getAuthToken();
        const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};

        const res = await fetch(fileUrl, { headers });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (e) {
        console.error(e);
        alert('下载失败');
    }
};

export function GenerationCard(props: {
  generation: Generation;
  onRemix: (g: Generation) => void;
  onToggleFavorite: (g: Generation) => void;
  onDelete: (g: Generation) => void;
}) {
  const g = props.generation;

  // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
  const preview = g.outputFile?.id ? buildFileUrl(g.outputFile.id, { thumb: g.type !== 'video' }) : undefined;
  const isRunning = g.status === 'queued' || g.status === 'running';
  const failureText = g.status === 'failed' ? buildFailureText(g) : null;
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    if (!isRunning || typeof g.elapsedSeconds === 'number') return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, g.elapsedSeconds]);

  const elapsedSeconds = useMemo(() => {
    if (typeof g.elapsedSeconds === 'number') {
      return Math.max(0, Math.floor(g.elapsedSeconds));
    }
    if (typeof g.startedAt === 'number') {
      return Math.max(0, Math.floor((tick - g.startedAt) / 1000));
    }
    return null;
  }, [g.elapsedSeconds, g.startedAt, tick]);

  const elapsedLabel = elapsedSeconds === null ? null : `耗时 ${elapsedSeconds}s`;

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex gap-3 p-3">
        <div className="w-56 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 bg-black/20">
          {preview ? (
            g.type === 'video' ? (
              <video src={preview} className="h-36 w-full object-cover" controls />
            ) : (
              <img src={preview} className="h-36 w-full object-contain" alt="生成结果" />
            )
          ) : (
            <div className="flex h-36 w-full items-center justify-center bg-black/20 text-sm text-zinc-400">
              {isRunning ? '生成中…' : '暂无预览'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-zinc-400">创意描述</div>
              <div className="mt-1 text-sm text-zinc-100 line-clamp-2">{g.prompt || '—'}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Tag>{MODEL_LABELS[g.model] || g.model}</Tag>
                {g.type === 'image' ? (
                  <>
                    {g.imageSize ? <Tag>{g.imageSize}</Tag> : null}
                    {g.aspectRatio ? <Tag>{g.aspectRatio}</Tag> : null}
                  </>
                ) : (
                  <>
                    {g.aspectRatio ? <Tag>{g.aspectRatio}</Tag> : null}
                    {typeof g.duration === 'number' ? <Tag>{g.duration}秒</Tag> : null}
                    {g.videoSize ? <Tag>{VIDEO_SIZE_LABELS[g.videoSize] || g.videoSize}</Tag> : null}
                  </>
                )}
                {elapsedLabel ? <Tag>{elapsedLabel}</Tag> : null}
                {g.status === 'failed' ? <Tag>失败</Tag> : null}
              </div>
            </div>

            <button
              onClick={() => props.onToggleFavorite(g)}
              className="rounded-lg bg-white/5 px-2 py-1 text-sm text-zinc-200 hover:bg-white/10"
              title={g.favorite ? '取消收藏' : '收藏'}
            >
              {g.favorite ? '★' : '☆'}
            </button>
          </div>

          {failureText ? (
            <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
              {failureText}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => props.onRemix(g)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-white/15"
            >
              生成同款
            </button>

            {g.outputFile ? (
              <button
                onClick={() => handleDownload(g)}
                className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
              >
                下载
              </button>
            ) : (
              <button disabled className="rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-500">
                下载
              </button>
            )}

            <button
              onClick={() => props.onDelete(g)}
              className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20"
            >
              删除
            </button>

            <div className="ml-auto text-xs text-zinc-500">{new Date(g.createdAt).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
