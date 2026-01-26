import React, { useState } from 'react';
import { Spinner } from '../components/Spinner';

export function LoginPage(props: {
  onLogin: (username: string, password: string) => Promise<void>;
  error?: string | null;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await props.onLogin(username, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div className="glass w-full max-w-md rounded-2xl p-6">
        <div className="text-xl font-semibold">登录</div>
        <div className="mt-1 text-sm text-zinc-400">若要注册账户，请联系管理员</div>

        {props.error ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {props.error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label className="text-xs text-zinc-400">用户名</label>
            <input
              className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400">密码</label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
          >
            {loading ? <Spinner size={16} /> : null}
            登录
          </button>
        </form>
      </div>
    </div>
  );
}
