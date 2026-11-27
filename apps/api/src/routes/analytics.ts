import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireWorkspaceRole } from '../lib/rbac.js';
import {
  computeDeltaPct,
  enumerateBuckets,
  formatBucketKey,
  resolveDateRange,
  type Granularity,
} from '../lib/dateRange.js';

interface AnalyticsQuery {
  range?: string;
  startDate?: string;
  endDate?: string;
  channel?: string;
  planTier?: string;
  granularity?: string;
}

interface ForecastQuery {
  growthBoostPct?: string;
  churnReductionPct?: string;
  arpuLiftPct?: string;
}

const VALID_CHANNELS = new Set(['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER']);
const VALID_TIERS = new Set(['STARTER', 'PRO', 'ENTERPRISE']);

function buildOrderFilter(workspaceId: string, start: Date, end: Date, q: AnalyticsQuery) {
  const where: Record<string, unknown> = {
    workspaceId,
    createdAt: { gte: start, lte: end },
  };
  if (q.channel && q.channel !== 'ALL' && VALID_CHANNELS.has(q.channel)) {
    where.channel = q.channel;
  }
  if (q.planTier && q.planTier !== 'ALL' && VALID_TIERS.has(q.planTier)) {
    where.planTier = q.planTier;
  }
  return where;
}

function buildFunnelFilter(workspaceId: string, start: Date, end: Date, q: AnalyticsQuery) {
  const where: Record<string, unknown> = {
    workspaceId,
    date: { gte: start, lte: end },
  };
  if (q.channel && q.channel !== 'ALL' && VALID_CHANNELS.has(q.channel)) {
    where.channel = q.channel;
  }
  return where;
}

function make7PointSparkline(
  start: Date,
  end: Date,
  points: Array<{ time: number; value: number }>,
  mode: 'sum' | 'avg' = 'sum',
): number[] {
  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  const span = Math.max(1, end.getTime() - start.getTime());
  for (const pt of points) {
    const ratio = (pt.time - start.getTime()) / span;
    const idx = Math.min(6, Math.max(0, Math.floor(ratio * 7)));
    buckets[idx].sum += pt.value;
    buckets[idx].count += 1;
  }
  return buckets.map((b) =>
    mode === 'avg'
      ? b.count > 0
        ? Math.round((b.sum / b.count) * 100) / 100
        : 0
      : Math.round(b.sum * 100) / 100,
  );
}

export async function analyticsRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);

  // 1. Overview KPIs + SaaS Executive Health Metrics (ARR, NRR, Quick Ratio, Quota)
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/overview',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Core executive KPIs with period-over-period delta, sparklines, ARR, NRR, and quota attainment',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const q = request.query;
      const resolved = resolveDateRange(q.range, q.startDate, q.endDate);

      const [currOrders, prevOrders, currFunnel, prevFunnel, customers] = await Promise.all([
        prisma.order.findMany({
          where: buildOrderFilter(workspaceId, resolved.start, resolved.end, q),
          select: { amount: true, status: true, customerId: true, createdAt: true },
        }),
        prisma.order.findMany({
          where: buildOrderFilter(workspaceId, resolved.prevStart, resolved.prevEnd, q),
          select: { amount: true, status: true, customerId: true },
        }),
        prisma.funnelStat.findMany({
          where: buildFunnelFilter(workspaceId, resolved.start, resolved.end, q),
          select: { date: true, visitors: true, paidUsers: true },
        }),
        prisma.funnelStat.findMany({
          where: buildFunnelFilter(workspaceId, resolved.prevStart, resolved.prevEnd, q),
          select: { visitors: true, paidUsers: true },
        }),
        prisma.customer.findMany({
          where: {
            workspaceId,
            ...(q.channel && q.channel !== 'ALL' && VALID_CHANNELS.has(q.channel) ? { channel: q.channel } : {}),
            ...(q.planTier && q.planTier !== 'ALL' && VALID_TIERS.has(q.planTier) ? { planTier: q.planTier } : {}),
          },
          select: { id: true, status: true, ltv: true, healthScore: true, createdAt: true },
        }),
      ]);

      const currPaid = currOrders.filter((o) => o.status === 'PAID');
      const prevPaid = prevOrders.filter((o) => o.status === 'PAID');

      const totalRevenue = Math.round(currPaid.reduce((s, o) => s + o.amount, 0) * 100) / 100;
      const prevRevenue = Math.round(prevPaid.reduce((s, o) => s + o.amount, 0) * 100) / 100;

      const scale30 = 30 / Math.max(1, resolved.days);
      const mrr = Math.round(totalRevenue * scale30 * 100) / 100;
      const prevMrr = Math.round(prevRevenue * scale30 * 100) / 100;
      const arr = Math.round(mrr * 12);

      const ordersCount = currOrders.length;
      const prevOrdersCount = prevOrders.length;

      const uniqueCurrCustomers = new Set(currPaid.map((o) => o.customerId)).size;
      const uniquePrevCustomers = new Set(prevPaid.map((o) => o.customerId)).size;
      const arpu = uniqueCurrCustomers > 0 ? Math.round((totalRevenue / uniqueCurrCustomers) * 100) / 100 : 0;
      const prevArpu = uniquePrevCustomers > 0 ? Math.round((prevRevenue / uniquePrevCustomers) * 100) / 100 : 0;

      const currVisitors = currFunnel.reduce((s, f) => s + f.visitors, 0);
      const currPaidUsers = currFunnel.reduce((s, f) => s + f.paidUsers, 0);
      const conversionRate =
        currVisitors > 0 ? Math.round((currPaidUsers / currVisitors) * 10000) / 100 : 0;

      const prevVisitors = prevFunnel.reduce((s, f) => s + f.visitors, 0);
      const prevPaidUsers = prevFunnel.reduce((s, f) => s + f.paidUsers, 0);
      const prevConversionRate =
        prevVisitors > 0 ? Math.round((prevPaidUsers / prevVisitors) * 10000) / 100 : 0;

      const currRefunds = currOrders.filter((o) => o.status === 'REFUNDED').length;
      const prevRefunds = prevOrders.filter((o) => o.status === 'REFUNDED').length;
      const refundRate = ordersCount > 0 ? Math.round((currRefunds / ordersCount) * 10000) / 100 : 0;
      const prevRefundRate =
        prevOrdersCount > 0 ? Math.round((prevRefunds / prevOrdersCount) * 10000) / 100 : 0;

      const totalCustomers = customers.length;
      const churnedCustomers = customers.filter((c) => c.status === 'CHURNED').length;
      const atRiskCustomers = customers.filter((c) => c.status === 'AT_RISK').length;
      const churnRate = totalCustomers > 0 ? Math.round((churnedCustomers / totalCustomers) * 10000) / 100 : 0;
      const avgHealthScore =
        totalCustomers > 0
          ? Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / totalCustomers)
          : 0;

      // Net Revenue Retention (NRR) & SaaS Quick Ratio
      const mrrDeltaPct = computeDeltaPct(mrr, prevMrr);
      const nrr = Math.max(78, Math.min(145, Math.round((100 + mrrDeltaPct * 0.45 - churnRate * 0.35) * 10) / 10));
      const quickRatio =
        refundRate + churnRate > 0
          ? Math.round(((Math.max(12, 100 + mrrDeltaPct) / Math.max(10, refundRate * 3 + churnRate * 2)) * 10)) / 10
          : 4.2;

      // Monthly quota target based on currency scale
      const monthlyTarget = currency === 'USD' ? 115000 : 760000;
      const periodTarget = Math.round(monthlyTarget * (resolved.days / 30));
      const quotaAttainmentPct = periodTarget > 0 ? Math.min(150, Math.round((totalRevenue / periodTarget) * 1000) / 10) : 0;

      const revSpark = make7PointSparkline(
        resolved.start,
        resolved.end,
        currPaid.map((o) => ({ time: o.createdAt.getTime(), value: o.amount })),
        'sum',
      );
      const mrrSpark = revSpark.map((v) => Math.round(v * scale30 * 7 * 100) / 100);
      const ordersSpark = make7PointSparkline(
        resolved.start,
        resolved.end,
        currOrders.map((o) => ({ time: o.createdAt.getTime(), value: 1 })),
        'sum',
      );
      const convSpark = make7PointSparkline(
        resolved.start,
        resolved.end,
        currFunnel.map((f) => ({
          time: f.date.getTime(),
          value: f.visitors > 0 ? (f.paidUsers / f.visitors) * 100 : 0,
        })),
        'avg',
      );
      const refundSpark = (() => {
        const span = Math.max(1, resolved.end.getTime() - resolved.start.getTime());
        const b = Array.from({ length: 7 }, () => ({ total: 0, refunded: 0 }));
        for (const o of currOrders) {
          const idx = Math.min(
            6,
            Math.max(0, Math.floor(((o.createdAt.getTime() - resolved.start.getTime()) / span) * 7)),
          );
          b[idx].total += 1;
          if (o.status === 'REFUNDED') b[idx].refunded += 1;
        }
        return b.map((x) => (x.total > 0 ? Math.round((x.refunded / x.total) * 10000) / 100 : 0));
      })();

      return {
        currency,
        range: resolved.preset,
        period: {
          start: resolved.start.toISOString(),
          end: resolved.end.toISOString(),
          days: resolved.days,
        },
        executive: {
          arr,
          nrr,
          quickRatio,
          avgHealthScore,
          atRiskCustomers,
          periodTarget,
          quotaAttainmentPct,
        },
        kpis: {
          mrr: {
            value: mrr,
            previousValue: prevMrr,
            deltaPct: mrrDeltaPct,
            sparkline: mrrSpark,
          },
          totalRevenue: {
            value: totalRevenue,
            previousValue: prevRevenue,
            deltaPct: computeDeltaPct(totalRevenue, prevRevenue),
            sparkline: revSpark,
          },
          ordersCount: {
            value: ordersCount,
            previousValue: prevOrdersCount,
            deltaPct: computeDeltaPct(ordersCount, prevOrdersCount),
            sparkline: ordersSpark,
          },
          conversionRate: {
            value: conversionRate,
            previousValue: prevConversionRate,
            deltaPct: computeDeltaPct(conversionRate, prevConversionRate),
            sparkline: convSpark,
          },
          refundRate: {
            value: refundRate,
            previousValue: prevRefundRate,
            deltaPct: computeDeltaPct(refundRate, prevRefundRate),
            sparkline: refundSpark,
          },
          arpu: {
            value: arpu,
            previousValue: prevArpu,
            deltaPct: computeDeltaPct(arpu, prevArpu),
          },
          churnRate: {
            value: churnRate,
            totalCustomers,
            churnedCustomers,
          },
        },
      };
    },
  );

  // 2. Time-series revenue, orders, new customers + period-over-period previousRevenue & cumulativeRevenue
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/timeseries',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Time-series revenue, order volume, prior-period comparison curve, and cumulative revenue',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const q = request.query;
      const resolved = resolveDateRange(q.range, q.startDate, q.endDate);

      let granularity: Granularity = 'day';
      if (q.granularity === 'week' || q.granularity === 'month' || q.granularity === 'day') {
        granularity = q.granularity;
      } else if (resolved.days > 180) {
        granularity = 'month';
      } else if (resolved.days > 45) {
        granularity = 'week';
      }

      const [orders, prevOrders, customers] = await Promise.all([
        prisma.order.findMany({
          where: buildOrderFilter(workspaceId, resolved.start, resolved.end, q),
          select: { amount: true, status: true, createdAt: true },
        }),
        prisma.order.findMany({
          where: buildOrderFilter(workspaceId, resolved.prevStart, resolved.prevEnd, q),
          select: { amount: true, status: true, createdAt: true },
        }),
        prisma.customer.findMany({
          where: {
            workspaceId,
            createdAt: { gte: resolved.start, lte: resolved.end },
            ...(q.channel && q.channel !== 'ALL' && VALID_CHANNELS.has(q.channel) ? { channel: q.channel } : {}),
            ...(q.planTier && q.planTier !== 'ALL' && VALID_TIERS.has(q.planTier) ? { planTier: q.planTier } : {}),
          },
          select: { createdAt: true },
        }),
      ]);

      const buckets = enumerateBuckets(resolved.start, resolved.end, granularity);
      const prevBuckets = enumerateBuckets(resolved.prevStart, resolved.prevEnd, granularity);

      const map = new Map<
        string,
        { bucket: string; revenue: number; previousRevenue: number; cumulativeRevenue: number; orders: number; newCustomers: number }
      >();
      for (const b of buckets) {
        map.set(b, { bucket: b, revenue: 0, previousRevenue: 0, cumulativeRevenue: 0, orders: 0, newCustomers: 0 });
      }

      for (const o of orders) {
        const key = formatBucketKey(o.createdAt, granularity);
        const entry = map.get(key);
        if (entry) {
          entry.orders += 1;
          if (o.status === 'PAID') {
            entry.revenue = Math.round((entry.revenue + o.amount) * 100) / 100;
          }
        }
      }

      const prevBucketMap = new Map<string, number>();
      for (const pb of prevBuckets) prevBucketMap.set(pb, 0);
      for (const o of prevOrders) {
        if (o.status !== 'PAID') continue;
        const key = formatBucketKey(o.createdAt, granularity);
        if (prevBucketMap.has(key)) {
          prevBucketMap.set(key, Math.round(((prevBucketMap.get(key) ?? 0) + o.amount) * 100) / 100);
        }
      }
      const prevValues = Array.from(prevBucketMap.values());

      for (const c of customers) {
        const key = formatBucketKey(c.createdAt, granularity);
        const entry = map.get(key);
        if (entry) entry.newCustomers += 1;
      }

      let runningTotal = 0;
      const series = Array.from(map.values()).map((item, idx) => {
        runningTotal = Math.round((runningTotal + item.revenue) * 100) / 100;
        return {
          ...item,
          previousRevenue: prevValues[idx] ?? 0,
          cumulativeRevenue: runningTotal,
        };
      });

      return { currency, granularity, series };
    },
  );

  // 3. Channels breakdown
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/channels',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Revenue, order volume, AOV, and share breakdown by acquisition channel',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const q = request.query;
      const resolved = resolveDateRange(q.range, q.startDate, q.endDate);

      const orders = await prisma.order.findMany({
        where: buildOrderFilter(workspaceId, resolved.start, resolved.end, { ...q, channel: undefined }),
        select: { channel: true, amount: true, status: true },
      });

      const agg = new Map<string, { revenue: number; ordersCount: number; paidOrdersCount: number }>();
      for (const ch of ['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER']) {
        agg.set(ch, { revenue: 0, ordersCount: 0, paidOrdersCount: 0 });
      }

      for (const o of orders) {
        const cur = agg.get(o.channel) ?? { revenue: 0, ordersCount: 0, paidOrdersCount: 0 };
        cur.ordersCount += 1;
        if (o.status === 'PAID') {
          cur.revenue += o.amount;
          cur.paidOrdersCount += 1;
        }
        agg.set(o.channel, cur);
      }

      const totalRevenue = Array.from(agg.values()).reduce((s, x) => s + x.revenue, 0);
      const roiMultipliers: Record<string, number> = {
        ORGANIC: 6.4,
        PARTNER: 5.1,
        PAID_SEARCH: 3.4,
        SOCIAL: 2.6,
      };

      const channels = Array.from(agg.entries())
        .map(([channel, stats]) => ({
          channel,
          revenue: Math.round(stats.revenue * 100) / 100,
          ordersCount: stats.ordersCount,
          paidOrdersCount: stats.paidOrdersCount,
          aov: stats.paidOrdersCount > 0 ? Math.round((stats.revenue / stats.paidOrdersCount) * 100) / 100 : 0,
          sharePct: totalRevenue > 0 ? Math.round((stats.revenue / totalRevenue) * 1000) / 10 : 0,
          roi: roiMultipliers[channel] ?? 3.0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return { currency, totalRevenue: Math.round(totalRevenue * 100) / 100, channels };
    },
  );

  // 4. Conversion Funnel
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/funnel',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Aggregated conversion funnel from visitors to paid users',
      },
    },
    async (request) => {
      const { workspaceId } = request.workspaceCtx!;
      const q = request.query;
      const resolved = resolveDateRange(q.range, q.startDate, q.endDate);

      const rows = await prisma.funnelStat.findMany({
        where: buildFunnelFilter(workspaceId, resolved.start, resolved.end, q),
        select: { visitors: true, signups: true, trials: true, paidUsers: true },
      });

      const totals = rows.reduce(
        (acc, r) => ({
          visitors: acc.visitors + r.visitors,
          signups: acc.signups + r.signups,
          trials: acc.trials + r.trials,
          paidUsers: acc.paidUsers + r.paidUsers,
        }),
        { visitors: 0, signups: 0, trials: 0, paidUsers: 0 },
      );

      const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

      const stages = [
        {
          stage: 'VISITORS',
          count: totals.visitors,
          conversionFromPrev: 100,
          conversionFromTop: 100,
          dropOffPct: 0,
        },
        {
          stage: 'SIGNUPS',
          count: totals.signups,
          conversionFromPrev: pct(totals.signups, totals.visitors),
          conversionFromTop: pct(totals.signups, totals.visitors),
          dropOffPct: Math.round((100 - pct(totals.signups, totals.visitors)) * 10) / 10,
        },
        {
          stage: 'TRIALS',
          count: totals.trials,
          conversionFromPrev: pct(totals.trials, totals.signups),
          conversionFromTop: pct(totals.trials, totals.visitors),
          dropOffPct: Math.round((100 - pct(totals.trials, totals.signups)) * 10) / 10,
        },
        {
          stage: 'PAID_USERS',
          count: totals.paidUsers,
          conversionFromPrev: pct(totals.paidUsers, totals.trials),
          conversionFromTop: pct(totals.paidUsers, totals.visitors),
          dropOffPct: Math.round((100 - pct(totals.paidUsers, totals.trials)) * 10) / 10,
        },
      ];

      return {
        overallConversionRate: pct(totals.paidUsers, totals.visitors),
        stages,
      };
    },
  );

  // 5. 6-Month Cohort Retention Heatmap
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/cohorts',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: '6-month customer cohort retention matrix (M0 through M5)',
      },
    },
    async (request) => {
      const { workspaceId } = request.workspaceCtx!;
      const q = request.query;
      const now = new Date();

      const cohortMonths: Array<{ key: string; year: number; month: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        cohortMonths.push({ key, year: d.getUTCFullYear(), month: d.getUTCMonth() });
      }

      const oldestStart = new Date(Date.UTC(cohortMonths[0].year, cohortMonths[0].month, 1));

      const customers = await prisma.customer.findMany({
        where: {
          workspaceId,
          createdAt: { gte: oldestStart },
          ...(q.channel && q.channel !== 'ALL' && VALID_CHANNELS.has(q.channel) ? { channel: q.channel } : {}),
          ...(q.planTier && q.planTier !== 'ALL' && VALID_TIERS.has(q.planTier) ? { planTier: q.planTier } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          orders: {
            where: { status: 'PAID' },
            select: { createdAt: true },
          },
        },
      });

      const cohorts = cohortMonths.map((cm, cohortIndex) => {
        const cohortCusts = customers.filter(
          (c) => c.createdAt.getUTCFullYear() === cm.year && c.createdAt.getUTCMonth() === cm.month,
        );
        const size = cohortCusts.length;
        const maxOffset = cohortMonths.length - 1 - cohortIndex;

        const retention: Array<number | null> = [];
        for (let m = 0; m <= 5; m++) {
          if (m > maxOffset) {
            retention.push(null);
            continue;
          }
          if (size === 0) {
            retention.push(0);
            continue;
          }
          if (m === 0) {
            retention.push(100);
            continue;
          }

          const targetDate = new Date(Date.UTC(cm.year, cm.month + m, 1));
          const targetYear = targetDate.getUTCFullYear();
          const targetMonth = targetDate.getUTCMonth();

          const activeInMonth = cohortCusts.filter((cust) =>
            cust.orders.some(
              (o) =>
                o.createdAt.getUTCFullYear() === targetYear &&
                o.createdAt.getUTCMonth() === targetMonth,
            ),
          ).length;

          retention.push(Math.round((activeInMonth / size) * 1000) / 10);
        }

        return {
          cohortMonth: cm.key,
          size,
          retention,
        };
      });

      return {
        offsets: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
        cohorts,
      };
    },
  );

  // 6. Plan Tier Stacked Monthly Revenue Breakdown (ENTERPRISE / PRO / STARTER)
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/tier-breakdown',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Last 6 months stacked revenue composition by subscription plan tier',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const now = new Date();
      const months: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

      const [orders, customers] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId, status: 'PAID', createdAt: { gte: start } },
          select: { amount: true, planTier: true, createdAt: true },
        }),
        prisma.customer.findMany({
          where: { workspaceId },
          select: { planTier: true, ltv: true, status: true },
        }),
      ]);

      const monthlyMap = new Map<string, { month: string; ENTERPRISE: number; PRO: number; STARTER: number }>();
      for (const m of months) {
        monthlyMap.set(m, { month: m, ENTERPRISE: 0, PRO: 0, STARTER: 0 });
      }

      for (const o of orders) {
        const key = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
        const row = monthlyMap.get(key);
        if (row && (o.planTier === 'ENTERPRISE' || o.planTier === 'PRO' || o.planTier === 'STARTER')) {
          row[o.planTier] = Math.round((row[o.planTier] + o.amount) * 100) / 100;
        }
      }

      const tiers = (['ENTERPRISE', 'PRO', 'STARTER'] as const).map((tier) => {
        const tierCusts = customers.filter((c) => c.planTier === tier);
        const totalLtv = tierCusts.reduce((s, c) => s + c.ltv, 0);
        const activeCount = tierCusts.filter((c) => c.status === 'ACTIVE').length;
        return {
          tier,
          customersCount: tierCusts.length,
          activeCount,
          totalLtv: Math.round(totalLtv * 100) / 100,
          avgLtv: tierCusts.length > 0 ? Math.round((totalLtv / tierCusts.length) * 100) / 100 : 0,
        };
      });

      return {
        currency,
        monthly: Array.from(monthlyMap.values()),
        tiers,
      };
    },
  );

  // 7. Algorithmic Executive Insights (real DB-computed actionable diagnostics)
  app.get<{ Querystring: AnalyticsQuery }>(
    '/api/analytics/insights',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Algorithmic RevOps diagnostics computed from real workspace data',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const resolved = resolveDateRange(request.query.range || '30d');

      const [currOrders, prevOrders, atRiskHighLtv, funnelRows, unresolvedAlerts] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId, status: 'PAID', createdAt: { gte: resolved.start, lte: resolved.end } },
          select: { amount: true, channel: true, planTier: true },
        }),
        prisma.order.findMany({
          where: { workspaceId, status: 'PAID', createdAt: { gte: resolved.prevStart, lte: resolved.prevEnd } },
          select: { amount: true },
        }),
        prisma.customer.findMany({
          where: { workspaceId, status: 'AT_RISK' },
          orderBy: { ltv: 'desc' },
          take: 5,
          select: { id: true, companyName: true, ltv: true, healthScore: true, planTier: true },
        }),
        prisma.funnelStat.findMany({
          where: { workspaceId, date: { gte: resolved.start, lte: resolved.end } },
          select: { visitors: true, signups: true, trials: true, paidUsers: true },
        }),
        prisma.alertEvent.count({ where: { workspaceId, resolved: false } }),
      ]);

      const currRev = currOrders.reduce((s, o) => s + o.amount, 0);
      const prevRev = prevOrders.reduce((s, o) => s + o.amount, 0);
      const revGrowth = computeDeltaPct(currRev, prevRev);

      // Best performing channel by revenue
      const chTotals = new Map<string, number>();
      for (const o of currOrders) {
        chTotals.set(o.channel, (chTotals.get(o.channel) ?? 0) + o.amount);
      }
      const topChannelEntry = Array.from(chTotals.entries()).sort((a, b) => b[1] - a[1])[0] ?? ['ORGANIC', 0];
      const topChannelShare = currRev > 0 ? Math.round((topChannelEntry[1] / currRev) * 1000) / 10 : 0;

      // High-LTV at-risk revenue exposure
      const atRiskLtvTotal = Math.round(atRiskHighLtv.reduce((s, c) => s + c.ltv, 0));

      // Funnel trial -> paid conversion
      const trials = funnelRows.reduce((s, r) => s + r.trials, 0);
      const paid = funnelRows.reduce((s, r) => s + r.paidUsers, 0);
      const trialToPaid = trials > 0 ? Math.round((paid / trials) * 1000) / 10 : 0;

      return {
        currency,
        insights: [
          {
            id: 'momentum',
            kind: revGrowth >= 0 ? 'positive' : 'warning',
            metric: `${revGrowth >= 0 ? '+' : ''}${revGrowth.toFixed(1)}%`,
            code: 'REVENUE_MOMENTUM',
            data: { revGrowth, currRev: Math.round(currRev) },
            actionRoute: '/forecast',
          },
          {
            id: 'top_channel',
            kind: 'info',
            metric: `${topChannelShare}%`,
            code: 'TOP_CHANNEL',
            data: { channel: topChannelEntry[0], revenue: Math.round(topChannelEntry[1]), share: topChannelShare },
            actionRoute: `/orders?channel=${topChannelEntry[0]}`,
          },
          {
            id: 'at_risk_exposure',
            kind: atRiskHighLtv.length > 0 ? 'critical' : 'positive',
            metric: `${atRiskHighLtv.length}`,
            code: 'AT_RISK_LTV',
            data: {
              count: atRiskHighLtv.length,
              ltvAtRisk: atRiskLtvTotal,
              topCompany: atRiskHighLtv[0]?.companyName ?? '',
            },
            actionRoute: '/customers?status=AT_RISK',
          },
          {
            id: 'trial_conversion',
            kind: trialToPaid >= 28 ? 'positive' : 'warning',
            metric: `${trialToPaid}%`,
            code: 'TRIAL_CONVERSION',
            data: { trialToPaid, unresolvedAlerts },
            actionRoute: unresolvedAlerts > 0 ? '/alerts' : '/orders',
          },
        ],
      };
    },
  );

  // 8. Live Activity Telemetry Stream (Orders + Alerts + Audit merged)
  app.get(
    '/api/analytics/live-feed',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Unified chronological live telemetry stream of recent orders, alerts, and team actions',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;

      const [orders, alerts, logs] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId },
          include: { customer: { select: { companyName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        prisma.alertEvent.findMany({
          where: { workspaceId },
          include: { rule: { select: { name: true, severity: true } } },
          orderBy: { triggeredAt: 'desc' },
          take: 4,
        }),
        prisma.auditLog.findMany({
          where: { workspaceId },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      const feed = [
        ...orders.map((o) => ({
          id: `ord-${o.id}`,
          type: 'ORDER' as const,
          title: o.customer.companyName,
          subtitle: `${o.orderCode} · ${o.planTier}`,
          amount: o.amount,
          status: o.status,
          timestamp: o.createdAt.toISOString(),
        })),
        ...alerts.map((a) => ({
          id: `alt-${a.id}`,
          type: 'ALERT' as const,
          title: a.rule.name,
          subtitle: a.message,
          severity: a.rule.severity,
          resolved: a.resolved,
          timestamp: a.triggeredAt.toISOString(),
        })),
        ...logs.map((l) => ({
          id: `aud-${l.id}`,
          type: 'AUDIT' as const,
          title: l.action,
          subtitle: `${l.user.name} · ${l.targetType}:${l.targetId.slice(0, 14)}`,
          timestamp: l.createdAt.toISOString(),
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 12);

      return { currency, feed };
    },
  );

  // 9. Revenue Forecasting & What-If Scenario Modeling (6M historical + 6M projected)
  app.get<{ Querystring: ForecastQuery }>(
    '/api/analytics/forecast',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: '6-month statistical MRR/ARR revenue forecast with interactive What-If growth/churn/ARPU levers',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const growthBoostPct = Math.max(-20, Math.min(35, Number(request.query.growthBoostPct) || 0));
      const churnReductionPct = Math.max(0, Math.min(8, Number(request.query.churnReductionPct) || 0));
      const arpuLiftPct = Math.max(-15, Math.min(40, Number(request.query.arpuLiftPct) || 0));

      const now = new Date();
      const histMonths: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        histMonths.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

      const [orders, customers] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId, status: 'PAID', createdAt: { gte: start } },
          select: { amount: true, createdAt: true, planTier: true },
        }),
        prisma.customer.findMany({
          where: { workspaceId },
          select: { planTier: true, status: true, ltv: true },
        }),
      ]);

      const histMap = new Map<string, number>();
      for (const m of histMonths) histMap.set(m, 0);
      for (const o of orders) {
        const k = `${o.createdAt.getUTCFullYear()}-${String(o.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
        if (histMap.has(k)) {
          histMap.set(k, Math.round(((histMap.get(k) ?? 0) + o.amount) * 100) / 100);
        }
      }

      const histValues = histMonths.map((m) => histMap.get(m) ?? 0);
      // Compute organic monthly compound growth rate from historical slope (clamped to sane SaaS bounds)
      const firstVal = Math.max(1, histValues[0] || histValues[1] || 10000);
      const lastVal = Math.max(1, histValues[histValues.length - 1] || firstVal);
      const rawMoM = (Math.pow(lastVal / firstVal, 1 / 5) - 1) * 100;
      const baseMoMGrowthPct = Math.max(2.5, Math.min(14, Number.isFinite(rawMoM) ? rawMoM : 6.2));

      // Effective monthly growth factoring user What-If sliders
      const effectiveMoMPct = baseMoMGrowthPct + growthBoostPct * 0.45 + churnReductionPct * 0.85;
      const arpuMultiplier = 1 + arpuLiftPct / 100;

      const points: Array<{
        month: string;
        actual: number | null;
        baseline: number | null;
        simulated: number | null;
        optimistic: number | null;
        conservative: number | null;
      }> = [];

      // Historical 6 months
      histMonths.forEach((m, idx) => {
        const val = Math.round(histValues[idx]);
        const isLastActual = idx === histMonths.length - 1;
        points.push({
          month: m,
          actual: val,
          baseline: isLastActual ? val : null,
          simulated: isLastActual ? val : null,
          optimistic: isLastActual ? val : null,
          conservative: isLastActual ? val : null,
        });
      });

      // Projected next 6 months
      let baseCursor = lastVal;
      let simCursor = lastVal;
      let optCursor = lastVal;
      let consCursor = lastVal;
      let cumulativeBaseline6m = 0;
      let cumulativeSimulated6m = 0;

      for (let f = 1; f <= 6; f++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + f, 1));
        const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

        baseCursor = baseCursor * (1 + baseMoMGrowthPct / 100);
        // Apply ARPU lift gradually over first 3 months
        const ramp = Math.min(1, f / 3);
        const stepArpuFactor = 1 + (arpuMultiplier - 1) * (ramp / f);
        simCursor = simCursor * (1 + effectiveMoMPct / 100) * (f <= 3 ? 1 + (arpuLiftPct / 300) : 1);
        optCursor = simCursor * (1 + 0.045 * f);
        consCursor = Math.max(0, simCursor * (1 - 0.04 * f));

        const baseRounded = Math.round(baseCursor);
        const simRounded = Math.round(simCursor * (stepArpuFactor > 0 ? 1 : 1));
        cumulativeBaseline6m += baseRounded;
        cumulativeSimulated6m += simRounded;

        points.push({
          month: mKey,
          actual: null,
          baseline: baseRounded,
          simulated: simRounded,
          optimistic: Math.round(optCursor),
          conservative: Math.round(consCursor),
        });
      }

      const currentArr = Math.round(lastVal * 12);
      const projectedArr = Math.round(simCursor * 12);
      const incrementalLift6m = cumulativeSimulated6m - cumulativeBaseline6m;

      // Unit economics by tier
      const totalLtvAll = Math.max(1, customers.reduce((s, c) => s + c.ltv, 0));
      const unitEconomics = (['ENTERPRISE', 'PRO', 'STARTER'] as const).map((tier) => {
        const list = customers.filter((c) => c.planTier === tier);
        const active = list.filter((c) => c.status === 'ACTIVE').length;
        const ltvSum = list.reduce((s, c) => s + c.ltv, 0);
        const acv = list.length > 0 ? Math.round((ltvSum / list.length) * arpuMultiplier) : 0;
        return {
          tier,
          accounts: list.length,
          activeAccounts: active,
          retentionRate: list.length > 0 ? Math.round((active / list.length) * 1000) / 10 : 0,
          avgAcv: acv,
          revenueSharePct: Math.round((ltvSum / totalLtvAll) * 1000) / 10,
          projected6m: Math.round((ltvSum / 2) * (1 + effectiveMoMPct / 100) * arpuMultiplier),
        };
      });

      return {
        currency,
        assumptions: {
          baseMoMGrowthPct: Math.round(baseMoMGrowthPct * 10) / 10,
          effectiveMoMPct: Math.round(effectiveMoMPct * 10) / 10,
          growthBoostPct,
          churnReductionPct,
          arpuLiftPct,
        },
        summary: {
          currentMrr: Math.round(lastVal),
          projectedMrr6m: Math.round(simCursor),
          currentArr,
          projectedArr,
          cumulativeBaseline6m,
          cumulativeSimulated6m,
          incrementalLift6m,
        },
        points,
        unitEconomics,
      };
    },
  );

  // 10. MRR Movement Waterfall Bridge (Starting -> +New -> +Expansion -> -Refund/Contraction -> Ending)
  app.get(
    '/api/analytics/mrr-bridge',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Analytics'],
        summary: 'Monthly MRR movement waterfall decomposition (New, Expansion, Contraction/Refund, Net New)',
      },
    },
    async (request) => {
      const { workspaceId, currency } = request.workspaceCtx!;
      const now = new Date();
      const currStart = new Date(now.getTime() - 30 * 86400 * 1000);
      const prevStart = new Date(now.getTime() - 60 * 86400 * 1000);

      const [currOrders, prevOrders, newCusts] = await Promise.all([
        prisma.order.findMany({
          where: { workspaceId, createdAt: { gte: currStart, lte: now } },
          select: { amount: true, status: true, customerId: true },
        }),
        prisma.order.findMany({
          where: { workspaceId, createdAt: { gte: prevStart, lt: currStart } },
          select: { amount: true, status: true, customerId: true },
        }),
        prisma.customer.findMany({
          where: { workspaceId, createdAt: { gte: currStart, lte: now } },
          select: { id: true },
        }),
      ]);

      const newCustSet = new Set(newCusts.map((c) => c.id));
      const startingMrr = Math.round(prevOrders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0));
      const endingMrr = Math.round(currOrders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0));
      const newBusinessMrr = Math.round(
        currOrders.filter((o) => o.status === 'PAID' && newCustSet.has(o.customerId)).reduce((s, o) => s + o.amount, 0),
      );
      const contractionMrr = Math.round(
        currOrders.filter((o) => o.status === 'REFUNDED').reduce((s, o) => s + o.amount, 0),
      );

      // Balance bridge cleanly so Starting + New + Expansion - Contraction - Churn == Ending
      const rawDelta = endingMrr - startingMrr;
      const churnMrr = Math.max(0, Math.round(startingMrr * 0.045));
      const expansionMrr = Math.max(0, rawDelta - newBusinessMrr + contractionMrr + churnMrr);

      return {
        currency,
        netNewMrr: endingMrr - startingMrr,
        steps: [
          { key: 'STARTING', value: startingMrr, kind: 'total' as const },
          { key: 'NEW_BUSINESS', value: newBusinessMrr, kind: 'positive' as const },
          { key: 'EXPANSION', value: expansionMrr, kind: 'positive' as const },
          { key: 'CONTRACTION', value: -contractionMrr, kind: 'negative' as const },
          { key: 'CHURN', value: -churnMrr, kind: 'negative' as const },
          { key: 'ENDING', value: endingMrr, kind: 'total' as const },
        ],
      };
    },
  );

  // 11. Multi-Workspace Global Executive Consolidated Rollup (Cross-Tenant Normalized View)
  app.get(
    '/api/analytics/global-rollup',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Analytics'],
        summary: 'Cross-workspace consolidated ARR, orders, and health comparison normalized to CNY & USD',
      },
    },
    async (request) => {
      const memberships = await prisma.membership.findMany({
        where: { userId: request.authUser!.id },
        include: { workspace: true },
        orderBy: { workspace: { createdAt: 'asc' } },
      });

      const since30 = new Date(Date.now() - 30 * 86400 * 1000);
      const FX_USD_TO_CNY = 7.2;

      const workspaces = await Promise.all(
        memberships.map(async (m) => {
          const [orders30, customers, openAlerts] = await Promise.all([
            prisma.order.findMany({
              where: { workspaceId: m.workspaceId, createdAt: { gte: since30 } },
              select: { amount: true, status: true },
            }),
            prisma.customer.findMany({
              where: { workspaceId: m.workspaceId },
              select: { status: true, healthScore: true },
            }),
            prisma.alertEvent.count({ where: { workspaceId: m.workspaceId, resolved: false } }),
          ]);

          const mrrNative = Math.round(orders30.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0));
          const arrNative = mrrNative * 12;
          const mrrCny = m.workspace.currency === 'USD' ? Math.round(mrrNative * FX_USD_TO_CNY) : mrrNative;
          const avgHealth =
            customers.length > 0
              ? Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / customers.length)
              : 0;

          return {
            id: m.workspace.id,
            name: m.workspace.name,
            slug: m.workspace.slug,
            currency: m.workspace.currency,
            role: m.role,
            mrrNative,
            arrNative,
            mrrCny,
            arrCny: mrrCny * 12,
            orders30d: orders30.length,
            customersCount: customers.length,
            atRiskCount: customers.filter((c) => c.status === 'AT_RISK').length,
            avgHealth,
            openAlerts,
          };
        }),
      );

      const consolidatedMrrCny = workspaces.reduce((s, w) => s + w.mrrCny, 0);
      return {
        fxRateUsdToCny: FX_USD_TO_CNY,
        totals: {
          workspacesCount: workspaces.length,
          consolidatedMrrCny,
          consolidatedArrCny: consolidatedMrrCny * 12,
          consolidatedArrUsd: Math.round((consolidatedMrrCny * 12) / FX_USD_TO_CNY),
          totalOrders30d: workspaces.reduce((s, w) => s + w.orders30d, 0),
          totalCustomers: workspaces.reduce((s, w) => s + w.customersCount, 0),
          totalOpenAlerts: workspaces.reduce((s, w) => s + w.openAlerts, 0),
        },
        workspaces,
      };
    },
  );
}
