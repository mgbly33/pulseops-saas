import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Sparkles, RotateCcw, TrendingUp, Sliders, Layers, ArrowUpRight } from 'lucide-react';
import { apiRequest, type ForecastResponse } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency } from '../lib/format';
import { ChartSkeleton, KpiSkeletonGrid } from '../components/Skeletons';

export function ForecastPage() {
  const activeWorkspace = useActiveWorkspace();
  const theme = useUiStore((s) => s.theme);
  const lang = useUiStore((s) => s.lang);
  const isDark = theme === 'dark';

  const [growthBoostPct, setGrowthBoostPct] = useState(5);
  const [churnReductionPct, setChurnReductionPct] = useState(1.5);
  const [arpuLiftPct, setArpuLiftPct] = useState(8);
  const [activePreset, setActivePreset] = useState<'conservative' | 'baseline' | 'hyper' | 'custom'>('custom');

  // Debounce slider values by 160ms for 60fps smooth dragging without request storms
  const [debounced, setDebounced] = useState({ g: 5, c: 1.5, a: 8 });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ g: growthBoostPct, c: churnReductionPct, a: arpuLiftPct }), 160);
    return () => clearTimeout(t);
  }, [growthBoostPct, churnReductionPct, arpuLiftPct]);

  const applyPreset = (preset: 'conservative' | 'baseline' | 'hyper') => {
    setActivePreset(preset);
    if (preset === 'conservative') {
      setGrowthBoostPct(-4);
      setChurnReductionPct(0);
      setArpuLiftPct(0);
    } else if (preset === 'baseline') {
      setGrowthBoostPct(0);
      setChurnReductionPct(0);
      setArpuLiftPct(0);
    } else {
      setGrowthBoostPct(12);
      setChurnReductionPct(3);
      setArpuLiftPct(15);
    }
  };

  const query = useQuery({
    queryKey: ['analytics', 'forecast', activeWorkspace?.id, debounced.g, debounced.c, debounced.a],
    queryFn: () =>
      apiRequest<ForecastResponse>(
        `/api/analytics/forecast?growthBoostPct=${debounced.g}&churnReductionPct=${debounced.c}&arpuLiftPct=${debounced.a}`,
      ),
    enabled: Boolean(activeWorkspace?.id),
    placeholderData: (prev) => prev,
  });

  const bridgeQuery = useQuery({
    queryKey: ['analytics', 'mrr-bridge', activeWorkspace?.id],
    queryFn: () =>
      apiRequest<{
        currency: string;
        netNewMrr: number;
        steps: Array<{ key: string; value: number; kind: 'total' | 'positive' | 'negative' }>;
      }>('/api/analytics/mrr-bridge'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const bridgeLabels: Record<string, string> = {
    STARTING: lang === 'zh' ? '期初 MRR' : 'Starting MRR',
    NEW_BUSINESS: lang === 'zh' ? '+新签' : '+New',
    EXPANSION: lang === 'zh' ? '+增购扩张' : '+Expansion',
    CONTRACTION: lang === 'zh' ? '-退款缩减' : '-Contraction',
    CHURN: lang === 'zh' ? '-流失' : '-Churn',
    ENDING: lang === 'zh' ? '期末 MRR' : 'Ending MRR',
  };

  const data = query.data;
  const currency = data?.currency || activeWorkspace?.currency || 'CNY';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#EDF1F5';
  const tickColor = isDark ? '#71717A' : '#64748B';
  const dividerMonth = data?.points.find((p) => p.actual !== null && p.baseline !== null)?.month;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Sparkles className="h-3 w-3" />
            FP&A · WHAT-IF ENGINE
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            {lang === 'zh' ? '营收预测与 What-If 增长推演' : 'Revenue Forecasting & What-If Simulator'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {lang === 'zh'
              ? '基于近 6 个月真实结算流水构建统计外推模型，实时调节获客增速、流失改善与客单价杠杆推演未来 6 个月 ARR'
              : 'Statistical 6-month MRR/ARR projection derived from historical settled orders with interactive growth, churn, and ARPU levers'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'conservative', label: lang === 'zh' ? '保守情景' : 'Conservative' },
            { id: 'baseline', label: lang === 'zh' ? '自然基准' : 'Baseline' },
            { id: 'hyper', label: lang === 'zh' ? '高速扩张' : 'Hyper-Growth' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id as 'conservative' | 'baseline' | 'hyper')}
              className={`h-8 rounded-xl px-3 text-xs font-medium transition ${
                activePreset === p.id
                  ? 'bg-[#4F46E5] text-white shadow-sm'
                  : 'btn-secondary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 4 Forecast Executive Cards */}
      {!data ? (
        <KpiSkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="surface-card p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              {lang === 'zh' ? '当前年化 ARR' : 'Current ARR Run-Rate'}
            </div>
            <div className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {formatCurrency(data.summary.currentArr, currency)}
            </div>
            <div className="tabular-nums mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
              MRR {formatCurrency(data.summary.currentMrr, currency)} · MoM +{data.assumptions.baseMoMGrowthPct}%
            </div>
          </div>

          <div className="surface-card border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 to-white p-4 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-[#111114]">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-700 dark:text-indigo-300">
              <span>{lang === 'zh' ? '6 个月后预计 ARR' : 'Projected ARR (M+6)'}</span>
              <ArrowUpRight className="h-4 w-4" />
            </div>
            <div className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-indigo-950 dark:text-white">
              {formatCurrency(data.summary.projectedArr, currency)}
            </div>
            <div className="tabular-nums mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {lang === 'zh' ? '模拟月均复合增速' : 'Simulated MoM'}: +{data.assumptions.effectiveMoMPct}%
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              {lang === 'zh' ? '未来 6 月模拟累计营收' : '6M Cumulative Forecast'}
            </div>
            <div className="tabular-nums mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {formatCurrency(data.summary.cumulativeSimulated6m, currency)}
            </div>
            <div className="tabular-nums mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
              {lang === 'zh' ? '自然基准' : 'Baseline'}: {formatCurrency(data.summary.cumulativeBaseline6m, currency)}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-zinc-400">
              {lang === 'zh' ? 'What-If 策略增量净收益' : 'Incremental 6M Strategy Lift'}
            </div>
            <div
              className={`tabular-nums mt-2 text-2xl font-bold tracking-tight ${
                data.summary.incrementalLift6m >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {data.summary.incrementalLift6m >= 0 ? '+' : ''}
              {formatCurrency(data.summary.incrementalLift6m, currency)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 dark:text-zinc-400">
              {lang === 'zh' ? '相对自然增长基线差额' : 'Delta vs organic baseline'}
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Trajectory Chart + Interactive What-If Sliders */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          {!data ? (
            <ChartSkeleton height="h-80" />
          ) : (
            <div className="surface-card p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    {lang === 'zh' ? '12 个月实际与预测 MRR 轨道' : '12-Month Actual vs Projected MRR Trajectory'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                    {lang === 'zh'
                      ? '左半区为历史实绩，右半区为基线预测、模拟策略曲线及乐观/保守置信区间'
                      : 'Historical actuals transitioning into baseline, simulated scenario, and optimistic/conservative bands'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#635BFF]" />
                    {lang === 'zh' ? '历史实绩' : 'Actual'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {lang === 'zh' ? '策略模拟' : 'Simulated'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-3 border-t-2 border-dashed border-slate-400" />
                    {lang === 'zh' ? '自然基准' : 'Baseline'}
                  </span>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#635BFF" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#635BFF" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                      width={64}
                      tickFormatter={(v: number) => formatCurrency(v, currency, true)}
                    />
                    {dividerMonth && (
                      <ReferenceLine
                        x={dividerMonth}
                        stroke={isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1'}
                        strokeDasharray="3 3"
                        label={{
                          value: lang === 'zh' ? '预测起点' : 'Forecast Start',
                          position: 'insideTopRight',
                          fill: tickColor,
                          fontSize: 10,
                          dy: 6,
                        }}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as ForecastResponse['points'][number];
                        return (
                          <div className="rounded-xl border border-zinc-700/80 bg-[#0D0D12]/95 px-3.5 py-2.5 text-xs text-zinc-100 shadow-2xl">
                            <div className="mb-1.5 font-mono text-[11px] font-semibold text-zinc-400">
                              {label}
                            </div>
                            <div className="space-y-1 tabular-nums">
                              {row.actual !== null && (
                                <div className="flex justify-between gap-6">
                                  <span className="text-indigo-300">{lang === 'zh' ? '历史实绩' : 'Actual'}</span>
                                  <span className="font-semibold">{formatCurrency(row.actual, currency)}</span>
                                </div>
                              )}
                              {row.simulated !== null && (
                                <div className="flex justify-between gap-6">
                                  <span className="text-emerald-300">{lang === 'zh' ? '策略模拟' : 'Simulated'}</span>
                                  <span className="font-semibold">{formatCurrency(row.simulated, currency)}</span>
                                </div>
                              )}
                              {row.baseline !== null && (
                                <div className="flex justify-between gap-6">
                                  <span className="text-zinc-400">{lang === 'zh' ? '自然基准' : 'Baseline'}</span>
                                  <span>{formatCurrency(row.baseline, currency)}</span>
                                </div>
                              )}
                              {row.optimistic !== null && row.conservative !== null && (
                                <div className="border-t border-white/10 pt-1 text-[10px] text-zinc-400">
                                  {lang === 'zh' ? '置信区间' : 'Range'}: {formatCurrency(row.conservative, currency, true)} –{' '}
                                  {formatCurrency(row.optimistic, currency, true)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      stroke="#635BFF"
                      strokeWidth={2.5}
                      fill="url(#actualGrad)"
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="simulated"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fill="url(#simGrad)"
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#94A3B8"
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="optimistic"
                      stroke="rgba(16,185,129,0.4)"
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="conservative"
                      stroke="rgba(245,158,11,0.45)"
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Right: What-If Parameter Levers */}
        <div className="surface-card flex flex-col justify-between p-5 xl:col-span-4">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {lang === 'zh' ? 'What-If 增长杠杆调节' : 'What-If Growth Levers'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => applyPreset('baseline')}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/10"
              >
                <RotateCcw className="h-3 w-3" />
                {lang === 'zh' ? '归零' : 'Reset'}
              </button>
            </div>

            {/* Lever 1: Growth Acceleration */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-zinc-200">
                  {lang === 'zh' ? '获客投放加速 (Growth Boost)' : 'Acquisition Growth Boost'}
                </span>
                <span className="tabular-nums rounded-md bg-indigo-50 px-2 py-0.5 font-mono font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  {growthBoostPct > 0 ? '+' : ''}
                  {growthBoostPct}%
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={25}
                step={1}
                value={growthBoostPct}
                onChange={(e) => {
                  setActivePreset('custom');
                  setGrowthBoostPct(Number(e.target.value));
                }}
                className="pulse-slider"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>-10%</span>
                <span>0%</span>
                <span>+25%</span>
              </div>
            </div>

            {/* Lever 2: Churn Reduction */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-zinc-200">
                  {lang === 'zh' ? '流失率压降 (Churn Reduction)' : 'Monthly Churn Reduction'}
                </span>
                <span className="tabular-nums rounded-md bg-emerald-50 px-2 py-0.5 font-mono font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  -{churnReductionPct.toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={churnReductionPct}
                onChange={(e) => {
                  setActivePreset('custom');
                  setChurnReductionPct(Number(e.target.value));
                }}
                className="pulse-slider"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>0%</span>
                <span>-3.0%</span>
                <span>-6.0%</span>
              </div>
            </div>

            {/* Lever 3: ARPU Expansion */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-zinc-200">
                  {lang === 'zh' ? '客单价与席位增购 (ARPU Lift)' : 'ARPU & Seat Expansion'}
                </span>
                <span className="tabular-nums rounded-md bg-violet-50 px-2 py-0.5 font-mono font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                  {arpuLiftPct > 0 ? '+' : ''}
                  {arpuLiftPct}%
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={30}
                step={1}
                value={arpuLiftPct}
                onChange={(e) => {
                  setActivePreset('custom');
                  setArpuLiftPct(Number(e.target.value));
                }}
                className="pulse-slider"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-400">
                <span>-10%</span>
                <span>+10%</span>
                <span>+30%</span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-indigo-200/70 bg-indigo-50/50 p-3 text-[11px] leading-relaxed text-indigo-900 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
            {lang === 'zh'
              ? '实时演算引擎：所有滑块参数即时提交至后端预测接口，结合当前工作区历史复利斜率重新演算 6 个月现金流预测。'
              : 'Live model: slider inputs recompute 6-month compounding cashflow server-side via the forecast API.'}
          </div>
        </div>
      </div>

      {/* MRR Movement Waterfall Bridge */}
      {bridgeQuery.data && (
        <div className="surface-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {lang === 'zh'
                  ? 'MRR 净变动瀑布拆解桥 (MRR Movement Waterfall)'
                  : 'MRR Movement Waterfall Bridge'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                {lang === 'zh'
                  ? '期初 MRR → 新增签约 → 现有客户扩张 → 退款缩减与流失 → 期末 MRR 精准归因'
                  : 'Decomposes net new MRR across New Business, Expansion, Contraction, and Churn'}
              </p>
            </div>
            <span
              className={`tabular-nums rounded-full px-3 py-1 text-xs font-bold ${
                bridgeQuery.data.netNewMrr >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
              }`}
            >
              Net New MRR: {bridgeQuery.data.netNewMrr >= 0 ? '+' : ''}
              {formatCurrency(bridgeQuery.data.netNewMrr, currency)}
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bridgeQuery.data.steps.map((s) => ({
                  ...s,
                  label: bridgeLabels[s.key] || s.key,
                  absValue: Math.abs(s.value),
                }))}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                  tickFormatter={(v: number) => formatCurrency(v, currency, true)}
                />
                <Tooltip
                  formatter={(_v: number, _n: string, item: { payload?: { value: number } }) => {
                    const val = item?.payload?.value ?? 0;
                    return `${val > 0 ? '+' : ''}${formatCurrency(val, currency)}`;
                  }}
                  contentStyle={{
                    backgroundColor: '#0D0D12',
                    borderColor: '#3F3F46',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#fff',
                  }}
                />
                <Bar dataKey="absValue" radius={[6, 6, 0, 0]} maxBarSize={52}>
                  {bridgeQuery.data.steps.map((s, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        s.kind === 'total'
                          ? '#635BFF'
                          : s.kind === 'positive'
                            ? '#10B981'
                            : '#F43F5E'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Unit Economics Matrix by Subscription Tier */}
      {data && (
        <div className="surface-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200/80 px-5 py-3.5 dark:border-white/[0.07]">
            <Layers className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {lang === 'zh' ? '分层订阅单位经济模型 (Unit Economics)' : 'Subscription Tier Unit Economics'}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400">
                  <th className="px-5 py-3">{lang === 'zh' ? '订阅层级' : 'Plan Tier'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'zh' ? '客户总数' : 'Accounts'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'zh' ? '活跃留存率' : 'Active Rate'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'zh' ? '模拟平均 ACV' : 'Simulated ACV'}</th>
                  <th className="px-5 py-3">{lang === 'zh' ? '营收贡献占比' : 'LTV Share'}</th>
                  <th className="px-5 py-3 text-right">{lang === 'zh' ? '未来 6 月预期产值' : 'Projected 6M Yield'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {data.unitEconomics.map((row) => (
                  <tr key={row.tier} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            row.tier === 'ENTERPRISE'
                              ? 'bg-violet-500'
                              : row.tier === 'PRO'
                                ? 'bg-indigo-500'
                                : 'bg-sky-500'
                          }`}
                        />
                        {row.tier}
                      </span>
                    </td>
                    <td className="tabular-nums px-5 py-3.5 text-right text-slate-600 dark:text-zinc-300">
                      {row.accounts}
                    </td>
                    <td className="tabular-nums px-5 py-3.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {row.retentionRate.toFixed(1)}%
                    </td>
                    <td className="tabular-nums px-5 py-3.5 text-right font-medium text-slate-800 dark:text-zinc-200">
                      {formatCurrency(row.avgAcv, currency)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${row.revenueSharePct}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-medium text-slate-600 dark:text-zinc-300">
                          {row.revenueSharePct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="tabular-nums px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white">
                      {formatCurrency(row.projected6m, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
