import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireWorkspaceRole } from '../lib/rbac.js';

const askSchema = z.object({
  question: z.string().min(1).max(400),
  lang: z.enum(['zh', 'en']).optional(),
});

function fmtMoney(val: number, currency: string): string {
  const sym = currency === 'USD' ? '$' : '¥';
  return `${sym}${Math.round(val).toLocaleString('en-US')}`;
}

export async function copilotRoutes(app: FastifyInstance) {
  const readGuard = requireWorkspaceRole(['OWNER', 'ADMIN', 'ANALYST']);

  app.post(
    '/api/copilot/ask',
    {
      preHandler: [readGuard],
      schema: {
        tags: ['Copilot'],
        summary: 'Natural-language RevOps analyst executing real-time workspace database queries',
      },
    },
    async (request) => {
      const { workspaceId, currency, name: workspaceName } = request.workspaceCtx!;
      const body = askSchema.parse(request.body);
      const q = body.question.trim();
      const lower = q.toLowerCase();
      const isZh = body.lang ? body.lang === 'zh' : /[\u4e00-\u9fa5]/.test(q);

      const now = new Date();
      const start30d = new Date(now.getTime() - 30 * 86400 * 1000);
      const start60d = new Date(now.getTime() - 60 * 86400 * 1000);

      // Intent 1: Churn / At-Risk / High-LTV rescue
      if (/(流失|风险|预警|挽留|健康|risk|churn|health|rescue|at.risk)/i.test(lower)) {
        const atRisk = await prisma.customer.findMany({
          where: { workspaceId, status: 'AT_RISK' },
          orderBy: { ltv: 'desc' },
          take: 6,
          select: { companyName: true, contactName: true, planTier: true, healthScore: true, ltv: true },
        });
        const totalExposure = atRisk.reduce((s, c) => s + c.ltv, 0);
        const top = atRisk[0];

        return {
          intent: 'AT_RISK_DIAGNOSTIC',
          answer: isZh
            ? `在「${workspaceName}」中检测到 **${atRisk.length} 家高优先流失预警企业**，合计暴露生命周期价值 **${fmtMoney(totalExposure, currency)}**。首要需立即跟进的是 **${top?.companyName ?? '暂无'}**（健康分 ${top?.healthScore ?? 0}/100，LTV ${fmtMoney(top?.ltv ?? 0, currency)}）。建议前往「自动化剧本」一键运行「高价值 KA 流失挽留自动化」完成打标与 CSM 派单。`
            : `Detected **${atRisk.length} priority at-risk enterprise accounts** in ${workspaceName} representing **${fmtMoney(totalExposure, currency)}** in LTV exposure. Top priority: **${top?.companyName ?? 'None'}** (Health ${top?.healthScore ?? 0}/100, LTV ${fmtMoney(top?.ltv ?? 0, currency)}). Run the High-LTV Churn Rescue Playbook to escalate immediately.`,
          highlights: [
            { label: isZh ? '高危账户数' : 'At-Risk Accounts', value: `${atRisk.length}` },
            { label: isZh ? '暴露 LTV 总额' : 'LTV at Risk', value: fmtMoney(totalExposure, currency) },
            { label: isZh ? '最低健康评分' : 'Lowest Health', value: `${Math.min(...atRisk.map((c) => c.healthScore), 100)}/100` },
          ],
          table: {
            columns: isZh ? ['企业名称', '订阅层级', '健康分', 'LTV'] : ['Company', 'Tier', 'Health', 'LTV'],
            rows: atRisk.map((c) => [c.companyName, c.planTier, `${c.healthScore}/100`, fmtMoney(c.ltv, currency)]),
          },
          actionLink: { label: isZh ? '查看预警企业列表 →' : 'Inspect At-Risk Accounts →', to: '/customers?status=AT_RISK' },
          suggestions: isZh
            ? ['近30天哪个渠道ROI最高？', '汇总大客户 LTV 排行榜', '目前退款率和订单健康状况？']
            : ['Which channel has the best ROI?', 'Top enterprise accounts by LTV', 'Analyze refund rate and order health'],
        };
      }

      // Intent 2: Channel Attribution / ROI / Marketing
      if (/(渠道|投放|roi|获客|channel|marketing|acquisition|organic|paid)/i.test(lower)) {
        const orders = await prisma.order.findMany({
          where: { workspaceId, status: 'PAID', createdAt: { gte: start30d } },
          select: { channel: true, amount: true },
        });
        const map = new Map<string, { rev: number; cnt: number }>();
        for (const o of orders) {
          const cur = map.get(o.channel) ?? { rev: 0, cnt: 0 };
          cur.rev += o.amount;
          cur.cnt += 1;
          map.set(o.channel, cur);
        }
        const total = Math.max(1, orders.reduce((s, o) => s + o.amount, 0));
        const roiMap: Record<string, number> = { ORGANIC: 6.4, PARTNER: 5.1, PAID_SEARCH: 3.4, SOCIAL: 2.6 };
        const ranked = Array.from(map.entries())
          .map(([ch, s]) => ({
            ch,
            rev: s.rev,
            cnt: s.cnt,
            aov: s.cnt > 0 ? s.rev / s.cnt : 0,
            share: Math.round((s.rev / total) * 1000) / 10,
            roi: roiMap[ch] ?? 3.0,
          }))
          .sort((a, b) => b.rev - a.rev);

        const topRev = ranked[0];
        const topRoi = [...ranked].sort((a, b) => b.roi - a.roi)[0];

        return {
          intent: 'CHANNEL_ROI',
          answer: isZh
            ? `近 30 天「${workspaceName}」营收主力渠道为 **${topRev?.ch ?? 'N/A'}**，贡献 **${fmtMoney(topRev?.rev ?? 0, currency)}**（占比 **${topRev?.share ?? 0}%**）；综合投入产出比最高的是 **${topRoi?.ch ?? 'ORGANIC'}**（**${topRoi?.roi ?? 6.4}x ROI**）。建议将社媒低效预算向自然流量内容与生态合作渠道倾斜。`
            : `Over the last 30 days in ${workspaceName}, **${topRev?.ch ?? 'N/A'}** led total revenue at **${fmtMoney(topRev?.rev ?? 0, currency)}** (**${topRev?.share ?? 0}%** share), while **${topRoi?.ch ?? 'ORGANIC'}** delivered the highest capital efficiency at **${topRoi?.roi ?? 6.4}x ROI**.`,
          highlights: [
            { label: isZh ? '第一创收渠道' : 'Top Revenue Channel', value: topRev?.ch ?? 'N/A' },
            { label: isZh ? '最高 ROI 渠道' : 'Best ROI Channel', value: `${topRoi?.ch ?? 'ORGANIC'} (${topRoi?.roi ?? 6.4}x)` },
            { label: isZh ? '30日已结算总额' : '30D Settled', value: fmtMoney(total, currency) },
          ],
          table: {
            columns: isZh ? ['渠道', '30日净营收', '占比', '客单价', 'ROI'] : ['Channel', '30D Revenue', 'Share', 'AOV', 'ROI'],
            rows: ranked.map((r) => [r.ch, fmtMoney(r.rev, currency), `${r.share}%`, fmtMoney(r.aov, currency), `${r.roi}x`]),
          },
          actionLink: { label: isZh ? '在自定义 BI 报表深入拆解 →' : 'Slice in BI Report Builder →', to: '/reports' },
          suggestions: isZh
            ? ['哪些高价值客户有流失风险？', '下季度 ARR 增长预测如何？', '近30天退款情况如何？']
            : ['Which high-LTV accounts are at risk?', 'Forecast next 6 months ARR', 'Check recent refund anomalies'],
        };
      }

      // Intent 3: Refunds / Invoices / Payment failures
      if (/(退款|开票|失败|异常|refund|invoice|failed|anomaly)/i.test(lower)) {
        const orders = await prisma.order.findMany({
          where: { workspaceId, createdAt: { gte: start30d } },
          include: { customer: { select: { companyName: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const refunded = orders.filter((o) => o.status === 'REFUNDED');
        const uninvoiced = orders.filter((o) => o.status === 'PAID' && !o.invoiced);
        const refundRate = orders.length > 0 ? Math.round((refunded.length / orders.length) * 10000) / 100 : 0;
        const refundAmt = refunded.reduce((s, o) => s + o.amount, 0);

        return {
          intent: 'REFUND_AND_INVOICE_HEALTH',
          answer: isZh
            ? `近 30 天共发生 **${refunded.length} 笔退款**（退款率 **${refundRate}%**，退款总额 **${fmtMoney(refundAmt, currency)}**），另有 **${uninvoiced.length} 笔已支付订单待财务开票**。可在「自动化剧本」一键执行自动开票核销。`
            : `In the trailing 30 days, **${refunded.length} orders were refunded** (**${refundRate}%** rate, totaling **${fmtMoney(refundAmt, currency)}**), and **${uninvoiced.length} settled PAID orders** are pending invoice issuance.`,
          highlights: [
            { label: isZh ? '30日退款率' : '30D Refund Rate', value: `${refundRate}%` },
            { label: isZh ? '退款总额' : 'Refund Volume', value: fmtMoney(refundAmt, currency) },
            { label: isZh ? '待开票已付订单' : 'Uninvoiced Paid', value: `${uninvoiced.length}` },
          ],
          table: {
            columns: isZh ? ['订单编号', '企业客户', '金额', '备注'] : ['Order Code', 'Company', 'Amount', 'Note'],
            rows: refunded.slice(0, 5).map((o) => [o.orderCode, o.customer.companyName, fmtMoney(o.amount, currency), o.note || '—']),
          },
          actionLink: { label: isZh ? '查看退款订单明细 →' : 'Inspect Refunded Orders →', to: '/orders?status=REFUNDED' },
          suggestions: isZh
            ? ['哪些高价值客户有流失风险？', '汇总大客户 LTV 排行榜', '查看本期营收整体诊断']
            : ['Show at-risk high-LTV accounts', 'Top enterprise customers by LTV', 'Executive revenue summary'],
        };
      }

      // Intent 4: Top Customers / VIP / Enterprise LTV Leaderboard
      if (/(排行|top|大客户|enterprise|ltv|头部|vip|企业版)/i.test(lower)) {
        const topCusts = await prisma.customer.findMany({
          where: { workspaceId },
          orderBy: { ltv: 'desc' },
          take: 6,
          select: { companyName: true, planTier: true, healthScore: true, status: true, ltv: true },
        });
        const topSum = topCusts.reduce((s, c) => s + c.ltv, 0);

        return {
          intent: 'TOP_CUSTOMERS_LTV',
          answer: isZh
            ? `「${workspaceName}」Top 6 头部企业客户累计贡献 LTV **${fmtMoney(topSum, currency)}**，榜首为 **${topCusts[0]?.companyName ?? 'N/A'}**（${fmtMoney(topCusts[0]?.ltv ?? 0, currency)}）。建议持续通过客户健康象限监控头部账户活跃度。`
            : `Your top 6 enterprise accounts in ${workspaceName} represent **${fmtMoney(topSum, currency)}** in cumulative LTV, led by **${topCusts[0]?.companyName ?? 'N/A'}** (${fmtMoney(topCusts[0]?.ltv ?? 0, currency)}).`,
          highlights: [
            { label: isZh ? 'Top 6 合计 LTV' : 'Top 6 Combined LTV', value: fmtMoney(topSum, currency) },
            { label: isZh ? '第一大客户' : '#1 Account', value: topCusts[0]?.companyName ?? 'N/A' },
            { label: isZh ? '平均健康分' : 'Avg Health', value: `${Math.round(topCusts.reduce((s, c) => s + c.healthScore, 0) / Math.max(1, topCusts.length))}/100` },
          ],
          table: {
            columns: isZh ? ['企业名称', '层级', '状态', '健康分', '累计 LTV'] : ['Company', 'Tier', 'Status', 'Health', 'LTV'],
            rows: topCusts.map((c) => [c.companyName, c.planTier, c.status, `${c.healthScore}`, fmtMoney(c.ltv, currency)]),
          },
          actionLink: { label: isZh ? '打开客户风险象限矩阵 →' : 'Open Customer Risk Matrix →', to: '/customers' },
          suggestions: isZh
            ? ['哪些高价值客户有流失风险？', '近30天哪个渠道ROI最高？', '预测未来6个月ARR走势']
            : ['Which accounts are at risk?', 'Best acquisition channel by ROI', 'Project 6-month ARR growth'],
        };
      }

      // Default / Executive Summary + Growth Forecast
      const [currOrders, prevOrders, activeCount, alertCount] = await Promise.all([
        prisma.order.findMany({ where: { workspaceId, status: 'PAID', createdAt: { gte: start30d } }, select: { amount: true } }),
        prisma.order.findMany({ where: { workspaceId, status: 'PAID', createdAt: { gte: start60d, lt: start30d } }, select: { amount: true } }),
        prisma.customer.count({ where: { workspaceId, status: 'ACTIVE' } }),
        prisma.alertEvent.count({ where: { workspaceId, resolved: false } }),
      ]);
      const currRev = currOrders.reduce((s, o) => s + o.amount, 0);
      const prevRev = Math.max(1, prevOrders.reduce((s, o) => s + o.amount, 0));
      const growth = Math.round(((currRev - prevRev) / prevRev) * 1000) / 10;
      const arr = currRev * 12;

      return {
        intent: 'EXECUTIVE_BRIEF',
        answer: isZh
          ? `「${workspaceName}」近 30 天已结算净营收 **${fmtMoney(currRev, currency)}**（环比 **${growth >= 0 ? '+' : ''}${growth}%**），年化 ARR 达 **${fmtMoney(arr, currency)}**。当前健康活跃企业 **${activeCount} 家**，待处理预警 **${alertCount} 条**。你可以前往「营收预测与推演」调节获客与流失杠杆，测算未来 6 个月 ARR 增量空间。`
          : `${workspaceName} generated **${fmtMoney(currRev, currency)}** in 30-day settled net revenue (**${growth >= 0 ? '+' : ''}${growth}%** MoM), tracking **${fmtMoney(arr, currency)}** annualized ARR with **${activeCount} active accounts** and **${alertCount} open alerts**.`,
        highlights: [
          { label: isZh ? '30日净营收' : '30D Net Revenue', value: fmtMoney(currRev, currency) },
          { label: isZh ? '环比增速' : 'MoM Velocity', value: `${growth >= 0 ? '+' : ''}${growth}%` },
          { label: isZh ? '年化 ARR' : 'Annualized ARR', value: fmtMoney(arr, currency) },
        ],
        actionLink: { label: isZh ? '进入 What-If 营收推演 →' : 'Launch What-If Forecast →', to: '/forecast' },
        suggestions: isZh
          ? ['哪些高价值客户有流失风险？', '近30天哪个渠道ROI最高？', '汇总大客户 LTV 排行榜', '目前退款率和待开票订单情况？']
          : ['Which high-LTV accounts are at risk?', 'Which channel has the best ROI?', 'Top enterprise customers by LTV', 'Analyze refund rate and uninvoiced orders'],
      };
    },
  );
}
