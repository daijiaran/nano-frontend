import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { ProviderSettings } from '../types';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

const QUICK_HOSTS = [
  { label: '国内直连', value: 'https://grsai.dakka.com.cn' },
  { label: '海外节点', value: 'https://api.grsai.com' },
];

export function ProviderSettingsModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);

  const [providerHost, setProviderHost] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (!props.open) return;
    setLoading(true);
    setError(null);
    api
      .getProviderSettings()
      .then((s) => {
        setSettings(s);
        setProviderHost(s.providerHost || QUICK_HOSTS[0].value);
        setApiKey('');
      })
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [props.open]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateProviderSettings({
        providerHost,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
      });
      setSettings(res);
      setApiKey('');
      alert('已保存');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={props.open} onClose={props.onClose} title="接口设置" maxWidthClassName="max-w-xl">
      {error ? (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Spinner size={16} /> 加载中…
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs text-zinc-400">快速选择</div>
            <div className="mt-2 flex gap-2">
              {QUICK_HOSTS.map((h) => (
                <button
                  key={h.value}
                  onClick={() => setProviderHost(h.value)}
                  className={`rounded-lg px-3 py-2 text-sm ${providerHost === h.value ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'}`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400">服务地址</label>
            <input
              className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              value={providerHost}
              onChange={(e) => setProviderHost(e.target.value)}
              placeholder="https://grsai.dakka.com.cn"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400">接口密钥</label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.hasApiKey ? '已设置（留空表示不修改）' : '请输入接口密钥'}
            />
            <div className="mt-2 text-xs text-zinc-500">接口密钥会存储在服务端（加密），不会暴露给前端。</div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={props.onClose} className="rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
              关闭
            </button>
            <button
              onClick={save}
              disabled={!providerHost || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            >
              {saving ? <Spinner size={16} /> : null}
              保存
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
