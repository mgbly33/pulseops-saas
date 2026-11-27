import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import i18n from '../i18n';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'Unexpected UI error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PulseOps ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="surface-card max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {i18n.t('common.errorBoundaryTitle')}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {i18n.t('common.errorBoundaryDesc')}
            </p>
            <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary mt-5"
            >
              <RotateCcw className="h-4 w-4" />
              {i18n.t('common.reload')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
