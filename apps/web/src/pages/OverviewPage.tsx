import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  Target,
  Activity,
  HeartPulse,
  Gauge,
  FileText,
} from 'lucide-react';
import {
  apiRequest,
  type OverviewResponse,
  type TimeseriesResponse,
  type ChannelsResponse,
  type FunnelResponse,
  type CohortsResponse,
  type TierBreakdownResponse,
  type InsightsResponse,
  type LiveFeedResponse,
} from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';
import { KpiCard } from '../components/overview/KpiCard';
import { RevenueTrendChart } from '../components/overview/RevenueTrendChart';
import { ChannelMixChart } from '../components/overview/ChannelMixChart';
import { FunnelChartCard } from '../components/overview/FunnelChartCard';
import { CohortHeatmapCard } from '../components/overview/CohortHeatmapCard';
import { TierBreakdownCard } from '../components/overview/TierBreakdownCard';
import { LiveTelemetryFeed } from '../components/overview/LiveTelemetryFeed';
import { BoardBriefModal } from '../components/BoardBriefModal';
import { ChartSkeleton, KpiSkeletonGrid } from '../components/Skeletons';

const RANGES = ['7d', '30d', '90d', '12m'] as const;
const GRANULARITIES = ['day', 'week', 'month'] as const;

export function OverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const [searchParams, setSearchParams] = useSearchParams();
  const [briefOpen, setBriefOpen] = useState(false);

  const range = searchParams.get('range') || '30d';
  const channel = searchParams.get('channel') || 'ALL';
  const planTier = searchParams.get('planTier') || 'ALL';
  const granularity =
    searchParams.get('granularity') || (range === '12m' ? 'month' : range === '90d' ? 'week' : 'day');

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    if (key === 'range') {
      if (value === '12m') next.set('granularity', 'month');
      else if (value === '90d') next.set('granularity', 'week');
      else next.set('granularity', 'day');
    }
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setSearchParams({ range: '30d', channel: 'ALL', planTier: 'ALL', granularity: 'day' }, { replace: true });
  };

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ range, channel, planTier, granularity });
    return p.toString();
  }, [range, channel, planTier, granularity]);

  const wsId = activeWorkspace?.id;

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'overview', wsId, range, channel, planTier],
    queryFn: () => apiRequest<OverviewResponse>(`/api/analytics/overview?${queryString}`),
    enabled: Boolean(wsId),
  });

  const timeseriesQuery = useQuery({
    queryKey: ['analytics', 'timeseries', wsId, range, channel, planTier, granularity],
    queryFn: () => apiRequest<TimeseriesResponse>(`/api/analytics/timeseries?${queryString}`),
    enabled: Boolean(wsId),
  });

  const channelsQuery = useQuery({
    queryKey: ['analytics', 'channels', wsId, range, planTier],
    queryFn: () => apiRequest<ChannelsResponse>(`/api/analytics/channels?${queryString}`),
    enabled: Boolean(wsId),
  });

  const funnelQuery = useQuery({
    queryKey: ['analytics', 'funnel', wsId, range, channel],
    queryFn: () => apiRequest<FunnelResponse>(`/api/analytics/funnel?${queryString}`),
    enabled: Boolean(wsId),
  });

  const cohortsQuery = useQuery({
    queryKey: ['analytics', 'cohorts', wsId, channel, planTier],
    queryFn: () => apiRequest<CohortsResponse>(`/api/analytics/cohorts?${queryString}`),
    enabled: Boolean(wsId),
  });

  const tierQuery = useQuery({
    queryKey: ['analytics', 'tier-breakdown', wsId],
    queryFn: () => apiRequest<TierBreakdownResponse>('/api/analytics/tier-breakdown'),
    enabled: Boolean(wsId),
  });

  const insightsQuery = useQuery({
    queryKey: ['analytics', 'insights', wsId, range],
    queryFn: () => apiRequest<InsightsResponse>(`/api/analytics/insights?range=${range}`),
    enabled: Boolean(wsId),
  });

  const liveFeedQuery = useQuery({
    queryKey: ['analytics', 'live-feed', wsId],
    queryFn: () => apiRequest<LiveFeedResponse>('/api/analytics/live-feed'),
    enabled: Boolean(wsId),
    refetchInterval: 20_000,
  });

  const currency = overviewQuery.data?.currency || activeWorkspace?.currency || 'CNY';
  const kpis = overviewQuery.data?.kpis;
  const exec = overviewQuery.data?.executive;

  const renderInsightCopy = (ins: InsightsResponse['insights'][number]) => {
    if (ins.code === 'REVENUE_MOMENTUM') {
      return {
        title: lang === 'zh' ? '营收增长动能' : 'Revenue Velocity',
        desc:
          lang === 'zh'
            ? `本期净营收 ${formatCurrency(Number(ins.data.currRev), currency)}，可进入推演引擎预测未来 6 月 ARR`
            : `Period net revenue hit ${formatCurrency(Number(ins.data.currRev), currency)}. Model 6M ARR trajectory.`,
      };
    }
    if (ins.code === 'TOP_CHANNEL') {
      const chName = t(`channels.${ins.data.channel}`);
      return {
        title: lang === 'zh' ? `主力渠道 · ${chName}` : `Lead Channel · ${chName}`,
        desc:
          lang === 'zh'
            ? `贡献 ${ins.data.share}% 净营收（${formatCurrency(Number(ins.data.revenue), currency)}），点击查看明细`
            : `Drives ${ins.data.share}% of net revenue (${formatCurrency(Number(ins.data.revenue), currency)}). Inspect orders.`,
      };
    }
    if (ins.code === 'AT_RISK_LTV') {
      return {
        title: lang === 'zh' ? '高价值客户流失风险' : 'High-LTV Churn Exposure',
        desc:
          lang === 'zh'
            ? `${ins.data.count} 家预警客户涉及 ${formatCurrency(Number(ins.data.ltvAtRisk), currency)} LTV（含 ${ins.data.topCompany}）`
            : `${ins.data.count} at-risk accounts represent ${formatCurrency(Number(ins.data.ltvAtRisk), currency)} LTV.`,
      };
    }
    return {
      title: lang === 'zh' ? '试用转付费效率' : 'Trial-to-Paid Conversion',
      desc:
        lang === 'zh'
          ? `试用转付费 ${ins.data.trialToPaid}% · 当前 ${ins.data.unresolvedAlerts} 条预警待处理`
          : `${ins.data.trialToPaid}% trial-to-paid velocity · ${ins.data.unresolvedAlerts} alerts open.`,
    };
  };

  const insightAccent = {
    positive: 'border-emerald-200/80 bg-emerald-50/50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/[0.08] dark:text-emerald-300',
    warning: 'border-amber-200/80 bg-amber-50/50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-300',
    critical: 'border-rose-200/80 bg-rose-50/50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/[0.08] dark:text-rose-300',
    info: 'border-indigo-200/80 bg-indigo-50/50 text-indigo-700 dark:border-indigo-500/25 dark:bg-indigo-500/[0.08] dark:text-indigo-300',
  };

  return (
    <div className="space-y-5">
      {/* Page Header & Global URL-Synced Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              {t('overview.title')}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{t('overview.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="btn-secondary h-8 shrink-0 whitespace-nowrap px-3 text-xs"
          >
            <FileText className="h-3.5 w-3.5 text-indigo-500" />
            <span>{lang === 'zh' ? '导出高管月报' : 'Boardroom Brief'}</span>
          </button>
        </div>

        <div className="surface-card flex flex-wrap items-center gap-2 p-1.5">
          <div className="flex items-center rounded-xl bg-slate-100/90 p-0.5 dark:bg-white/[0.05]">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => updateParam('range', r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  range === r
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1F1F26] dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                {t(`overview.range${r}`)}
              </button>
            ))}
          </div>

          <div className="hidden h-5 w-px bg-slate-200 dark:bg-white/10 sm:block" />

          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={channel}
              onChange={(e) => updateParam('channel', e.target.value)}
              className="h-8 rounded-xl border border-slate-200/90 bg-white px-2.5 py-0 text-xs font-medium leading-8 text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-[#18181D] dark:text-zinc-200"
            >
              {(['ALL', 'ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER'] as const).map((ch) => (
                <option key={ch} value={ch}>
                  {t(`channels.${ch}`)}
                </option>
              ))}
            </select>
          </div>

          <select
            value={planTier}
            onChange={(e) => updateParam('planTier', e.target.value)}
            className="h-8 rounded-xl border border-slate-200/90 bg-white px-2.5 py-0 text-xs font-medium leading-8 text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-[#18181D] dark:text-zinc-200"
          >
            {(['ALL', 'STARTER', 'PRO', 'ENTERPRISE'] as const).map((tier) => (
              <option key={tier} value={tier}>
                {t(`tiers.${tier}`)}
              </option>
            ))}
          </select>

          <div className="flex items-center rounded-xl bg-slate-100/90 p-0.5 dark:bg-white/[0.05]">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => updateParam('granularity', g)}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                  granularity === g
                    ? 'bg-white text-indigo-700 shadow-xs dark:bg-[#1F1F26] dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white'
                }`}
              >
                {t(`overview.granularity${g.charAt(0).toUpperCase() + g.slice(1)}`)}
              </button>
            ))}
          </div>

          {(channel !== 'ALL' || planTier !== 'ALL' || range !== '30d') && (
            <button
              type="button"
              onClick={resetFilters}
              title={t('common.resetFilters')}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Executive North-Star SaaS Health Banner (ARR / NRR / Quick Ratio / Quota Bar) */}
      {exec && kpis && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-[#0F1020] via-[#15162E] to-[#111827] p-5 text-white shadow-[0_8px_30px_rgba(15,23,42,0.16)] dark:border-white/[0.09]">
          <div
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(99,91,255,0.55), transparent 45%), radial-gradient(circle at 90% 80%, rgba(16,185,129,0.35), transparent 40%)',
            }}
          />
          <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-8">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-200/75">
                  <Activity className="h-3.5 w-3.5 text-indigo-400" />
                  {lang === 'zh' ? '年化经常性收入 (ARR)' : 'Annualized ARR'}
                </div>
                <div className="tabular-nums mt-1 text-xl font-bold tracking-tight text-white">
                  {formatCurrency(exec.arr, currency, true)}
                </div>
                <div className="tabular-nums mt-0.5 text-[11px] text-emerald-400">
                  ARPU {formatCurrency(kpis.arpu.value, currency)}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-200/75">
                  <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                  {lang === 'zh' ? '净收入留存 (NRR)' : 'Net Retention (NRR)'}
                </div>
                <div className="tabular-nums mt-1 text-xl font-bold tracking-tight text-white">
                  {exec.nrr.toFixed(1)}%
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {exec.nrr >= 100
                    ? lang === 'zh'
                      ? '健康净扩张区间'
                      : 'Net expansion healthy'
                    : lang === 'zh'
                      ? '需关注续费留存'
                      : 'Monitor renewals'}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-200/75">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  SaaS Quick Ratio
                </div>
                <div className="tabular-nums mt-1 text-xl font-bold tracking-tight text-white">
                  {exec.quickRatio.toFixed(1)}x
                </div>
                <div className="tabular-nums mt-0.5 text-[11px] text-slate-400">
                  {lang === 'zh' ? `流失率 ${kpis.churnRate.value}%` : `Churn ${kpis.churnRate.value}%`}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-200/75">
                  <HeartPulse className="h-3.5 w-3.5 text-sky-400" />
                  {lang === 'zh' ? '客户平均健康度' : 'Avg Health Score'}
                </div>
                <div className="tabular-nums mt-1 text-xl font-bold tracking-tight text-white">
                  {exec.avgHealthScore}
                  <span className="text-xs font-normal text-slate-400"> / 100</span>
                </div>
                <div className="tabular-nums mt-0.5 text-[11px] text-amber-300">
                  {exec.atRiskCustomers} {lang === 'zh' ? '家待跟进预警' : 'at-risk accounts'}
                </div>
              </div>
            </div>

            {/* Period Revenue Quota Attainment Bar */}
            <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-sm lg:col-span-4">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-indigo-100">
                  <Target className="h-3.5 w-3.5 text-emerald-400" />
                  {lang === 'zh' ? '周期营收目标达成率' : 'Period Quota Attainment'}
                </span>
                <span className="tabular-nums font-bold text-emerald-300">
                  {exec.quotaAttainmentPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, exec.quotaAttainmentPct)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between tabular-nums text-[11px] text-slate-300/80">
                <span>{formatCurrency(kpis.totalRevenue.value, currency)}</span>
                <span>
                  {lang === 'zh' ? '目标' : 'Target'} {formatCurrency(exec.periodTarget, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5 Precision KPI Cards */}
      {overviewQuery.isLoading || !kpis ? (
        <KpiSkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label={t('overview.kpiMrr')}
            formattedValue={formatCurrency(kpis.mrr.value, currency)}
            deltaPct={kpis.mrr.deltaPct}
            vsLabel={t('overview.vsPrev')}
            sparkline={kpis.mrr.sparkline}
            accentColor="#635BFF"
          />
          <KpiCard
            label={t('overview.kpiRevenue')}
            formattedValue={formatCurrency(kpis.totalRevenue.value, currency)}
            deltaPct={kpis.totalRevenue.deltaPct}
            vsLabel={t('overview.vsPrev')}
            sparkline={kpis.totalRevenue.sparkline}
            accentColor="#0EA5E9"
          />
          <KpiCard
            label={t('overview.kpiOrders')}
            formattedValue={formatNumber(kpis.ordersCount.value)}
            deltaPct={kpis.ordersCount.deltaPct}
            vsLabel={t('overview.vsPrev')}
            sparkline={kpis.ordersCount.sparkline}
            accentColor="#10B981"
          />
          <KpiCard
            label={t('overview.kpiConversion')}
            formattedValue={formatPercent(kpis.conversionRate.value)}
            deltaPct={kpis.conversionRate.deltaPct}
            vsLabel={t('overview.vsPrev')}
            sparkline={kpis.conversionRate.sparkline}
            accentColor="#8B5CF6"
          />
          <KpiCard
            label={t('overview.kpiRefund')}
            formattedValue={formatPercent(kpis.refundRate.value)}
            deltaPct={kpis.refundRate.deltaPct}
            vsLabel={t('overview.vsPrev')}
            sparkline={kpis.refundRate.sparkline}
            invertTrend
            accentColor="#F59E0B"
          />
        </div>
      )}

      {/* Algorithmic RevOps Diagnostic Insights Strip */}
      {insightsQuery.data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {insightsQuery.data.insights.map((ins) => {
            const copy = renderInsightCopy(ins);
            return (
              <button
                key={ins.id}
                type="button"
                onClick={() => navigate(ins.actionRoute)}
                className="surface-card-interactive group flex items-start justify-between gap-3 p-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`tabular-nums rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${
                        insightAccent[ins.kind]
                      }`}
                    >
                      {ins.metric}
                    </span>
                    <span className="truncate text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {copy.title}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                    {copy.desc}
                  </p>
                </div>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-indigo-500 dark:text-zinc-600" />
              </button>
            );
          })}
        </div>
      )}

      {/* Primary 2x2 High-Density Interactive Chart Matrix */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {timeseriesQuery.isLoading || !timeseriesQuery.data ? (
          <ChartSkeleton />
        ) : (
          <RevenueTrendChart series={timeseriesQuery.data.series} currency={currency} />
        )}

        {channelsQuery.isLoading || !channelsQuery.data ? (
          <ChartSkeleton />
        ) : (
          <ChannelMixChart
            channels={channelsQuery.data.channels}
            totalRevenue={channelsQuery.data.totalRevenue}
            currency={currency}
          />
        )}

        {funnelQuery.isLoading || !funnelQuery.data ? (
          <ChartSkeleton />
        ) : (
          <FunnelChartCard
            overallConversionRate={funnelQuery.data.overallConversionRate}
            stages={funnelQuery.data.stages}
          />
        )}

        {cohortsQuery.isLoading || !cohortsQuery.data ? (
          <ChartSkeleton />
        ) : (
          <CohortHeatmapCard
            offsets={cohortsQuery.data.offsets}
            cohorts={cohortsQuery.data.cohorts}
          />
        )}
      </div>

      {/* Bottom Operational Row: Plan Tier Revenue Stack + Live Telemetry Feed */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          {tierQuery.isLoading || !tierQuery.data ? (
            <ChartSkeleton height="h-60" />
          ) : (
            <TierBreakdownCard data={tierQuery.data} />
          )}
        </div>
        <div className="xl:col-span-5">
          {liveFeedQuery.isLoading || !liveFeedQuery.data ? (
            <ChartSkeleton height="h-60" />
          ) : (
            <LiveTelemetryFeed
              data={liveFeedQuery.data}
              refreshing={liveFeedQuery.isFetching}
              onRefresh={() => liveFeedQuery.refetch()}
            />
          )}
        </div>
      </div>
      <BoardBriefModal
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
        overview={overviewQuery.data}
        channels={channelsQuery.data}
      />
    </div>
  );
}
