import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  readonly props!: Props;
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h2 className="text-xl font-semibold text-red-200">页面渲染错误</h2>
            <p className="mt-2 text-sm text-red-300">
              {this.state.error?.message || '未知错误'}
            </p>
            <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-zinc-300">
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/20"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}



