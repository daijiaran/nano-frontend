import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Generation } from '../types';
import { buildFileUrl } from '../services/api';

const MODEL_LABELS: Record<string, string> = {
    'nano-banana-fast': 'nano banana flash',
    'nano-banana': 'nano banana',
    'nano-banana-pro': 'nano banana pro',
    'nano-banana-pro-vt': 'nano banana pro vt',
    'sora-2': 'sora 2',
};

// 生成下载文件名
function generateDownloadFilename(g: Generation): string {
    let promptText = (g.prompt || 'untitled').trim();
    promptText = promptText.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '_');
    if (promptText.length > 50) {
        promptText = promptText.substring(0, 50);
    }

    const date = new Date(g.createdAt);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const timeStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

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

export type ViewMode = 'grid' | 'list';

interface ImageGalleryProps {
    generations: Generation[];
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onPreview: (g: Generation) => void;
    onRemix: (g: Generation) => void;
    onToggleFavorite: (g: Generation) => void;
    onDelete: (g: Generation) => void;
}

// Grid item component - 平铺样式
const GridItem: React.FC<{
    generation: Generation;
    onPreview: (g: Generation) => void;
    onRemix: (g: Generation) => void;
    onToggleFavorite: (g: Generation) => void;
    onDelete: (g: Generation) => void;
}> = ({
    generation,
    onPreview,
    onRemix,
    onToggleFavorite,
    onDelete,
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showError, setShowError] = useState(false);
    const g = generation;
    // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
    const preview = g.outputFile?.id ? buildFileUrl(g.outputFile.id, { thumb: g.type !== 'video' }) : undefined;
    const isRunning = g.status === 'queued' || g.status === 'running';
    const isFailed = g.status === 'failed';
    const elapsedLabel = typeof g.elapsedSeconds === 'number' ? `${g.elapsedSeconds}s` : '—';
    const errorMessage = g.error || g.failureReason || g.failure_reason || '未知错误';

    // 无预览时的状态文字（失败优先）
    const noPreviewText = isFailed ? '生成失败' : isRunning ? '生成中…' : '暂无预览';

    // 复制提示词功能
    const copyPrompt = async () => {
        if (!g.prompt) return;
        try {
            // 优先使用现代 Clipboard API
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(g.prompt);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } else {
                // 回退到传统方法
                const textarea = document.createElement('textarea');
                textarea.value = g.prompt;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                
                if (success) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } else {
                    console.error('复制失败: execCommand 返回 false');
                }
            }
        } catch (err) {
            console.error('复制失败:', err);
        }
    };

    return (
        <div
            className="group relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ zIndex: isHovered ? 40 : 1 }}
        >
            {/* Image container */}
            <div
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-300 cursor-pointer"
                onClick={() => preview && onPreview(g)}
                style={{
                    transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                    boxShadow: isHovered ? '0 20px 40px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.2)',
                }}
            >
                {/* Image */}
                <div className="absolute inset-0 bg-black/30">
                    {preview ? (
                        g.type === 'video' ? (
                            <video
                                src={preview}
                                className="h-full w-full object-cover transition-transform duration-500"
                                style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)' }}
                                muted
                                loop
                                playsInline
                                onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                                onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                            />
                        ) : (
                            <img
                                src={preview}
                                alt={g.prompt || '生成图片'}
                                className="h-full w-full object-cover transition-transform duration-500"
                                style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)' }}
                                draggable={false}
                            />
                        )
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                            {isRunning ? (
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                                    <span>{noPreviewText}</span>
                                </div>
                            ) : (
                                <span className={isFailed ? 'text-red-400' : ''}>{noPreviewText}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Status indicator - only show when has preview */}
                {preview && isFailed && (
                    <div className="absolute left-2 top-2 rounded-full bg-red-500/80 px-2 py-0.5 text-xs text-white">
                        失败
                    </div>
                )}
                {preview && isRunning && (
                    <div className="absolute left-2 top-2 rounded-full bg-blue-500/80 px-2 py-0.5 text-xs text-white">
                        生成中
                    </div>
                )}

                {/* 失败错误提示按钮 */}
                {isFailed && (
                    <button
                        className="absolute left-2 top-2 rounded-lg bg-red-500/80 p-1.5 text-white transition-colors hover:bg-red-500 z-10"
                        onMouseEnter={() => setShowError(true)}
                        onMouseLeave={() => setShowError(false)}
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </button>
                )}

                {/* Favorite button - always visible */}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(g);
                    }}
                    className="absolute right-2 top-2 rounded-lg bg-black/40 p-1.5 text-zinc-200 transition-colors hover:bg-black/60"
                    title={g.favorite ? '取消收藏' : '收藏'}
                >
                    {g.favorite ? (
                        <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                    ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    )}
                </button>

                {/* ID label at bottom - only visible when not hovered */}
                <div
                    className="absolute bottom-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-zinc-400 transition-opacity duration-300"
                    style={{ opacity: isHovered ? 0 : 1 }}
                >
                    {g.id.slice(0, 8)}
                </div>
            </div>

            {/* 错误信息浮窗 - 放在外层避免被overflow-hidden裁剪 */}
            {isFailed && showError && (
                <div 
                    className="absolute left-2 top-8 z-[100] pointer-events-none"
                    onMouseEnter={() => setShowError(true)}
                >
                    <div className="w-64 rounded-lg bg-red-500/95 backdrop-blur-sm p-3 text-xs text-white shadow-2xl whitespace-normal break-words">
                        {errorMessage}
                    </div>
                </div>
            )}

            {/* Hover info panel - displays BELOW the image */}
            <div
                className="absolute left-0 right-0 top-full mt-1 rounded-xl overflow-hidden transition-all duration-300 origin-top"
                style={{
                    opacity: isHovered ? 1 : 0,
                    transform: isHovered ? 'scaleY(1)' : 'scaleY(0)',
                    pointerEvents: isHovered ? 'auto' : 'none',
                }}
            >
                <div className="bg-black/90 backdrop-blur-md p-3 rounded-xl ring-1 ring-white/10">
                    {/* Prompt */}
                    <div className="line-clamp-2 text-xs text-zinc-100 mb-2" title={g.prompt}>
                        {g.prompt || '—'}
                    </div>

                    {/* Debug info tags */}
                    <div className="flex flex-wrap gap-1 mb-2">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            {MODEL_LABELS[g.model] || g.model}
                        </span>
                        {g.imageSize && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                {g.imageSize}
                            </span>
                        )}
                        {g.aspectRatio && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                                {g.aspectRatio}
                            </span>
                        )}
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            {elapsedLabel}
                        </span>
                    </div>

                    {/* Action buttons - 分两行显示 */}
                    <div className="space-y-1.5">
                        {/* 第一行：生成同款 */}
                        <button
                            onClick={() => onRemix(g)}
                            className="w-full rounded-lg bg-white/15 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/25"
                        >
                            生成同款
                        </button>
                        {/* 第二行：图标按钮 */}
                        <div className="flex gap-1.5">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    copyPrompt();
                                }}
                                className="flex-1 flex items-center justify-center rounded-lg bg-white/10 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/20"
                                title={copied ? '已复制!' : '复制提示词'}
                            >
                                {copied ? (
                                    <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                )}
                            </button>
                             {g.outputFile && (
                                <a
                                    href={buildFileUrl(g.outputFile.id, { download: true, filename: generateDownloadFilename(g) })}
                                    className="flex-1 flex items-center justify-center rounded-lg bg-white/10 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/20"
                                    title="下载"
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </a>
                            )}
                            <button
                                onClick={() => onDelete(g)}
                                className="flex-1 flex items-center justify-center rounded-lg bg-red-500/20 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/30"
                                title="删除"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


// List item component - 列表样式
const ListItem: React.FC<{
    generation: Generation;
    onPreview: (g: Generation) => void;
    onRemix: (g: Generation) => void;
    onToggleFavorite: (g: Generation) => void;
    onDelete: (g: Generation) => void;
}> = ({
    generation,
    onPreview,
    onRemix,
    onToggleFavorite,
    onDelete,
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [showError, setShowError] = useState(false);
    const g = generation;
    // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
    const preview = g.outputFile?.id ? buildFileUrl(g.outputFile.id, { thumb: g.type !== 'video' }) : undefined;
    const isRunning = g.status === 'queued' || g.status === 'running';
    const isFailed = g.status === 'failed';
    const elapsedLabel = typeof g.elapsedSeconds === 'number' ? `${g.elapsedSeconds}s` : '—';
    const errorMessage = g.error || g.failureReason || g.failure_reason || '未知错误';

    return (
        <div
            className="group glass flex gap-4 rounded-xl p-3 transition-all duration-300 relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                boxShadow: isHovered ? '0 10px 30px rgba(0,0,0,0.3)' : 'none',
                zIndex: isFailed ? 30 : 1,
            }}
        >
            {/* Thumbnail */}
            <div
                className="relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/10"
                onClick={() => preview && onPreview(g)}
            >
                {preview ? (
                    g.type === 'video' ? (
                        <video
                            src={preview}
                            className="h-full w-full object-cover transition-transform duration-500"
                            style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)' }}
                            muted
                            loop
                            playsInline
                            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                            onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                        />
                    ) : (
                        <img
                            src={preview}
                            alt={g.prompt || '生成图片'}
                            className="h-full w-full object-cover transition-transform duration-500"
                            style={{ transform: isHovered ? 'scale(1.1)' : 'scale(1)' }}
                        />
                    )
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-black/30 text-xs text-zinc-400">
                        {isRunning && (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                        )}
                    </div>
                )}

                {/* Status badge - 失败时显示红色背景和感叹号 */}
                {isFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/30">
                        <button 
                            className="flex flex-col items-center gap-1 cursor-help"
                            onMouseEnter={() => setShowError(true)}
                            onMouseLeave={() => setShowError(false)}
                        >
                            <div className="rounded-full bg-red-500 p-1.5">
                                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <span className="text-xs text-red-200">失败</span>
                        </button>
                    </div>
                )}

                {/* Click to preview overlay */}
                {preview && (
                    <div
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    >
                        <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </div>
                )}
            </div>

            {/* 错误信息浮窗 - 放在thumbnail外层避免被overflow裁剪 */}
            {isFailed && showError && (
                <div 
                    className="absolute left-32 top-1/2 -translate-y-1/2 z-[100] pointer-events-none"
                    onMouseEnter={() => setShowError(true)}
                >
                    <div className="w-72 rounded-lg bg-red-500/95 backdrop-blur-sm p-3 text-xs text-white shadow-2xl whitespace-normal break-words">
                        <div className="font-semibold mb-1">错误信息：</div>
                        {errorMessage}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm text-zinc-100">{g.prompt || '—'}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10">
                                {MODEL_LABELS[g.model] || g.model}
                            </span>
                            {g.imageSize && (
                                <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10">
                                    {g.imageSize}
                                </span>
                            )}
                            {g.aspectRatio && (
                                <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10">
                                    {g.aspectRatio}
                                </span>
                            )}
                            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10">
                                耗时 {elapsedLabel}
                            </span>
                        </div>
                    </div>

                    {/* Favorite button */}
                    <button
                        onClick={() => onToggleFavorite(g)}
                        className="shrink-0 rounded-lg bg-white/5 p-1.5 text-zinc-200 transition-colors hover:bg-white/10"
                        title={g.favorite ? '取消收藏' : '收藏'}
                    >
                        {g.favorite ? (
                            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                        ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                    <button
                        onClick={() => onRemix(g)}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/15"
                    >
                        生成同款
                    </button>
                    {g.outputFile && (
                        <a
                            href={buildFileUrl(g.outputFile.id, { download: true, filename: generateDownloadFilename(g) })}
                            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/10"
                        >
                            下载
                        </a>
                    )}
                    <button
                        onClick={() => onDelete(g)}
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/20"
                    >
                        删除
                    </button>
                    <div className="ml-auto text-xs text-zinc-500">
                        {new Date(g.createdAt).toLocaleString()}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ImageGallery({
    generations,
    viewMode,
    onViewModeChange,
    onPreview,
    onRemix,
    onToggleFavorite,
    onDelete,
    // 新增：外部控制分页
    currentPage,
    totalPages,
    onPageChange,
}: ImageGalleryProps & {
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
}) {
    // 内部分页状态（当外部未提供时使用）
    const [internalPage, setInternalPage] = useState(1);
    const [gridColumns, setGridColumns] = useState(4);
    const gridRef = useRef<HTMLDivElement | null>(null);

    // 判断是否使用外部分页控制
    const isExternalPagination = currentPage !== undefined && totalPages !== undefined && onPageChange !== undefined;

    useEffect(() => {
        if (viewMode !== 'grid') return;
        const updateColumns = () => {
            if (!gridRef.current) return;
            const style = window.getComputedStyle(gridRef.current);
            const cols = style.gridTemplateColumns.split(' ').length;
            if (cols > 0) setGridColumns(cols);
        };
        updateColumns();
        window.addEventListener('resize', updateColumns);
        return () => window.removeEventListener('resize', updateColumns);
    }, [viewMode, generations.length]);

    useEffect(() => {
        if (!isExternalPagination) {
            setInternalPage(1);
        }
    }, [viewMode, isExternalPagination]);

    const perPage = viewMode === 'grid' ? Math.max(1, gridColumns * 4) : 20;

    // 如果是外部分页，直接使用传入的 generations（已经分页过了）
    // 如果是内部分页，需要自己计算
    const actualTotalPages = isExternalPagination ? totalPages : Math.max(1, Math.ceil(generations.length / perPage));
    const actualCurrentPage = isExternalPagination ? currentPage : Math.min(internalPage, actualTotalPages);

    const pageItems = useMemo(() => {
        if (isExternalPagination) {
            // 外部分页：直接使用传入的数据
            return generations;
        }
        // 内部分页：自己切片
        const start = (actualCurrentPage - 1) * perPage;
        return generations.slice(start, start + perPage);
    }, [isExternalPagination, actualCurrentPage, generations, perPage]);

    useEffect(() => {
        if (!isExternalPagination && internalPage !== actualCurrentPage) {
            setInternalPage(actualCurrentPage);
        }
    }, [actualCurrentPage, internalPage, isExternalPagination]);

    // 内部分页的页面切换处理
    const handlePrevPage = () => {
        if (isExternalPagination) {
            onPageChange(Math.max(1, currentPage - 1));
        } else {
            setInternalPage((p) => Math.max(1, p - 1));
        }
    };

    const handleNextPage = () => {
        if (isExternalPagination) {
            onPageChange(Math.min(totalPages, currentPage + 1));
        } else {
            setInternalPage((p) => Math.min(actualTotalPages, p + 1));
        }
    };

    // 是否显示内部分页控件（仅当外部未控制分页时显示）
    const showInternalPagination = !isExternalPagination;

    return (
        <div className="h-full">
            {/* View mode toggle */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-400">显示方式：</span>
                <div className="flex rounded-lg bg-white/5 p-0.5">
                    <button
                        onClick={() => onViewModeChange('grid')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${viewMode === 'grid'
                            ? 'bg-white/15 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        title="平铺显示"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        平铺
                    </button>
                    <button
                        onClick={() => onViewModeChange('list')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${viewMode === 'list'
                            ? 'bg-white/15 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        title="列表显示"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        列表
                    </button>
                </div>
                {/* 仅当内部分页时显示分页控件 */}
                {showInternalPagination && (
                    <div className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
                        <button
                            onClick={handlePrevPage}
                            disabled={actualCurrentPage <= 1}
                            className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                        >
                            上一页
                        </button>
                        <span className="text-[11px] text-zinc-400">
                            {actualCurrentPage} / {actualTotalPages}
                        </span>
                        <button
                            onClick={handleNextPage}
                            disabled={actualCurrentPage >= actualTotalPages}
                            className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                        >
                            下一页
                        </button>
                    </div>
                )}
            </div>

            {/* Content */}
            {generations.length === 0 ? (
                <div className="flex h-[calc(100%-60px)] items-center justify-center text-sm text-zinc-400">
                    暂无作品
                </div>
            ) : viewMode === 'grid' ? (
                <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {pageItems.map((g) => (
                        <GridItem
                            key={g.id}
                            generation={g}
                            onPreview={onPreview}
                            onRemix={onRemix}
                            onToggleFavorite={onToggleFavorite}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {pageItems.map((g) => (
                        <ListItem
                            key={g.id}
                            generation={g}
                            onPreview={onPreview}
                            onRemix={onRemix}
                            onToggleFavorite={onToggleFavorite}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
