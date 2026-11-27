import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KpiCardProps {
  label: string;
  formattedValue: string;
  deltaPct: number;
  vsLabel: string;
  sparkline: number[];
  invertTrend?: boolean;
  accentColor?: string;
}

export const KpiCard = React.memo(function KpiCard({
  label,
  formattedValue,
  deltaPct,
  vsLabel,
  sparkline,
  invertTrend = false,
  accentColor = '#4F46E5',
}: KpiCardProps) {
  const isPositiveDelta = deltaPct >= 0;
  const isGood = invertTrend ? !isPositiveDelta : isPositiveDelta;
  const strokeColor = isGood ? '#059669' : '#DC2626';
  const gradId = `spark-${label.replace(/[^a-zA-Z0-9]/g, '')}`;

  const sparkData = sparkline.map((v, idx) => ({ idx, v }));

  return (
    <div className="surface-card group flex flex-col justify-between p-4 transition hover:border-indigo-300/70 dark:hover:border-indigo-500/40">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      </div>

      {/* Primary KPI Metric — full width so numbers never truncate */}
      <div className="tabular-nums mt-2 whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 dark:text-white 2xl:text-2xl">
        {formattedValue}
      </div>

      {/* Bottom Row: Delta Badge + Mini Sparkline */}
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span
            className={`tabular-nums inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              isGood
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
            }`}
          >
            {isPositiveDelta ? (
              <TrendingUp className="h-3 w-3 shrink-0" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0" />
            )}
            {isPositiveDelta ? '+' : ''}
            {deltaPct.toFixed(1)}%
          </span>
          <div className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">
            {vsLabel}
          </div>
        </div>

        <div className="h-9 w-20 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={strokeColor}
                strokeWidth={1.75}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});
