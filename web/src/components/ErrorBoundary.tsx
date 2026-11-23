import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort boundary: never shows stack traces to users. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-fg">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-gradient text-3xl font-bold text-white">O</div>
        <h1 className="text-2xl font-bold">{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="max-w-sm text-sm text-fg-3">
          {chunk ? 'Reload to get the latest version of OJASSS.' : 'An unexpected error occurred. Reloading usually fixes it.'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => location.reload()} className="h-11 rounded-xl bg-brand-gradient px-5 font-semibold text-white">Reload</button>
          <a href="/" className="flex h-11 items-center rounded-xl bg-surface-2 px-5 font-semibold">Go home</a>
        </div>
      </div>
    );
  }
}
