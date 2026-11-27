import React from 'react';
import { Receipt, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';
import type { LiveFeedResponse } from '../../lib/api';
import { EmptyState } from '../EmptyState';

interface Props {
  data: LiveFeedResponse;
  onRefresh: () => void;
  refreshing?: boolean;
}

export const LiveTelemetryFeed = React.memo(function LiveTelemetryFeed({
  data,
  onRefresh,
  refreshing,
}: Props) {
  const lang = useUiStore((s) => s.lang);

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
            {lang === 'zh' ? '实时交易与事件遥测流' : 'Live Revenue & Audit Telemetry'}
          </h3>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-white/[0.06]"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {lang === 'zh' ? '刷新' : 'Sync'}
        </button>
      </div>

      {data.feed.length === 0 ? (
        <EmptyState />
      ) : (
      <div className="max-h-[268px] flex-1 divide-y divide-slate-100 overflow-y-auto pr-1 dark:divide-white/[0.05]">
        {data.feed.map((ev) => (
          <div key={ev.id} className="flex items-start gap-3 py-2.5 first:pt-1">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                ev.type === 'ORDER'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : ev.type === 'ALERT'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                    : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
              }`}
            >
              {ev.type === 'ORDER' ? (
                <Receipt className="h-3.5 w-3.5" />
              ) : ev.type === 'ALERT' ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-zinc-100">
                  {ev.title}
                </span>
                {ev.type === 'ORDER' && ev.amount !== undefined && (
                  <span
                    className={`tabular-nums shrink-0 text-xs font-bold ${
                      ev.status === 'REFUNDED'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {ev.status === 'REFUNDED' ? '-' : '+'}
                    {formatCurrency(ev.amount, data.currency)}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                <span className="truncate">{ev.subtitle}</span>
                <span className="tabular-nums shrink-0 text-[10px] text-slate-400 dark:text-zinc-500">
                  {formatDateTime(ev.timestamp, lang).slice(5)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
});
