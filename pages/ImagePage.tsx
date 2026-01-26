import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Generation, ModelInfo, ReferenceItem } from '../types';
import { api, buildFileUrl } from '../services/api';
import { HistoryPickerModal } from '../components/HistoryPickerModal';
import { LibraryPickerModal } from '../components/LibraryPickerModal';
import { PromptPresetsModal } from '../components/PromptPresetsModal';
import { ImageGallery, ViewMode } from '../components/ImageGallery';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { Spinner } from '../components/Spinner';

const MAX_REFS = 14;
const MAX_BATCH = 12;

const ASPECT_OPTIONS = ['auto', '1:1', '3:4', '4:3', '9:16', '16:9'];
const SIZE_OPTIONS = ['1K', '2K', '4K'];
const MODEL_LABELS: Record<string, string> = {
  'nano-banana-fast': 'nano banana flash',
  'nano-banana': 'nano banana',
  'nano-banana-pro': 'nano banana pro',
  'nano-banana-pro-vt': 'nano banana pro vt',
  'sora-2': 'sora 2',
};

type ImageDraft = {
  prompt: string;
  refs: ReferenceItem[];
  modelId: string;
  aspectRatio: string;
  imageSize: string;
  batch: number;
};

let imageDraft: ImageDraft | null = null;

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
  index: number;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const objectUrl = useObjectUrl(props.item.file);
  const src = objectUrl || props.item.previewUrl;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ring-1 ring-white/10 cursor-grab active:cursor-grabbing transition-transform ${props.isDragging ? 'opacity-50 scale-95' : ''}`}
      draggable
      onDragStart={(e) => props.onDragStart(e, props.index)}
      onDragOver={props.onDragOver}
      onDrop={(e) => props.onDrop(e, props.index)}
      onDragEnd={props.onDragEnd}
    >
      <img src={src} alt="参考图" className="h-16 w-16 object-cover" />
      {/* 序号标签 */}
      <div className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white">
        #{props.index + 1}
      </div>
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

export function ImagePage(props: {
  models: ModelInfo[];
  onOpenProviderSettings: () => void;
  getInitialReferenceFiles?: () => File[];
  slicerRefTrigger?: number;
}) {
  const imageModels = useMemo(() => (props.models || []).filter((m) => m.type === 'image'), [props.models]);

  const defaultModelId = imageModels.find(m => m.id === 'nano-banana-pro')?.id || imageModels[0]?.id || 'nano-banana-pro';

  const [prompt, setPrompt] = useState(() => imageDraft?.prompt || '');
  const [refs, setRefs] = useState<ReferenceItem[]>(() => imageDraft?.refs || []);

  // 处理从裁切工具传递过来的初始参考图
  useEffect(() => {
    if (props.getInitialReferenceFiles) {
      const files = props.getInitialReferenceFiles();
      if (files.length === 0) return;

      const toAdd = files.slice(0, MAX_REFS);

      const next: ReferenceItem[] = toAdd.map((f) => ({
        source: 'slicer' as const,
        file: f,
        previewUrl: '',
        label: '裁切',
      }));
      setRefs(next);

      // 上传参考图到服务器
      api
        .uploadReferenceUploads(toAdd)
        .then((uploaded) => {
          const fileNameToResponse = new Map<string, { fileId: string; previewUrl: string }>();
          uploaded?.forEach((item) => {
            const fileName = item.originalName || item.file?.filename || '';
            if (fileName && item?.file?.id) {
              fileNameToResponse.set(fileName, {
                fileId: item.file.id,
                previewUrl: buildFileUrl(item.file.id, { thumb: true }),
              });
            }
          });

          setRefs((prev) =>
            prev.map((item) => {
              if (item.file) {
                const fileName = item.file.name;
                const info = fileNameToResponse.get(fileName);
                if (info) {
                  return {
                    ...item,
                    source: 'slicer' as const,
                    fileId: info.fileId,
                    previewUrl: info.previewUrl,
                    file: undefined,
                    label: '裁切',
                  };
                }
              }
              return item;
            })
          );
        })
        .catch((e) => {
          console.error('Failed to upload reference images:', e);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slicerRefTrigger]); // 当 trigger 变化时重新检查

  const [modelId, setModelId] = useState(() => imageDraft?.modelId || defaultModelId);
  const selectedModel = useMemo(() => imageModels.find((m) => m.id === modelId), [imageModels, modelId]);

  const [aspectRatio, setAspectRatio] = useState(() => imageDraft?.aspectRatio || '16:9');
  const [imageSize, setImageSize] = useState(() => imageDraft?.imageSize || '2K');
  const [batch, setBatch] = useState(() => imageDraft?.batch || 2);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const [onlyFav, setOnlyFav] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [genTotal, setGenTotal] = useState(0);

  // View mode and preview states
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewGen, setPreviewGen] = useState<Generation | null>(null);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [perPageSetting, setPerPageSetting] = useState(16); // 每页数量设置
  const perPage = perPageSetting;
  const totalPages = Math.max(1, Math.ceil(generations.length / perPage));
  const pagedGenerations = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return generations.slice(start, start + perPage);
  }, [currentPage, generations, perPage]);

  // 当 generations 变化或切换视图模式时，确保页码有效
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 拖拽排序状态
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 设置自定义标识，用于区分内部排序拖拽和外部文件拖拽
    e.dataTransfer.setData('application/x-ref-reorder', String(index));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡到外层的 handleDropRefs

    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      return;
    }

    setRefs((prev) => {
      const copy = [...prev];
      const [dragged] = copy.splice(dragIndex, 1);
      copy.splice(dropIndex, 0, dragged);
      return copy;
    });
    setDragIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  async function loadGenerations() {
    const res = await api.listGenerations({ type: 'image', onlyFavorites: onlyFav, limit: 50, offset: 0 });
    setGenerations(res.items);
    setGenTotal(res.total);
  }

  useEffect(() => {
    loadGenerations().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyFav]);

  // Poll running tasks
  useEffect(() => {
    const hasRunning = (generations || []).some((g) => g.status === 'queued' || g.status === 'running');
    if (!hasRunning) return;
    const t = setInterval(() => {
      loadGenerations().catch(() => null);
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations]);

  // If model list changes after async load
  useEffect(() => {
    if (!imageModels.find((m) => m.id === modelId) && imageModels[0]) {
      setModelId(imageModels[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageModels]);

  useEffect(() => {
    imageDraft = {
      prompt,
      refs,
      modelId,
      aspectRatio,
      imageSize,
      batch,
    };
  }, [prompt, refs, modelId, aspectRatio, imageSize, batch]);

  function addUploads(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const remaining = MAX_REFS - refs.length;
    const toAdd = arr.slice(0, Math.max(0, remaining));
    if (toAdd.length === 0) return;

    const next: ReferenceItem[] = toAdd.map((f) => ({
      source: 'upload',
      file: f,
      previewUrl: '',
      label: f.name,
    }));
    setRefs((prev) => [...prev, ...next]);

    api
      .uploadReferenceUploads(toAdd)
      .then((uploaded) => {
        // 使用文件名匹配响应，而不是索引，这样即使某些文件上传失败也能正确匹配
        const fileNameToResponse = new Map<string, { fileId: string; previewUrl: string }>();
        uploaded?.forEach((item) => {
          // 使用 originalName 或 file.filename 来匹配
          const fileName = item.originalName || item.file?.filename || '';
          if (fileName && item?.file?.id) {
            // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
            fileNameToResponse.set(fileName, {
              fileId: item.file.id,
              previewUrl: buildFileUrl(item.file.id, { thumb: true }),
            });
          }
        });

        setRefs((prev) =>
          prev.map((item) => {
            if (item.file) {
              // 使用文件名匹配
              const fileName = item.file.name;
              const info = fileNameToResponse.get(fileName);
              if (info) {
                return {
                  ...item,
                  source: 'upload-history',
                  fileId: info.fileId,
                  previewUrl: info.previewUrl,
                  file: undefined,
                };
              }
            }
            return item;
          })
        );
      })
      .catch((e) => {
        console.error('Failed to upload reference images:', e);
      });
  }

  function removeRef(idx: number) {
    setRefs((prev) => {
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  }

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
      addUploads(files);
    }
  }

  function handleDropRefs(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();

    // 如果是内部排序拖拽（dragIndex 不为 null），不处理为新增文件
    if (dragIndex !== null) {
      setDragIndex(null);
      return;
    }

    // 只有当有外部文件时才添加
    if (e.dataTransfer?.files?.length) {
      addUploads(e.dataTransfer.files);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);

    try {
      // 按顺序构建参考图列表，保持用户排序
      const orderedReferences = refs.map((r) => ({
        fileId: r.fileId,
        file: !r.fileId ? r.file : undefined,
      }));

      const res = await api.generateImages({
        prompt,
        model: modelId,
        imageSize,
        aspectRatio,
        batch,
        orderedReferences,
      });

      // prepend created items
      setGenerations((prev) => [...res.created, ...prev]);
      setGenTotal((t) => t + res.created.length);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function onRemix(g: Generation) {
    setPrompt(g.prompt || '');
    setAspectRatio(g.aspectRatio || 'auto');
    if (g.imageSize) setImageSize(g.imageSize);
    setModelId(g.model);

    const next: ReferenceItem[] = (g.referenceFileIds || []).slice(0, MAX_REFS).map((fid) => ({
      source: 'history',
      fileId: fid,
      previewUrl: buildFileUrl(fid, { thumb: true }),
      label: '历史参考',
    }));
    setRefs(next);

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

  // 如果没有可用的图片模型，显示提示
  if (imageModels.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <div className="text-lg font-semibold text-yellow-200">暂无可用的图片生成模型</div>
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
            <div className="text-sm font-semibold text-zinc-100">图片生成</div>
            <div className="mt-2 h-px w-10 bg-white/30" />
          </div>

          {/* Reference */}
          <div
            className="glass rounded-2xl p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropRefs}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">参考图（可选）</div>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                  {refs.length}/{MAX_REFS}
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
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-zinc-400 hover:bg-black/30"
                title="上传参考图"
              >
                +
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addUploads(e.target.files);
                  e.currentTarget.value = '';
                }}
              />

              <div className="flex flex-wrap gap-2">
                {(refs || []).map((r, idx) => (
                  <ReferenceThumb
                    key={`${r.source}-${r.fileId || r.previewUrl}-${idx}`}
                    item={r}
                    index={idx}
                    onRemove={() => removeRef(idx)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    isDragging={dragIndex === idx}
                  />
                ))}
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
              placeholder="输入连贯自然的图像描述，轻松创作出高质量的视觉作品"
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
                {(imageModels || []).map((m) => (
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
                    {a === 'auto' ? '自动' : a}
                  </option>
                ))}
              </select>
            </div>

            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">清晰度</div>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-zinc-500">Pro模型支持2K/4K高清</div>
            </div>

            <div className="glass rounded-2xl p-3">
              <div className="text-xs text-zinc-400">生成数量</div>
              <input
                type="number"
                min={1}
                max={MAX_BATCH}
                step={1}
                value={batch}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value, 10);
                  if (!Number.isFinite(next)) {
                    setBatch(1);
                    return;
                  }
                  setBatch(Math.min(Math.max(next, 1), MAX_BATCH));
                }}
                className="mt-2 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              />
              <div className="mt-1 text-[11px] text-zinc-500">范围 1-{MAX_BATCH}</div>
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

      {/* Image Preview Modal */}
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
          setRefs((prev) => {
            const remaining = MAX_REFS - prev.length;
            const toAdd = fileIds.slice(0, Math.max(0, remaining)).map((fid) => ({
              source: 'history' as const,
              fileId: fid,
              previewUrl: buildFileUrl(fid, { thumb: true }),
              label: '历史',
            }));
            return [...prev, ...toAdd];
          });
        }}
        maxSelectable={MAX_REFS}
      />

      <LibraryPickerModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(fileIds) => {
          setRefs((prev) => {
            const remaining = MAX_REFS - prev.length;
            const toAdd = fileIds.slice(0, Math.max(0, remaining)).map((fid) => ({
              source: 'library' as const,
              fileId: fid,
              previewUrl: buildFileUrl(fid, { thumb: true }),
              label: '参考库',
            }));
            return [...prev, ...toAdd];
          });
        }}
        maxSelectable={MAX_REFS}
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
