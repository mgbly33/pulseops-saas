import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatCurrency } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';
import type { TierBreakdownResponse } from '../../lib/api';

interface Props {
  data: TierBreakdownResponse;
}

export const TierBreakdownCard = React.memo(function TierBreakdownCard({ data }: Props) {
  const theme = useUiStore((s) => s.theme);
  const lang = useUiStore((s) => s.lang);
  const isDark = theme === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.055)' : '#EDF1F5';
  const tickColor = isDark ? '#71717A' : '#64748B';

  const tierColors = {
    ENTERPRISE: '#7C3AED',
    PRO: '#4F46E5',
    STARTER: '#0EA5E9',
  };

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
            {lang === 'zh' ? '订阅层级月度营收结构' : 'Monthly Revenue by Subscription Tier'}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {lang === 'zh'
              ? '近 6 个月 Enterprise / Pro / Starter 堆叠贡献与客户生命周期价值'
              : 'Trailing 6-month stacked revenue mix & average account LTV per tier'}
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
          {(['ENTERPRISE', 'PRO', 'STARTER'] as const).map((tier) => (
            <span key={tier} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: tierColors[tier] }}
              />
              {tier}
            </span>
          ))}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="h-60 lg:col-span-8">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: tickColor, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: tickColor, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={58}
                tickFormatter={(v: number) => formatCurrency(v, data.currency, true)}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as TierBreakdownResponse['monthly'][number];
                  const sum = row.ENTERPRISE + row.PRO + row.STARTER;
                  return (
                    <div className="rounded-xl border border-zinc-700/80 bg-[#0D0D12]/95 px-3.5 py-2.5 text-xs text-zinc-100 shadow-2xl">
                      <div className="mb-1.5 flex items-center justify-between gap-5 font-mono text-[11px] text-zinc-400">
                        <span>{label}</span>
                        <span className="font-semibold text-white">
                          {formatCurrency(sum, data.currency)}
                        </span>
                      </div>
                      <div className="space-y-1 tabular-nums">
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-violet-300">Enterprise</span>
                          <span>{formatCurrency(row.ENTERPRISE, data.currency)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-indigo-300">Pro</span>
                          <span>{formatCurrency(row.PRO, data.currency)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-5">
                          <span className="text-sky-300">Starter</span>
                          <span>{formatCurrency(row.STARTER, data.currency)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="STARTER" stackId="a" fill="#0EA5E9" radius={[0, 0, 0, 0]} maxBarSize={32} />
              <Bar dataKey="PRO" stackId="a" fill="#4F46E5" radius={[0, 0, 0, 0]} maxBarSize={32} />
              <Bar dataKey="ENTERPRISE" stackId="a" fill="#7C3AED" radius={[5, 5, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col justify-center space-y-2.5 lg:col-span-4">
          {data.tiers.map((item) => (
            <div
              key={item.tier}
              className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-100">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tierColors[item.tier] }}
                  />
                  {item.tier}
                </span>
                <span className="tabular-nums text-[11px] text-slate-500 dark:text-zinc-400">
                  {item.customersCount} {lang === 'zh' ? '家企业' : 'accts'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between tabular-nums">
                <span className="text-[11px] text-slate-400">
                  {lang === 'zh' ? '平均 LTV' : 'Avg LTV'}
                </span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {formatCurrency(item.avgLtv, data.currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
