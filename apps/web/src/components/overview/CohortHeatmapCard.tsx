import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../EmptyState';

interface Props {
  offsets: string[];
  cohorts: Array<{
    cohortMonth: string;
    size: number;
    retention: Array<number | null>;
  }>;
}

function getHeatCellStyle(val: number | null): { className: string; bgOpacity?: number } {
  if (val === null) {
    return {
      className: 'bg-slate-50 text-slate-300 dark:bg-white/[0.02] dark:text-slate-700',
    };
  }
  if (val >= 90) {
    return { className: 'bg-[#4F46E5] text-white font-semibold' };
  }
  if (val >= 75) {
    return { className: 'bg-indigo-500/80 text-white font-semibold' };
  }
  if (val >= 60) {
    return { className: 'bg-indigo-500/55 text-indigo-950 dark:text-white font-medium' };
  }
  if (val >= 45) {
    return { className: 'bg-indigo-500/35 text-indigo-950 dark:text-indigo-100 font-medium' };
  }
  if (val >= 25) {
    return { className: 'bg-indigo-500/20 text-indigo-900 dark:text-indigo-200' };
  }
  return { className: 'bg-indigo-500/10 text-slate-600 dark:text-slate-300' };
}

export const CohortHeatmapCard = React.memo(function CohortHeatmapCard({ offsets, cohorts }: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  return (
    <div className="surface-card flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('overview.chartCohortTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t('overview.chartCohortSub')}
          </p>
        </div>
        <div className="hidden items-center gap-1 text-[10px] text-slate-400 sm:flex">
          <span>0%</span>
          <span className="h-2.5 w-3 rounded-sm bg-indigo-500/15" />
          <span className="h-2.5 w-3 rounded-sm bg-indigo-500/40" />
          <span className="h-2.5 w-3 rounded-sm bg-indigo-500/70" />
          <span className="h-2.5 w-3 rounded-sm bg-[#4F46E5]" />
          <span>100%</span>
        </div>
      </div>

      {cohorts.every((c) => c.size === 0) ? (
        <EmptyState />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <th className="py-1.5 text-left font-medium">{t('overview.cohortCol')}</th>
              <th className="py-1.5 text-right font-medium">{t('overview.cohortSize')}</th>
              {offsets.map((off, colIdx) => (
                <th
                  key={off}
                  className={`py-1.5 text-center font-mono font-medium transition ${
                    hovered?.col === colIdx ? 'text-indigo-600 dark:text-indigo-300' : ''
                  }`}
                >
                  {off}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((row, rowIdx) => (
              <tr key={row.cohortMonth}>
                <td
                  className={`whitespace-nowrap pr-2 font-mono text-xs font-medium ${
                    hovered?.row === rowIdx
                      ? 'text-indigo-600 dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {row.cohortMonth}
                </td>
                <td className="tabular-nums pr-2 text-right text-slate-500 dark:text-slate-400">
                  {row.size}
                </td>
                {row.retention.map((val, colIdx) => {
                  const style = getHeatCellStyle(val);
                  const isFocus = hovered?.row === rowIdx && hovered?.col === colIdx;
                  return (
                    <td
                      key={colIdx}
                      onMouseEnter={() => setHovered({ row: rowIdx, col: colIdx })}
                      onMouseLeave={() => setHovered(null)}
                      className={`tabular-nums h-9 min-w-[50px] rounded-md text-center text-[11px] transition ${
                        style.className
                      } ${isFocus ? 'ring-2 ring-indigo-400 ring-offset-1 dark:ring-offset-[#111827]' : ''}`}
                    >
                      {val === null ? '—' : `${val.toFixed(0)}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
});
