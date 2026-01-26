import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Generation, ModelInfo, ReferenceItem } from '../types';
import { api, buildFileUrl } from '../services/api';
import { Spinner } from '../components/Spinner';
import { HistoryPickerModal } from '../components/HistoryPickerModal';
import { LibraryPickerModal } from '../components/LibraryPickerModal';
import { PromptPresetsModal } from '../components/PromptPresetsModal';
import { ImageGallery, ViewMode } from '../components/ImageGallery';
import { ImagePreviewModal } from '../components/ImagePreviewModal';

const ASPECT_OPTIONS = ['9:16', '16:9', '1:1', '4:3', '3:4'];
const DURATION_OPTIONS = [5, 10, 15];
const MODEL_LABELS: Record<string, string> = {
  'nano-banana-fast': 'nano banana flash',
  'nano-banana': 'nano banana',
  'nano-banana-pro': 'nano banana pro',
  'nano-banana-pro-vt': 'nano banana pro vt',
  'sora-2': 'sora 2',
};

type VideoDraft = {
  prompt: string;
  reference: ReferenceItem | null;
  modelId: string;
  aspectRatio: string;
  duration: number;
  videoSize: 'small' | 'large';
};

let videoDraft: VideoDraft | null = null;

function useObjectUrl(file?: File) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

function ReferenceThumb(props: {
  item: ReferenceItem;
  onRemove: () => void;
}) {
  const objectUrl = useObjectUrl(props.item.file);
  const src = objectUrl || props.item.previewUrl;

  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10">
      <img src={src} alt="参考图" className="h-16 w-16 object-cover" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
        className="absolute right-1 top-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs text-zinc-200 hover:bg-black/80"
      >
        ×
      </button>
    </div>
  );
}

export function VideoPage(props: {
  models: ModelInfo[];
  onOpenProviderSettings: () => void;
  getInitialReferenceFiles?: () => File[];
  slicerRefTrigger?: number;
}) {
  const videoModels = useMemo(() => (props.models || []).filter((m) => m.type === 'video'), [props.models]);

  const defaultModelId = videoModels.find(m => m.id === 'sora-2')?.id || videoModels[0]?.id || 'sora-2';

  const [prompt, setPrompt] = useState(() => videoDraft?.prompt || '');
  const [reference, setReference] = useState<ReferenceItem | null>(() => videoDraft?.reference || null);

  const [modelId, setModelId] = useState(() => videoDraft?.modelId || defaultModelId);
  const [aspectRatio, setAspectRatio] = useState(() => videoDraft?.aspectRatio || '16:9');
  const [duration, setDuration] = useState(() => videoDraft?.duration || 15);
  const [videoSize, setVideoSize] = useState<'small' | 'large'>(() => videoDraft?.videoSize || 'small');

  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [genTotal, setGenTotal] = useState(0);
  const [onlyFav, setOnlyFav] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View mode and preview states
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewGen, setPreviewGen] = useState<Generation | null>(null);

  // 处理从裁切工具传递过来的初始参考图
  useEffect(() => {
    if (!props.getInitialReferenceFiles) return;
    const files = props.getInitialReferenceFiles();
    const first = files[0];
    if (!first) return;

    setReference({ source: 'slicer', file: first, previewUrl: '', label: '裁切' });

    api
      .uploadReferenceUploads([first])
      .then((uploaded) => {
        const item = uploaded?.[0];
        if (!item?.file?.id) return;
        setReference({
          source: 'slicer',
          fileId: item.file.id,
          previewUrl: buildFileUrl(item.file.id, { thumb: true }),
          label: '裁切',
        });
      })
      .catch((e) => {
        console.error('Failed to upload reference image:', e);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slicerRefTrigger]);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [perPageSetting, setPerPageSetting] = useState(16);
  const perPage = perPageSetting;
  const totalPages = Math.max(1, Math.ceil(generations.length / perPage));
  const pagedGenerations = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return generations.slice(start, start + perPage);
  }, [currentPage, generations, perPage]);

  // 当 generations 变化时，确保页码有效
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode]);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  function handlePasteImages(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items || [];
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) {
          files.push(file);
        }
      }
    }
    if (files.length) {
      handleReferenceFiles(files);
    }
  }

  function handleReferenceFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const first = arr[0];
    if (!first) return;

    setReference({ source: 'upload', file: first, previewUrl: '', label: first.name });

    api
      .uploadReferenceUploads([first])
      .then((uploaded) => {
        const item = uploaded?.[0];
        if (!item?.file?.id) return;
        setReference({
          source: 'upload-history',
          fileId: item.file.id,
          previewUrl: buildFileUrl(item.file.id, { thumb: true }),
          label: item.file.filename || '参考上传',
        });
      })
      .catch((e) => {
        console.error('Failed to upload reference image:', e);
      });
  }

  async function loadGenerations() {
    const res = await api.listGenerations({ type: 'video', onlyFavorites: onlyFav, limit: 50, offset: 0 });
    setGenerations(res.items || []);
    setGenTotal(res.total || 0);
  }

  useEffect(() => {
    loadGenerations().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyFav]);

  // Poll running video tasks
  useEffect(() => {
    const hasRunning = (generations || []).some((g) => g.status === 'queued' || g.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(() => {
      loadGenerations().catch(() => null);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations]);

  // If model list changes after async load
  useEffect(() => {
    if (!videoModels.find((m) => m.id === modelId) && videoModels[0]) {
      setModelId(videoModels[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoModels]);

  useEffect(() => {
    videoDraft = {
      prompt,
      reference,
      modelId,
      aspectRatio,
      duration,
      videoSize,
    };
  }, [prompt, reference, modelId, aspectRatio, duration, videoSize]);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const referenceFileIds = reference?.fileId ? [reference.fileId] : [];
      const referenceUpload = reference?.file && !reference.fileId ? reference.file : null;

      const res = await api.generateVideo({
        prompt,
        model: modelId,
        aspectRatio,
        duration,
        videoSize,
        referenceFileIds,
        referenceUpload,
      });

      if (res?.created) {
        setGenerations((prev) => [res.created, ...(prev || [])]);
        setGenTotal((t) => t + 1);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function onRemix(g: Generation) {
    setPrompt(g.prompt || '');
    setModelId(g.model);
    setAspectRatio(g.aspectRatio || '16:9');
    if (typeof g.duration === 'number') setDuration(g.duration);
    if (g.videoSize) setVideoSize(g.videoSize);

    // pick first reference if any
    const firstRef = (g.referenceFileIds || [])[0];
    if (firstRef) {
      setReference({ source: 'history', fileId: firstRef, previewUrl: buildFileUrl(firstRef, { thumb: true }), label: '历史' });
    } else {
      setReference(null);
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleFavorite(g: Generation) {
    api
      .toggleFavorite(g.id)
      .then((updated) => {
        setGenerations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      })
      .catch(() => null);
  }

  async function deleteGeneration(g: Generation) {
    if (!confirm('确认删除该记录吗？')) return;
    setError(null);
    try {
      await api.deleteGeneration(g.id);
      setGenerations((prev) => prev.filter((x) => x.id !== g.id));
      setGenTotal((t) => Math.max(0, t - 1));
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  // 如果没有可用的视频模型，显示提示
  if (videoModels.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <div className="text-lg font-semibold text-yellow-200">暂无可用的视频生成模型</div>
          <p className="mt-2 text-sm text-yellow-300">
            请检查后端服务是否正常运行，或联系管理员配置模型。
          </p>
          <button
            onClick={props.onOpenProviderSettings}
            className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/20"
          >
            接口设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        {/* Left */}
        <div className="w-full min-h-0 overflow-auto border-b border-white/5 p-6 custom-scrollbar lg:w-[45%] lg:min-w-[420px] lg:max-w-[680px] lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <div className="text-sm font-semibold text-zinc-100">视频生成</div>
            <div className="mt-2 h-px w-10 bg-white/30" />
          </div>

          {/* Reference */}
          <div
            className="glass rounded-2xl p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer?.files?.length) {
                handleReferenceFiles(e.dataTransfer.files);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">参考图（可选）</div>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                  {reference ? '1/1' : '0/1'}
                </div>
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                >
                  历史
                </button>
                <button
                  onClick={() => setLibraryOpen(true)}
                  className="rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                >
                  从库选择
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-3">
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-400 hover:bg-black/30"
                title="上传参考图"
              >
                +
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleReferenceFiles(e.target.files);
                  }
                  e.currentTarget.value = '';
                }}
              />

              <div className="flex flex-wrap gap-2">
                {reference && (
                  <ReferenceThumb
                    item={reference}
                    onRemove={() => setReference(null)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div className="mt-4 glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">提示词</div>
              <button
                onClick={() => setPresetsOpen(true)}
                className="rounded-lg bg-white/5 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
                title="提示词预设"
              >
                预设
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={handlePasteImages}
              placeholder="描述你要生成的视频场景、风格与镜头"
              className="mt-3 h-52 w-full resize-none rounded-xl bg-black/30 p-3 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20 custom-scrollbar"
            />
            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          {/* Options */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">模型</div>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              >
                {videoModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {MODEL_LABELS[m.id] || m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">比例</div>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              >
                {ASPECT_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">时长</div>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}秒
                  </option>
                ))}
              </select>
            </div>

            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">尺寸</div>
              <select
                value={videoSize}
                onChange={(e) => setVideoSize(e.target.value as any)}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              >
                <option value="small">小尺寸</option>
                <option value="large">大尺寸</option>
              </select>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={props.onOpenProviderSettings}
              className="rounded-xl bg-white/5 px-3 py-3 text-sm text-zinc-200 hover:bg-white/10"
            >
              接口设置
            </button>

            <button
              onClick={generate}
              disabled={loading || !prompt.trim()}
              className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white/15 px-6 py-3 text-sm font-semibold hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? <Spinner size={16} /> : null}
              生成
            </button>
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 flex flex-col">
          {/* 固定在顶部的控制栏 */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
                仅收藏
              </label>
              <div className="text-xs text-zinc-500">共 {genTotal} 条</div>
            </div>

            <div className="flex items-center gap-3">
              {/* 每页数量选择 */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">每页</span>
                <select
                  value={perPageSetting}
                  onChange={(e) => {
                    setPerPageSetting(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-md bg-zinc-800 pl-2 pr-6 py-1.5 text-xs text-zinc-200 outline-none border border-white/10 focus:border-white/20 cursor-pointer"
                >
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={24}>24</option>
                  <option value={32}>32</option>
                  <option value={48}>48</option>
                </select>
              </div>

              {/* 分隔线 */}
              <div className="h-4 w-px bg-white/10" />

              {/* 分页控件 */}
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-md bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-xs text-zinc-400 min-w-[60px] text-center">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-md bg-white/5 px-2 py-1.5 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                下一页
              </button>
              {/* 刷新按钮 */}
              <button
                onClick={loadGenerations}
                className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
              >
                刷新
              </button>
            </div>
          </div>

          {/* 可滚动的内容区域 */}
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
            <ImageGallery
              generations={pagedGenerations}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onPreview={setPreviewGen}
              onRemix={onRemix}
              onToggleFavorite={toggleFavorite}
              onDelete={deleteGeneration}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Video Preview Modal */}
      <ImagePreviewModal
        open={!!previewGen}
        generation={previewGen}
        onClose={() => setPreviewGen(null)}
        hasPrev={previewGen ? generations.findIndex((g) => g.id === previewGen.id) > 0 : false}
        hasNext={previewGen ? generations.findIndex((g) => g.id === previewGen.id) < generations.length - 1 : false}
        onPrev={() => {
          if (!previewGen) return;
          const idx = generations.findIndex((g) => g.id === previewGen.id);
          if (idx > 0) setPreviewGen(generations[idx - 1]);
        }}
        onNext={() => {
          if (!previewGen) return;
          const idx = generations.findIndex((g) => g.id === previewGen.id);
          if (idx < generations.length - 1) setPreviewGen(generations[idx + 1]);
        }}
      />

      <HistoryPickerModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(fileIds) => {
          const fid = fileIds[0];
          if (!fid) return;
          setReference({ source: 'history', fileId: fid, previewUrl: buildFileUrl(fid, { thumb: true }), label: '历史' });
        }}
        maxSelectable={1}
      />

      <LibraryPickerModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(fileIds) => {
          const fid = fileIds[0];
          if (!fid) return;
          setReference({ source: 'library', fileId: fid, previewUrl: buildFileUrl(fid, { thumb: true }), label: '参考库' });
        }}
        maxSelectable={1}
      />

      <PromptPresetsModal
        open={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        currentPrompt={prompt}
        onApply={(p) => setPrompt(p)}
      />
    </div>
  );
}
