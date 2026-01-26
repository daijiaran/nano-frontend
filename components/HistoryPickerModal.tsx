import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, buildFileUrl } from '../services/api';
import type { Generation, ReferenceUpload } from '../types';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

type PickerItem = {
  key: string;
  fileId: string;
  url: string;
  label: string;
  createdAt: number;
  type: 'upload' | 'generation';
  isSlicer?: boolean;
  uploadId?: string;
};

function isSlicerFileName(name: string) {
  const value = name.trim().toLowerCase();
  return value.startsWith('slice_') || value.startsWith('slice-') || value.startsWith('slicer_') || value.startsWith('slicer-');
}

function isSlicerUpload(upload: ReferenceUpload) {
  const name = upload.originalName || upload.file?.filename || '';
  return name ? isSlicerFileName(name) : false;
}

export function HistoryPickerModal(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (fileIds: string[]) => void;
  maxSelectable?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Generation[]>([]);
  const [uploadItems, setUploadItems] = useState<ReferenceUpload[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState({ uploads: true, works: true });
  const [multiSelect, setMultiSelect] = useState(false);
  const [page, setPage] = useState(1);
  const [gridColumns, setGridColumns] = useState(4);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setSelected({});
    setFilters({ uploads: true, works: true });
    setMultiSelect(false);
    setLoading(true);
    setError(null);
    Promise.all([
      api.listGenerations({ type: 'image', limit: 60, offset: 0 }),
      api.listReferenceUploads({ limit: 100 }),
    ])
      .then(([genRes, uploadRes]) => {
        setItems((genRes.items || []).filter((g) => g.status === 'succeeded' && !!g.outputFile));
        setUploadItems(uploadRes || []);
      })
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const updateColumns = () => {
      if (!gridRef.current) return;
      const style = window.getComputedStyle(gridRef.current);
      const cols = style.gridTemplateColumns.split(' ').length;
      if (cols > 0) setGridColumns(cols);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [props.open]);

  useEffect(() => {
    if (props.open) setPage(1);
  }, [props.open, filters.uploads, filters.works]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  const isAllChecked = filters.uploads && filters.works;

  const mergedItems = useMemo<PickerItem[]>(() => {
    const next: PickerItem[] = [];
    if (filters.uploads) {
      for (const upload of uploadItems) {
        if (!upload.file) continue;
        const slicerUpload = isSlicerUpload(upload);
        // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
        next.push({
          key: `upload-${upload.id}`,
          fileId: upload.file.id,
          url: buildFileUrl(upload.file.id, { thumb: true }),
          label: slicerUpload ? '裁切' : (upload.file.filename || '参考上传'),
          createdAt: upload.createdAt || upload.file.createdAt,
          type: 'upload',
          isSlicer: slicerUpload,
          uploadId: upload.id,
        });
      }
    }
    if (filters.works) {
      for (const gen of items) {
        const f = gen.outputFile;
        if (!f) continue;
        // 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置
        next.push({
          key: `gen-${gen.id}`,
          fileId: f.id,
          url: buildFileUrl(f.id, { thumb: true }),
          label: gen.prompt || '历史作品',
          createdAt: gen.createdAt,
          type: 'generation',
        });
      }
    }
    next.sort((a, b) => b.createdAt - a.createdAt);
    return next;
  }, [filters.uploads, filters.works, uploadItems, items]);

  const perPage = Math.max(1, gridColumns * 4);
  const totalPages = Math.max(1, Math.ceil(mergedItems.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return mergedItems.slice(start, start + perPage);
  }, [currentPage, mergedItems, perPage]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  function toggleItem(item: PickerItem) {
    const fid = item.fileId;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[fid]) {
        delete next[fid];
      } else {
        // cap
        const cap = props.maxSelectable ?? 14;
        const current = Object.keys(next).length;
        if (current >= cap) return prev;
        next[fid] = true;
      }
      return next;
    });
  }

  function handleItemClick(item: PickerItem) {
    if (!multiSelect) {
      props.onSelect([item.fileId]);
      props.onClose();
      return;
    }
    toggleItem(item);
  }

  async function removeUpload(item: PickerItem) {
    if (!item.uploadId) return;
    try {
      await api.deleteReferenceUpload(item.uploadId);
      setUploadItems((prev) => prev.filter((u) => u.id !== item.uploadId));
      setSelected((prev) => {
        const next = { ...prev };
        delete next[item.fileId];
        return next;
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  function confirm() {
    props.onSelect(selectedIds);
    props.onClose();
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="从历史选择" maxWidthClassName="max-w-4xl">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Spinner size={16} />
          加载中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isAllChecked}
                onChange={() => setFilters({ uploads: !isAllChecked, works: !isAllChecked })}
              />
              全部
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.uploads}
                onChange={() => setFilters((prev) => ({ ...prev, uploads: !prev.uploads }))}
              />
              历史上传
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.works}
                onChange={() => setFilters((prev) => ({ ...prev, works: !prev.works }))}
              />
              历史作品
            </label>
            <button
              onClick={() => {
                setMultiSelect((prev) => {
                  const next = !prev;
                  if (!next) setSelected({});
                  return next;
                });
              }}
              className={`ml-auto rounded-lg px-3 py-1.5 text-[11px] ${
                multiSelect ? 'bg-white/20 text-white' : 'bg-white/5 text-zinc-200 hover:bg-white/10'
              }`}
            >
              {multiSelect ? '单选模式' : '多选模式'}
            </button>
          </div>
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <div>
              {multiSelect
                ? `已选 ${selectedIds.length} 张${props.maxSelectable ? ` / ${props.maxSelectable}` : ''}`
                : '单选模式，点击图片即可直接应用'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-[11px] text-zinc-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
          <div className="pb-20">
            <div ref={gridRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {pageItems.map((item) => {
              const isSel = !!selected[item.fileId];
              return (
                <div
                  key={item.key}
                  onClick={() => handleItemClick(item)}
                  className={`relative cursor-pointer overflow-hidden rounded-xl ring-1 ${isSel ? 'ring-white/50' : 'ring-white/10'} hover:ring-white/30`}
                  title={item.label}
                >
                  <img src={item.url} className="h-32 w-full object-cover" alt="历史记录" />
                  <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-zinc-200">
                    {item.type === 'upload' ? (item.isSlicer ? '裁切' : '上传') : '作品'}
                  </div>
                  {item.type === 'upload' && item.uploadId ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeUpload(item);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          removeUpload(item);
                        }
                      }}
                      className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-black hover:bg-white"
                    >
                      删除
                    </span>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-[11px] text-zinc-200 line-clamp-2">
                    {item.label}
                  </div>
                  {isSel ? (
                    <div className="absolute right-2 bottom-2 rounded-full bg-white/80 px-2 py-1 text-[10px] text-black">已选</div>
                  ) : null}
                </div>
              );
            })}
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/10 bg-black/80 px-3 py-3 backdrop-blur">
            <button onClick={props.onClose} className="rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              取消
            </button>
            <button
              onClick={confirm}
              disabled={!multiSelect || selectedIds.length === 0}
              className="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              添加到参考图
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
