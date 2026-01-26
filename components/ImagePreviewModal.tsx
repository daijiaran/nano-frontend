import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { Generation } from '../types';
import { buildFileUrl } from '../services/api';

const MODEL_LABELS: Record<string, string> = {
    'nano-banana-fast': 'nano banana flash',
    'nano-banana': 'nano banana',
    'nano-banana-pro': 'nano banana pro',
    'nano-banana-pro-vt': 'nano banana pro vt',
    'sora-2': 'sora 2',
};

interface ImagePreviewModalProps {
    open: boolean;
    generation: Generation | null;
    previewUrl?: string;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    hasPrev?: boolean;
    hasNext?: boolean;
}

export function ImagePreviewModal({
    open,
    generation,
    previewUrl,
    onClose,
    onPrev,
    onNext,
    hasPrev,
    hasNext,
}: ImagePreviewModalProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset zoom and position when generation changes
    useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [generation]);

    // Handle keyboard navigation
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case 'ArrowLeft':
                    if (hasPrev && onPrev) onPrev();
                    break;
                case 'ArrowRight':
                    if (hasNext && onNext) onNext();
                    break;
                case '+':
                case '=':
                    setScale((s) => Math.min(s + 0.25, 5));
                    break;
                case '-':
                    setScale((s) => Math.max(s - 0.25, 0.25));
                    break;
                case '0':
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, onPrev, onNext, hasPrev, hasNext]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale((s) => Math.min(Math.max(s + delta, 0.25), 5));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    }, [scale, position]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    if (!open || !generation) return null;

    // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
    const preview = previewUrl || (generation.outputFile?.id ? buildFileUrl(generation.outputFile.id) : undefined);
    const isVideo = generation.type === 'video';
    const elapsedLabel = typeof generation.elapsedSeconds === 'number' ? `${generation.elapsedSeconds}s` : '—';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm select-none"
            onClick={onClose}
            onDragStart={(e) => e.preventDefault()}
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-zinc-300 transition-colors hover:bg-white/20 hover:text-white"
                title="关闭 (Esc)"
            >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            {/* Navigation buttons */}
            {hasPrev && onPrev && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onPrev();
                    }}
                    className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-zinc-300 transition-colors hover:bg-white/20 hover:text-white"
                    title="上一张 (←)"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            )}
            {hasNext && onNext && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNext();
                    }}
                    className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-zinc-300 transition-colors hover:bg-white/20 hover:text-white"
                    title="下一张 (→)"
                >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            )}

            {/* Main content area */}
            <div
                ref={containerRef}
                className="relative flex h-[calc(100%-120px)] w-full max-w-[90%] items-center justify-center"
                onClick={(e) => e.stopPropagation()}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: scale > 1 && isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
            >
                {preview ? (
                    isVideo ? (
                        <video
                            src={preview}
                            className="max-h-full max-w-full rounded-lg shadow-2xl"
                            controls
                            autoPlay
                        />
                    ) : (
                        <img
                            src={preview}
                            alt="预览"
                            className="max-h-full max-w-full rounded-lg shadow-2xl transition-transform duration-200"
                            style={{
                                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                                pointerEvents: 'none',
                            }}
                            draggable={false}
                        />
                    )
                ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                        暂无预览
                    </div>
                )}
            </div>

            {/* Bottom toolbar */}
            <div
                className="absolute bottom-0 left-0 right-0 glass border-t border-white/10 p-4 z-20"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="truncate text-sm text-zinc-100" title={generation.prompt}>
                            {generation.prompt || '—'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <span className="rounded bg-white/5 px-2 py-0.5">{MODEL_LABELS[generation.model] || generation.model}</span>
                            {generation.imageSize && <span className="rounded bg-white/5 px-2 py-0.5">{generation.imageSize}</span>}
                            {generation.aspectRatio && <span className="rounded bg-white/5 px-2 py-0.5">{generation.aspectRatio}</span>}
                            <span className="rounded bg-white/5 px-2 py-0.5">耗时 {elapsedLabel}</span>
                        </div>
                    </div>

                    {/* Zoom controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))}
                            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/15"
                            title="缩小 (-)"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                        </button>
                        <div className="min-w-[60px] rounded-lg bg-white/5 px-3 py-2 text-center text-sm text-zinc-200">
                            {Math.round(scale * 100)}%
                        </div>
                        <button
                            onClick={() => setScale((s) => Math.min(s + 0.25, 5))}
                            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/15"
                            title="放大 (+)"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                setScale(1);
                                setPosition({ x: 0, y: 0 });
                            }}
                            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/15"
                            title="重置 (0)"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
