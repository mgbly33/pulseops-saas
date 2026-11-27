import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore } from '../store/toastStore';

const styles = {
  success: 'border-emerald-200 bg-white text-slate-900 dark:border-emerald-500/30 dark:bg-[#111827] dark:text-slate-100',
  error: 'border-rose-200 bg-white text-slate-900 dark:border-rose-500/30 dark:bg-[#111827] dark:text-slate-100',
  warning: 'border-amber-200 bg-white text-slate-900 dark:border-amber-500/30 dark:bg-[#111827] dark:text-slate-100',
  info: 'border-indigo-200 bg-white text-slate-900 dark:border-indigo-500/30 dark:bg-[#111827] dark:text-slate-100',
};

const icons = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />,
  error: <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />,
  info: <Info className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />,
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-elevated ${styles[t.variant]}`}
        >
          <div className="mt-0.5">{icons[t.variant]}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-snug">{t.title}</div>
            {t.description && (
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t.description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
