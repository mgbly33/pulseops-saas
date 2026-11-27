import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight } from 'lucide-react';
import { formatNumber } from '../../lib/format';

interface Props {
  overallConversionRate: number;
  stages: Array<{
    stage: string;
    count: number;
    conversionFromPrev: number;
    conversionFromTop: number;
    dropOffPct: number;
  }>;
}

const BAR_GRADIENTS = [
  'from-indigo-600 to-indigo-500',
  'from-indigo-500 to-blue-500',
  'from-sky-500 to-cyan-500',
  'from-emerald-600 to-emerald-500',
];

export const FunnelChartCard = React.memo(function FunnelChartCard({
  overallConversionRate,
  stages,
}: Props) {
  const { t } = useTranslation();
  const topCount = Math.max(1, stages[0]?.count ?? 1);

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('overview.chartFunnelTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t('overview.chartFunnelSub', { rate: overallConversionRate.toFixed(2) })}
          </p>
        </div>
        <span className="tabular-nums rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
          {overallConversionRate.toFixed(2)}%
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center space-y-3.5">
        {stages.map((st, idx) => {
          // Visual width uses sqrt-blended scale so final paid stage stays clearly readable while preserving hierarchy
          const rawRatio = st.count / topCount;
          const visualWidth = idx === 0 ? 100 : Math.max(14, Math.round(Math.pow(rawRatio, 0.45) * 100));

          return (
            <div key={st.stage} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 font-mono text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    0{idx + 1}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {t(`overview.funnelStages.${st.stage}`)}
                  </span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  {idx > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                      <ArrowDownRight className="h-3 w-3" />
                      {t('overview.dropOff')} {st.dropOffPct.toFixed(1)}%
                    </span>
                  )}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatNumber(st.count)}
                  </span>
                </div>
              </div>

              <div className="relative h-7 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-white/[0.05]">
                <div
                  className={`flex h-full items-center justify-between rounded-lg bg-gradient-to-r px-3 text-[11px] font-semibold text-white transition-all duration-500 ${BAR_GRADIENTS[idx]}`}
                  style={{ width: `${visualWidth}%` }}
                >
                  <span className="tabular-nums truncate">
                    {idx === 0 ? '100%' : `${t('overview.stepConv')} ${st.conversionFromPrev.toFixed(1)}%`}
                  </span>
                </div>
                <span className="tabular-nums pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {st.conversionFromTop.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
