import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';

interface Props {
  series: Array<{
    bucket: string;
    revenue: number;
    previousRevenue: number;
    cumulativeRevenue: number;
    orders: number;
    newCustomers: number;
  }>;
  currency: string;
}

type ChartMode = 'combo' | 'compare' | 'cumulative';

export const RevenueTrendChart = React.memo(function RevenueTrendChart({ series, currency }: Props) {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const lang = useUiStore((s) => s.lang);
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<ChartMode>('combo');

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#EDF1F5';
  const tickColor = isDark ? '#A1A1AA' : '#64748B';

  const modes: Array<{ id: ChartMode; label: string }> = [
    { id: 'combo', label: lang === 'zh' ? '营收+订单' : 'Combo' },
    { id: 'compare', label: lang === 'zh' ? '环比对比' : 'vs Prior' },
    { id: 'cumulative', label: lang === 'zh' ? '累计增长' : 'Cumulative' },
  ];

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
            {t('overview.chartRevenueTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {t('overview.chartRevenueSub')}
          </p>
        </div>

        {/* Sleek Mode Switcher */}
        <div className="flex items-center rounded-xl bg-slate-100/90 p-0.5 text-[11px] dark:bg-white/[0.05]">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                mode === m.id
                  ? 'bg-white text-indigo-700 shadow-xs dark:bg-[#1E1E24] dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[290px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={mode} data={series} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pulseRevGradV2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#635BFF" stopOpacity={isDark ? 0.38 : 0.24} />
                <stop offset="100%" stopColor="#635BFF" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="pulseCumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={isDark ? 0.36 : 0.22} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(val: string) => (val.length === 10 ? val.slice(5) : val)}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: tickColor, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={62}
              tickFormatter={(v: number) => formatCurrency(v, currency, true)}
            />
            {mode === 'combo' && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: tickColor, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
            )}
            <Tooltip
              cursor={{
                stroke: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(99,91,255,0.25)',
                strokeWidth: 1,
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Props['series'][number];
                return (
                  <div className="rounded-xl border border-zinc-700/80 bg-[#0D0D12]/95 px-3.5 py-2.5 text-xs text-zinc-100 shadow-2xl backdrop-blur">
                    <div className="mb-1.5 font-mono text-[11px] font-semibold text-zinc-400">
                      {label}
                    </div>
                    <div className="space-y-1 tabular-nums">
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-indigo-300">{t('overview.revenueAxis')}</span>
                        <span className="font-semibold text-white">
                          {formatCurrency(row.revenue, currency)}
                        </span>
                      </div>
                      {mode === 'compare' && (
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-zinc-400">
                            {lang === 'zh' ? '上周期对比' : 'Prior Period'}
                          </span>
                          <span className="font-medium text-zinc-300">
                            {formatCurrency(row.previousRevenue, currency)}
                          </span>
                        </div>
                      )}
                      {mode === 'cumulative' && (
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-emerald-300">
                            {lang === 'zh' ? '周期累计营收' : 'Cumulative'}
                          </span>
                          <span className="font-semibold text-white">
                            {formatCurrency(row.cumulativeRevenue, currency)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-emerald-300">{t('overview.ordersAxis')}</span>
                        <span className="font-semibold text-white">{formatNumber(row.orders)}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            {/* Direct Recharts children — NEVER wrap in React.Fragment */}
            {mode === 'combo' && (
              <Bar
                yAxisId="right"
                dataKey="orders"
                barSize={10}
                radius={[4, 4, 0, 0]}
                fill={isDark ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.24)'}
              />
            )}
            {mode === 'combo' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="#635BFF"
                strokeWidth={2.25}
                fill="url(#pulseRevGradV2)"
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: '#635BFF' }}
              />
            )}

            {mode === 'compare' && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="previousRevenue"
                stroke={isDark ? '#71717A' : '#94A3B8'}
                strokeWidth={1.75}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
            {mode === 'compare' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="#635BFF"
                strokeWidth={2.25}
                fill="url(#pulseRevGradV2)"
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: '#635BFF' }}
              />
            )}

            {mode === 'cumulative' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cumulativeRevenue"
                stroke="#10B981"
                strokeWidth={2.25}
                fill="url(#pulseCumGrad)"
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: '#10B981' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
