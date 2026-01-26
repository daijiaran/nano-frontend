import React from 'react';
import type { Generation } from '../types';
import { buildFileUrl } from '../services/api';

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

// 生成下载文件名：prompt + 时间 + 扩展名
function generateDownloadFilename(g: Generation): string {
  // 获取 prompt，清理特殊字符
  let promptText = (g.prompt || 'untitled').trim();
  // 移除文件名不允许的字符
  promptText = promptText.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '_');
  // 限制长度
  if (promptText.length > 50) {
    promptText = promptText.substring(0, 50);
  }

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

  return `${promptText}_${timeStr}${ext}`;
}

export function VideoNodeCard(props: {
  generation: Generation;
  onRemix: (g: Generation) => void;
}) {
  const g = props.generation;
  // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
  const preview = g.outputFile?.id ? buildFileUrl(g.outputFile.id) : undefined;
  const isRunning = g.status === 'queued' || g.status === 'running';
  const failureText = g.status === 'failed' ? buildFailureText(g) : null;

  return (
    <div className="glass relative rounded-xl p-3 ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-zinc-400">节点 #{g.nodePosition ?? '-'}</div>
        <div className="text-[11px] text-zinc-500">{new Date(g.createdAt).toLocaleTimeString()}</div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg ring-1 ring-white/10">
        {preview ? (
          <video src={preview} className="h-28 w-full object-cover" controls />
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-black/20 text-xs text-zinc-400">
            {isRunning ? '生成中…' : '暂无预览'}
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-zinc-200 line-clamp-2" title={g.prompt}>
        {g.prompt || '—'}
      </div>

      {failureText ? (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-200">
          {failureText}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => props.onRemix(g)}
          className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-zinc-100 hover:bg-white/15"
        >
          同款
        </button>
        {g.outputFile ? (
          <a
            href={buildFileUrl(g.outputFile.id, { download: true, filename: generateDownloadFilename(g) })}
            className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
          >
            下载
          </a>
        ) : (
          <span className="text-[11px] text-zinc-500">—</span>
        )}
        <div className="ml-auto rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-zinc-200 ring-1 ring-white/10">
          {MODEL_LABELS[g.model] || g.model}
        </div>
      </div>
    </div>
  );
}
