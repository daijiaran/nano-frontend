import React, { useEffect, useMemo, useState } from 'react';
import { api, buildFileUrl } from '../services/api';
import type { LibraryItem, LibraryKind } from '../types';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

export function LibraryPickerModal(props: {
  open: boolean;
  onClose: () => void;
  onSelect: (fileIds: string[]) => void;
  maxSelectable?: number;
}) {
  const [kind, setKind] = useState<LibraryKind>('role');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!props.open) return;
    setSelected({});
    setLoading(true);
    setError(null);
    api
      .listLibrary(kind)
      .then((res) => setItems(res))
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [props.open, kind]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  function toggle(item: LibraryItem) {
    const fid = item.file.id;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[fid]) {
        delete next[fid];
      } else {
        const cap = props.maxSelectable ?? 14;
        const current = Object.keys(next).length;
        if (current >= cap) return prev;
        next[fid] = true;
      }
      return next;
    });
  }

  function confirm() {
    props.onSelect(selectedIds);
    props.onClose();
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="从角色/场景库选择" maxWidthClassName="max-w-4xl">
      <div className="mb-3 flex items-center gap-2">
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
        <div className="ml-auto text-xs text-zinc-400">已选 {selectedIds.length}</div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Spinner size={16} />
          加载中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-zinc-400">暂无数据：请先在「参考库」上传图片并命名。</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((it) => {
            const isSel = !!selected[it.file.id];
            return (
              <button
                key={it.id}
                onClick={() => toggle(it)}
                className={`relative overflow-hidden rounded-xl ring-1 ${isSel ? 'ring-white/50' : 'ring-white/10'} hover:ring-white/30`}
                title={it.name}
              >
                {/* 使用buildFileUrl动态构建URL，遵守PUBLIC_BASE_URL配置 */}
                <img src={buildFileUrl(it.file.id, { thumb: true })} className="h-32 w-full object-cover" alt={it.name} />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-[11px] text-zinc-200">{it.name}</div>
                {isSel ? (
                  <div className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-1 text-[10px] text-black">已选</div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={props.onClose} className="rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
          取消
        </button>
        <button
          onClick={confirm}
          disabled={selectedIds.length === 0}
          className="rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
        >
          添加到参考图
        </button>
      </div>
    </Modal>
  );
}
