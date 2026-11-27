import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, X, ArrowRight, Building2, AlertTriangle, Loader2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency } from '../lib/format';

interface GlobalRollupResponse {
  fxRateUsdToCny: number;
  totals: {
    workspacesCount: number;
    consolidatedMrrCny: number;
    consolidatedArrCny: number;
    consolidatedArrUsd: number;
    totalOrders30d: number;
    totalCustomers: number;
    totalOpenAlerts: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    currency: string;
    role: string;
    mrrNative: number;
    arrNative: number;
    mrrCny: number;
    arrCny: number;
    orders30d: number;
    customersCount: number;
    atRiskCount: number;
    avgHealth: number;
    openAlerts: number;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalRollupModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const { activeWorkspaceId, setActiveWorkspace } = useAuthStore();
  const lang = useUiStore((s) => s.lang);

  const query = useQuery({
    queryKey: ['analytics', 'global-rollup'],
    queryFn: () => apiRequest<GlobalRollupResponse>('/api/analytics/global-rollup'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const data = query.data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="surface-card flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-sm">
              <Globe2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {lang === 'zh' ? '全球多工作区集团合并驾驶舱 (Global Rollup)' : 'Global Multi-Workspace Consolidated Rollup'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {lang === 'zh'
                  ? `跨租户多币种汇率折算（1 USD = ${data?.fxRateUsdToCny ?? 7.2} CNY），一键洞察集团全局 ARR`
                  : `Multi-currency normalized holding view (1 USD = ${data?.fxRateUsdToCny ?? 7.2} CNY)`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {query.isLoading || !data ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Consolidated Holding KPIs */}
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                  <div className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                    {lang === 'zh' ? '集团合并年化 ARR (CNY)' : 'Consolidated ARR (CNY)'}
                  </div>
                  <div className="tabular-nums mt-1.5 text-xl font-bold text-indigo-950 dark:text-white">
                    {formatCurrency(data.totals.consolidatedArrCny, 'CNY', true)}
                  </div>
                  <div className="tabular-nums mt-0.5 text-[11px] text-indigo-600/80 dark:text-indigo-300/80">
                    ≈ {formatCurrency(data.totals.consolidatedArrUsd, 'USD', true)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {lang === 'zh' ? '合并月经常性收入 MRR' : 'Consolidated MRR'}
                  </div>
                  <div className="tabular-nums mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
                    {formatCurrency(data.totals.consolidatedMrrCny, 'CNY', true)}
                  </div>
                  <div className="tabular-nums mt-0.5 text-[11px] text-slate-400">
                    {data.totals.workspacesCount} {lang === 'zh' ? '个独立工作区' : 'workspaces'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {lang === 'zh' ? '集团总企业客户数' : 'Total Enterprise Accounts'}
                  </div>
                  <div className="tabular-nums mt-1.5 text-xl font-bold text-slate-900 dark:text-white">
                    {data.totals.totalCustomers}
                  </div>
                  <div className="tabular-nums mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    {data.totals.totalOrders30d} {lang === 'zh' ? '笔近30日订单' : 'orders (30d)'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {lang === 'zh' ? '待处理跨区预警' : 'Open Alerts Across All'}
                  </div>
                  <div className="tabular-nums mt-1.5 text-xl font-bold text-rose-600 dark:text-rose-400">
                    {data.totals.totalOpenAlerts}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {lang === 'zh' ? '实时同步统计' : 'Live sync'}
                  </div>
                </div>
              </div>

              {/* Per-Workspace Side-by-Side Comparison */}
              <div className="space-y-3">
                {data.workspaces.map((ws) => {
                  const sharePct =
                    data.totals.consolidatedArrCny > 0
                      ? Math.round((ws.arrCny / data.totals.consolidatedArrCny) * 1000) / 10
                      : 0;
                  const isCurrent = ws.id === activeWorkspaceId;
                  return (
                    <div
                      key={ws.id}
                      className={`rounded-2xl border p-4 transition ${
                        isCurrent
                          ? 'border-indigo-400/70 bg-indigo-50/40 dark:border-indigo-500/40 dark:bg-indigo-500/[0.08]'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/[0.07] dark:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 font-mono text-sm font-bold text-white dark:bg-indigo-500">
                            {ws.currency === 'USD' ? '$' : '¥'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-sm font-bold text-slate-900 dark:text-white">{ws.name}</span>
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-zinc-300">
                                {ws.currency}
                              </span>
                              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                {ws.role}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-4 tabular-nums text-xs text-slate-500 dark:text-zinc-400">
                              <span>
                                Native ARR: <strong className="text-slate-900 dark:text-white">{formatCurrency(ws.arrNative, ws.currency, true)}</strong>
                              </span>
                              <span>
                                30D MRR: <strong className="text-slate-900 dark:text-white">{formatCurrency(ws.mrrNative, ws.currency)}</strong>
                              </span>
                              <span>
                                {lang === 'zh' ? '健康均分' : 'Avg Health'}: <strong>{ws.avgHealth}/100</strong>
                              </span>
                              {ws.openAlerts > 0 && (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                  <AlertTriangle className="h-3 w-3" />
                                  {ws.openAlerts} alerts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right tabular-nums">
                            <div className="text-xs font-bold text-slate-900 dark:text-white">{sharePct}%</div>
                            <div className="text-[10px] text-slate-400">{lang === 'zh' ? '集团占比' : 'Group Share'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveWorkspace(ws.id);
                              queryClient.invalidateQueries();
                              onClose();
                            }}
                            className={isCurrent ? 'btn-secondary h-8 px-3 text-xs' : 'btn-primary h-8 px-3 text-xs'}
                          >
                            <span>{isCurrent ? (lang === 'zh' ? '当前所在' : 'Active') : (lang === 'zh' ? '进入工作区' : 'Switch')}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
