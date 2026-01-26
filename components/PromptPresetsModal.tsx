import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { PromptPreset } from '../types';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

export function PromptPresetsModal(props: {
  open: boolean;
  onClose: () => void;
  currentPrompt: string;
  onApply: (prompt: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PromptPreset[]>([]);
  const [name, setName] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPresets();
      setItems(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    setName('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  async function saveCurrent() {
    if (!props.currentPrompt.trim()) {
      setError('当前提示词为空，无法保存');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createPreset({ name: name.trim() || `预设 ${new Date().toLocaleString()}`, prompt: props.currentPrompt });
      setName('');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('确认删除该预设吗？')) return;
    setError(null);
    try {
      await api.deletePreset(id);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="提示词预设" maxWidthClassName="max-w-xl">
      {error ? (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="glass rounded-xl p-4">
        <div className="text-sm font-semibold">保存当前提示词</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-zinc-400">名称（可选）</label>
            <input
              className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：电商产品图"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={saveCurrent}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              {saving ? <Spinner size={16} /> : null}
              保存
            </button>
          </div>
        </div>
        <div className="mt-2 text-xs text-zinc-500">提示：预设会保存在服务端（按账号隔离）。</div>
      </div>

      <div className="mt-4 glass rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">我的预设</div>
          <button
            onClick={load}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
          >
            刷新
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Spinner size={16} /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-400">暂无预设</div>
        ) : (
          <div className="space-y-2">
            {items.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-200">{p.name}</div>
                  <div className="mt-1 text-xs text-zinc-400 line-clamp-2">{p.prompt}</div>
                </div>
                <button
                  onClick={() => {
                    props.onApply(p.prompt);
                    props.onClose();
                  }}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/15"
                >
                  使用
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end">
        <button onClick={props.onClose} className="rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
          关闭
        </button>
      </div>
    </Modal>
  );
}
