import { useEffect, useState } from 'react';
import { FileText, Printer, Copy, Check, X } from 'lucide-react';
import type { ChannelsResponse, OverviewResponse } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatPercent } from '../lib/format';
import { toast } from '../store/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
  overview?: OverviewResponse;
  channels?: ChannelsResponse;
}

export function BoardBriefModal({ open, onClose, overview, channels }: Props) {
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !overview) return null;

  const currency = overview.currency;
  const kpis = overview.kpis;
  const exec = overview.executive;
  const today = new Date().toISOString().slice(0, 10);

  const markdownBrief = [
    `# PulseOps Executive Boardroom Brief — ${activeWorkspace?.name ?? ''}`,
    `Date: ${today} | Period: ${overview.range.toUpperCase()} | Currency: ${currency}`,
    '',
    '## North-Star SaaS Health',
    `- Annualized ARR: ${formatCurrency(exec.arr, currency)}`,
    `- Monthly Recurring Revenue (MRR): ${formatCurrency(kpis.mrr.value, currency)} (${kpis.mrr.deltaPct >= 0 ? '+' : ''}${kpis.mrr.deltaPct}%)`,
    `- Net Revenue Retention (NRR): ${exec.nrr.toFixed(1)}% | SaaS Quick Ratio: ${exec.quickRatio.toFixed(1)}x`,
    `- Period Quota Attainment: ${exec.quotaAttainmentPct.toFixed(1)}% (${formatCurrency(kpis.totalRevenue.value, currency)} / ${formatCurrency(exec.periodTarget, currency)})`,
    '',
    '## Operational KPIs',
    `- Total Orders: ${kpis.ordersCount.value} (${kpis.ordersCount.deltaPct >= 0 ? '+' : ''}${kpis.ordersCount.deltaPct}%)`,
    `- Paid Conversion Rate: ${formatPercent(kpis.conversionRate.value)} | Refund Rate: ${formatPercent(kpis.refundRate.value)}`,
    `- ARPU: ${formatCurrency(kpis.arpu.value, currency)} | Avg Customer Health: ${exec.avgHealthScore}/100 (${exec.atRiskCustomers} at-risk)`,
    '',
    ...(channels
      ? [
          '## Channel Attribution Summary',
          ...channels.channels.map(
            (c) => `- ${c.channel}: ${formatCurrency(c.revenue, currency)} (${c.sharePct}% share · ROI ${c.roi}x)`,
          ),
        ]
      : []),
  ].join('\n');

  const handleCopy = async () => {
    await navigator.clipboard?.writeText(markdownBrief);
    setCopied(true);
    toast.success(lang === 'zh' ? '已复制 Markdown 高管月报，可直接粘贴到飞书/Notion' : 'Markdown executive brief copied');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="print-only-container fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="print-only-container surface-card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {lang === 'zh' ? '董事会 / 高管月度经营简报' : 'Executive Boardroom Brief'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {activeWorkspace?.name} · {today} · {overview.range.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <button type="button" onClick={handleCopy} className="btn-secondary h-8 px-3 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {lang === 'zh' ? '复制 Markdown' : 'Copy Markdown'}
            </button>
            <button type="button" onClick={() => window.print()} className="btn-primary h-8 px-3 text-xs">
              <Printer className="h-3.5 w-3.5" />
              {lang === 'zh' ? '打印 / 导出 PDF' : 'Print / PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'ARR Run-Rate', value: formatCurrency(exec.arr, currency) },
              { label: 'MRR', value: formatCurrency(kpis.mrr.value, currency) },
              { label: 'NRR', value: `${exec.nrr.toFixed(1)}%` },
              { label: 'Quota Attainment', value: `${exec.quotaAttainmentPct.toFixed(1)}%` },
            ].map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{m.label}</div>
                <div className="tabular-nums mt-1 text-lg font-bold text-slate-900 dark:text-white">{m.value}</div>
              </div>
            ))}
          </div>

          <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-[#0B0B0F] dark:text-zinc-300">
            {markdownBrief}
          </pre>
        </div>
      </div>
    </div>
  );
}
