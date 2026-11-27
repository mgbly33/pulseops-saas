import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../lib/format';
import { EmptyState } from '../EmptyState';

const CHANNEL_COLORS: Record<string, string> = {
  ORGANIC: '#4F46E5',
  PAID_SEARCH: '#0EA5E9',
  PARTNER: '#059669',
  SOCIAL: '#F59E0B',
};

interface Props {
  channels: Array<{
    channel: string;
    revenue: number;
    ordersCount: number;
    aov: number;
    sharePct: number;
    roi: number;
  }>;
  totalRevenue: number;
  currency: string;
}

export const ChannelMixChart = React.memo(function ChannelMixChart({
  channels,
  totalRevenue,
  currency,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t('overview.chartChannelTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t('overview.chartChannelSub')}
        </p>
      </div>

      {totalRevenue <= 0 ? (
        <EmptyState />
      ) : (
      <div className="grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-12">
        <div className="relative h-56 sm:col-span-5">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={channels}
                dataKey="revenue"
                nameKey="channel"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={82}
                paddingAngle={2.5}
                stroke="none"
              >
                {channels.map((entry) => (
                  <Cell
                    key={entry.channel}
                    fill={CHANNEL_COLORS[entry.channel] || '#6366F1'}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as Props['channels'][number];
                  return (
                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-elevated">
                      <div className="font-semibold">{t(`channels.${item.channel}`)}</div>
                      <div className="mt-1 tabular-nums text-slate-300">
                        {formatCurrency(item.revenue, currency)} ({item.sharePct.toFixed(1)}%)
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {t('overview.revenueAxis')}
            </span>
            <span className="tabular-nums mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {formatCurrency(totalRevenue, currency, true)}
            </span>
          </div>
        </div>

        <div className="space-y-2.5 sm:col-span-7">
          {channels.map((ch) => (
            <div
              key={ch.channel}
              className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[ch.channel] || '#6366F1' }}
                  />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {t(`channels.${ch.channel}`)}
                  </span>
                  <span className="tabular-nums rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    ROI {ch.roi.toFixed(1)}x
                  </span>
                </div>
                <span className="tabular-nums text-xs font-bold text-slate-900 dark:text-white">
                  {ch.sharePct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                <span>{formatCurrency(ch.revenue, currency)}</span>
                <span>
                  {t('overview.aovLabel')}: {formatCurrency(ch.aov, currency)} · {ch.ordersCount}{' '}
                  {t('overview.ordersAxis')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
});
