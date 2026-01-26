import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, buildFileUrl } from '../services/api';
import type { LibraryItem, LibraryKind } from '../types';
import { Spinner } from '../components/Spinner';

function UploadForm(props: {
  kind: LibraryKind;
  onUploaded: () => void;
}) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await api.uploadLibraryItem({ kind: props.kind, name: name || file.name, file });
      setName('');
      setFile(null);
      props.onUploaded();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">上传{props.kind === 'role' ? '角色' : '场景'}参考图</div>
        <div className="text-xs text-zinc-400">支持常见图片格式</div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-zinc-400">名称</label>
          <input
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：主角甲 / 城市场景"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400">图片</label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!file || loading}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
      >
        {loading ? <Spinner size={16} /> : null}
        上传
      </button>
    </form>
  );
}

export function LibraryPage() {
  const [kind, setKind] = useState<LibraryKind>('role');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [gridColumns, setGridColumns] = useState(3);
  const gridRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listLibrary(kind);
      setItems(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, refreshKey]);

  useEffect(() => {
    const updateColumns = () => {
      if (!gridRef.current) return;
      const style = window.getComputedStyle(gridRef.current);
      const cols = style.gridTemplateColumns.split(' ').length;
      if (cols > 0) setGridColumns(cols);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [items.length, kind]);

  useEffect(() => {
    setPage(1);
  }, [kind]);

  const title = useMemo(() => (kind === 'role' ? '角色参考库' : '场景参考库'), [kind]);
  const perPage = Math.max(1, gridColumns * 4);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return items.slice(start, start + perPage);
  }, [currentPage, items, perPage]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  async function remove(id: string) {
    if (!confirm('确认删除这张参考图吗？')) return;
    await api.deleteLibraryItem(id);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-lg font-semibold">参考库</div>
          <div className="mt-1 text-sm text-zinc-400">上传并命名你的角色/场景参考图，生图/视频时可直接调用。</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setKind('role')}
            className={`rounded-lg px-3 py-2 text-sm ${kind === 'role' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}
          >
            角色
          </button>
          <button
            onClick={() => setKind('scene')}
            className={`rounded-lg px-3 py-2 text-sm ${kind === 'scene' ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}
          >
            场景
          </button>
        </div>
      </div>

      <div className="grid h-[calc(100%-72px)] grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        <div className="h-full overflow-auto custom-scrollbar">
          <UploadForm kind={kind} onUploaded={() => setRefreshKey((k) => k + 1)} />

          <div className="mt-4 glass rounded-xl p-4">
            <div className="text-sm font-semibold">{title}</div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                <Spinner size={16} /> 加载中…
              </div>
            ) : items.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-400">暂无数据</div>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-end gap-2 text-xs text-zinc-400">
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
                <div ref={gridRef} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {pageItems.map((it) => (
                    <div key={it.id} className="group relative overflow-hidden rounded-xl ring-1 ring-white/10">
                      {/* 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置 */}
                      <img src={buildFileUrl(it.file.id, { thumb: true })} className="h-28 w-full object-cover" alt={it.name} />
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-[11px] text-zinc-200">{it.name}</div>
                      <button
                        onClick={() => remove(it.id)}
                        className="absolute right-2 top-2 hidden rounded-lg bg-black/60 px-2 py-1 text-[11px] text-zinc-200 hover:bg-black/80 group-hover:block"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="glass h-full overflow-auto rounded-xl p-4 custom-scrollbar">
          <div className="text-sm font-semibold">使用方式</div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
            <li>在这里上传并命名角色/场景图片。</li>
            <li>回到「图片生成」或「视频生成」，在“参考图”区域点击“从库选择”。</li>
            <li>选中要用的角色/场景后，它们会自动加入参考图并参与生成。</li>
          </ol>
          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
            提示：库内图片默认不会自动过期；历史生成图片会按后台设置的过期时间清理。
          </div>
        </div>
      </div>
    </div>
  );
}
