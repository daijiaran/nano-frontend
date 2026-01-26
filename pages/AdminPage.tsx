import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { AdminSettings, AdminUserRow } from '../types';
import { Spinner } from '../components/Spinner';

export function AdminPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const roleLabel = (role: string) => (role === 'admin' ? '管理员' : role === 'user' ? '普通用户' : role);
  const formatTime = (value: number | undefined) => (Number.isFinite(value) ? new Date(value).toLocaleString() : '-');

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText: string;
    danger?: boolean;
  } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [u, s] = await Promise.all([api.adminListUsers(), api.adminGetSettings()]);
      setUsers(u);
      setSettings(s);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setError(null);
    try {
      await api.adminCreateUser({ username: newUsername, password: newPassword, role: newRole });
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setError(null);
    try {
      const updated = await api.adminUpdateSettings({
        fileRetentionHours: settings.fileRetentionHours,
        referenceHistoryLimit: settings.referenceHistoryLimit,
        imageTimeoutSeconds: settings.imageTimeoutSeconds,
        videoTimeoutSeconds: settings.videoTimeoutSeconds,
      });
      setSettings(updated);
      alert('已保存');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function handleDeleteUser(user: AdminUserRow) {
    setConfirmDialog({
      show: true,
      title: '确认删除用户',
      message: `确定要删除用户 "${user.username}" 吗？此操作不可逆，用户的所有会话将被终止。`,
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setError(null);
        try {
          await api.adminDeleteUser(user.id);
          await load();
        } catch (e: any) {
          setError(e?.message || String(e));
        }
      },
    });
  }

  async function handleToggleUserStatus(user: AdminUserRow) {
    const newDisabled = !user.disabled;
    const actionText = newDisabled ? '禁用' : '启用';

    setConfirmDialog({
      show: true,
      title: `确认${actionText}用户`,
      message: newDisabled
        ? `确定要禁用用户 "${user.username}" 吗？禁用后该用户将无法登录，且现有会话将被终止。`
        : `确定要启用用户 "${user.username}" 吗？启用后该用户将可以正常登录。`,
      confirmText: actionText,
      danger: newDisabled,
      onConfirm: async () => {
        setConfirmDialog(null);
        setError(null);
        try {
          await api.adminUpdateUserStatus(user.id, newDisabled);
          await load();
        } catch (e: any) {
          setError(e?.message || String(e));
        }
      },
    });
  }

  return (
    <div className="h-full w-full overflow-auto custom-scrollbar">
      <div className="mb-4">
        <div className="text-lg font-semibold">管理员后台</div>
        <div className="mt-1 text-sm text-zinc-400">创建账号、管理用户、设置文件过期时间。</div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass rounded-xl p-4">
          <div className="text-sm font-semibold">创建账号</div>
          <form onSubmit={createUser} className="mt-3 grid gap-3">
            <div>
              <label className="text-xs text-zinc-400">用户名</label>
              <input
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">密码</label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">角色</label>
              <select
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20"
            >
              创建
            </button>
          </form>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="text-sm font-semibold">系统设置</div>
          {settings ? (
            <div className="mt-3">
              <label className="text-xs text-zinc-400">历史图片/视频文件过期时间（小时）</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={settings.fileRetentionHours}
                onChange={(e) => setSettings({ ...settings, fileRetentionHours: Number(e.target.value) })}
              />
              <div className="mt-2 text-xs text-zinc-500">到期后后台会自动清理硬盘文件与记录。</div>

              <label className="mt-4 block text-xs text-zinc-400">参考图历史上限（张）</label>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={settings.referenceHistoryLimit}
                onChange={(e) => setSettings({ ...settings, referenceHistoryLimit: Number(e.target.value) })}
              />
              <div className="mt-2 text-xs text-zinc-500">超过上限会自动删除最早上传的参考图。</div>

              <label className="mt-4 block text-xs text-zinc-400">图片生成超时时间（秒）</label>
              <input
                type="number"
                min={30}
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={settings.imageTimeoutSeconds}
                onChange={(e) => setSettings({ ...settings, imageTimeoutSeconds: Number(e.target.value) })}
              />
              <div className="mt-2 text-xs text-zinc-500">生成超时后系统会自动标记为失败。</div>

              <label className="mt-4 block text-xs text-zinc-400">视频生成超时时间（秒）</label>
              <input
                type="number"
                min={30}
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
                value={settings.videoTimeoutSeconds}
                onChange={(e) => setSettings({ ...settings, videoTimeoutSeconds: Number(e.target.value) })}
              />
              <div className="mt-2 text-xs text-zinc-500">视频生成可能需要更长时间，可按需调整。</div>
              <button
                onClick={saveSettings}
                className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/20"
              >
                保存设置
              </button>
            </div>
          ) : loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <Spinner size={16} /> 加载中…
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 glass rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">用户列表</div>
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
        ) : users.length === 0 ? (
          <div className="text-sm text-zinc-400">暂无用户</div>
        ) : (
          <div className="overflow-auto custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-400">
                <tr>
                  <th className="py-2">用户名</th>
                  <th className="py-2">角色</th>
                  <th className="py-2">状态</th>
                  <th className="py-2">创建时间</th>
                  <th className="py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="py-2 text-zinc-200">{u.username}</td>
                    <td className="py-2 text-zinc-300">{roleLabel(u.role)}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.disabled
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-green-500/20 text-green-300'
                          }`}
                      >
                        {u.disabled ? '已禁用' : '正常'}
                      </span>
                    </td>
                    <td className="py-2 text-zinc-500">{formatTime(u.createdAt)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${u.disabled
                              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                              : 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                            }`}
                        >
                          {u.disabled ? '启用' : '禁用'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="rounded bg-red-500/20 px-2 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-zinc-900 p-6 shadow-2xl ring-1 ring-white/10">
            <h3 className="text-lg font-semibold text-white">{confirmDialog.title}</h3>
            <p className="mt-2 text-sm text-zinc-400">{confirmDialog.message}</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15"
              >
                取消
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${confirmDialog.danger
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
