import { Prisma, PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Deterministic Mulberry32 PRNG for reproducible commercial data
function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS = ['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER'] as const;
const TIERS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;

const CN_COMPANIES = [
  '极光智联科技', '星河数科集团', '云帆跨境供应链', '蓝鲸新零售', '明眸视觉智能',
  '磐石企业服务', '启明星医疗科技', '飞跃物流云', '光年互动娱乐', '海纳新能源',
  '量子餐饮管理', '赤兔电商运营', '凌霄航空数智', '琥珀生物科技', '逐鹿工业互联网',
  '晨曦教育科技', '天穹安全实验室', '千帆出海品牌', '知行汽车软件', '瀚海金融数据',
  '微光数字营销', '苍穹机器人', '织梦服装科技', '白泽智慧农业', '星途文旅科技',
  '领航医药供应链', '鲲鹏云计算', '麦田生鲜连锁', '锐捷智能制造', '华彩美妆品牌',
  '极客健身科技', '远景家居智造', '青藤SaaS咨询', '风行短剧传媒', '鼎盛精密仪器',
  '聚能光伏科技', '智汇人力资源', '新潮母婴电商', '云起宠物食品', '盛唐文创数字',
  '博雅在线出版', '金盾合规科技', '瑞丰冷链物流', '飞鸟即时配送', '墨影3D打印',
  '锦绣茶叶连锁', '恒信财税云', '跃动运动装备', '星火半导体', '清风环保监测',
  '灵犀客服系统', '宏图地理信息', '百川跨境支付', '奇点研发效能', '云杉商业地产',
  '银杏养老健康', '极速仓储科技', '蔚来咖啡连锁', '蓝图建筑BIM', '天翼物联网',
  '星耀电竞装备', '乐活健康食品', '智联安防科技', '慧眼舆情分析', '新锐户外品牌',
  '晨光办公采购', '骏马汽配商城', '华宇精密光学',
];

const CN_CONTACTS = [
  '林致远', '陈思涵', '周明轩', '苏婉清', '陆景深', '许嘉宁', '沈知秋', '唐一鸣',
  '宋星辰', '韩沐阳', '谢雨桐', '冯子墨', '袁清歌', '邓浩然', '傅景行', '钟语嫣',
  '顾言蹊', '江浸月', '贺云起', '方知意', '梁疏影', '魏长风', '叶轻舟', '程锦书',
];

const US_COMPANIES = [
  'Northstar Telemetry Inc.', 'Meridian Cloud Labs', 'Vanguard Retail Systems', 'Apex Freight OS',
  'Helios Energy Analytics', 'Cobalt Health Tech', 'Stratos FinOps', 'Lumina BioSystems',
  'Summit Commerce Group', 'Kestrel Robotics', 'Redwood Supply Chain', 'Cascade Media Corp',
  'Ironclad Security AI', 'Vector Mobility', 'Solstice Consumer Brands', 'Pinnacle MedTech',
  'Harbor Logistics Cloud', 'Obsidian Data Works', 'Evergreen SaaS Partners', 'PulseGrid Energy',
  'Catalyst Growth Labs', 'Boreal Aerospace', 'Silverline Payments', 'Aether Design Systems',
  'Keystone Manufacturing', 'Bluewater Foods Co.', 'Atlas Hospitality Tech', 'Horizon Telecom',
  'Foundry Industrial', 'Veridian AgriTech', 'Crestview Apparel', 'Quantum Retail Ops',
  'Monarch Packaging', 'Beacon Compliance', 'Cinder AI Studios', 'Sequoia Wellness',
  'Alder Digital Health', 'Titan Fleet Solutions', 'Aurora Photonics', 'Kinetic Fitness Labs',
  'Clearpath Recruiting', 'Summit Dental Network', 'Driftwood Coffee Co.', 'Nexus Cyber Defense',
  'Prism AdTech', 'Orbit Satellite Data', 'Timberline Construction', 'Veloce E-Bikes',
  'Mariner Maritime Tech', 'Canyon Outdoor Gear', 'Saffron FoodTech', 'Halcyon Travel OS',
  'Granite Real Estate AI', 'Sparkline EdTech', 'Noble BioLabs', 'Vortex Gaming Gear',
  'Riverbend Cold Chain', 'Copperfield Electronics', 'Echo Voice Systems', 'Arbor Sustainability',
  'Trellis LegalTech', 'Mosaic Print Cloud', 'Citadel Insurance Ops', 'Glacier Biotech',
  'Falcon Drone Delivery', 'Pebble Pet Nutrition', 'Loomis Textiles', 'Radiant Optics',
];

const US_CONTACTS = [
  'Elena Vance', 'Marcus Thorne', 'Chloe Lindqvist', 'Devon Brooks', 'Priya Nair',
  'Julian Mercer', 'Hannah Gallagher', 'Lucas Reyes', 'Nadia Kowalski', 'Owen Prescott',
  'Maya Patel', 'Caleb Sterling', 'Sienna Morales', 'Ethan Caldwell', 'Clara Jenkins',
  'Liam O’Connor', 'Audrey Chen', 'Noah Whitaker', 'Zoe Bennett', 'Gabriel Foster',
];

const TAG_POOL_CN = ['重点KA', '年付签约', '高潜扩容', '生态伙伴', '续费预警', '核心标杆', '多门店'];
const TAG_POOL_US = ['Enterprise KA', 'Annual Plan', 'Expansion Ready', 'Partner Sourced', 'Renewal Watch', 'Strategic', 'Multi-Region'];

function pickWeighted<T>(rng: () => number, items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function daysAgo(base: Date, days: number, rng: () => number): Date {
  const d = new Date(base.getTime() - days * 86400 * 1000);
  d.setUTCHours(Math.floor(rng() * 18) + 3, Math.floor(rng() * 60), Math.floor(rng() * 60), 0);
  return d;
}

function addMonthsClamped(date: Date, months: number, maxDate: Date, rng: () => number): Date | null {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(28, Math.max(1, d.getUTCDate() + Math.floor((rng() - 0.5) * 4))));
  if (d.getTime() > maxDate.getTime()) return null;
  return d;
}

export async function seedDatabase(db: PrismaClient = prisma) {
  if (!process.env.NETLIFY_DB_URL) return populate(db, false);
  await db.$transaction(async (tx) => {
    const tables = Prisma.dmmf.datamodel.models.map(model => Prisma.raw(`"${model.dbName ?? model.name}"`));
    await tx.$executeRaw`LOCK TABLE ${Prisma.join(tables)} IN EXCLUSIVE MODE`;
    for (const table of tables) {
      const rows = await tx.$queryRaw<{ populated: boolean }[]>`SELECT EXISTS (SELECT FROM ${table}) AS populated`;
      if (rows[0].populated) throw new Error('Showcase initialization requires an empty database.');
    }
    await populate(tx, true);
  }, { timeout: 600000 });
}

async function populate(client: Prisma.TransactionClient, showcase: boolean) {
  const rng = createRng(20260415);
  const now = new Date();
  now.setMinutes(0, 0, 0);

  if (!showcase) {
    // Local fixtures and integration tests can reset their SQLite database.
    await client.webhookEndpoint.deleteMany();
    await client.savedReport.deleteMany();
    await client.playbookRun.deleteMany();
    await client.playbook.deleteMany();
    await client.auditLog.deleteMany();
    await client.alertEvent.deleteMany();
    await client.alertRule.deleteMany();
    await client.funnelStat.deleteMany();
    await client.order.deleteMany();
    await client.customer.deleteMany();
    await client.membership.deleteMany();
    await client.workspace.deleteMany();
    await client.user.deleteMany();
  }

  // 1. Users
  const privatePassword = () => randomBytes(32).toString('base64url');
  const ownerHash = await bcrypt.hash(showcase ? privatePassword() : 'PulseOwner2026!', 10);
  const analystHash = await bcrypt.hash('PulseView2026!', 10);
  const adminHash = await bcrypt.hash(showcase ? privatePassword() : 'PulseAdmin2026!', 10);

  const owner = await client.user.create({
    data: {
      email: 'owner@pulseops.io',
      passwordHash: ownerHash,
      name: 'Alex Chen',
      avatarUrl: null,
    },
  });

  const admin = await client.user.create({
    data: {
      email: 'admin@pulseops.io',
      passwordHash: adminHash,
      name: 'Sophia Lin',
      avatarUrl: null,
    },
  });

  const analyst = await client.user.create({
    data: {
      email: 'analyst@pulseops.io',
      passwordHash: analystHash,
      name: 'David Wu',
      avatarUrl: null,
    },
  });

  const opsMember = await client.user.create({
    data: {
      email: 'revops@pulseops.io',
      passwordHash: showcase ? await bcrypt.hash(privatePassword(), 10) : analystHash,
      name: 'Rachel Rivera',
      avatarUrl: null,
    },
  });

  // 2. Workspaces
  const wsCn = await client.workspace.create({
    data: {
      name: '星云零售中国区',
      slug: 'nebula-cn',
      currency: 'CNY',
    },
  });

  const wsUs = await client.workspace.create({
    data: {
      name: 'Nebula Commerce US',
      slug: 'nebula-us',
      currency: 'USD',
    },
  });

  // 3. Memberships
  await client.membership.createMany({
    data: [
      { userId: owner.id, workspaceId: wsCn.id, role: 'OWNER' },
      { userId: owner.id, workspaceId: wsUs.id, role: 'OWNER' },
      { userId: admin.id, workspaceId: wsCn.id, role: 'ADMIN' },
      { userId: admin.id, workspaceId: wsUs.id, role: 'ADMIN' },
      { userId: analyst.id, workspaceId: wsCn.id, role: 'ANALYST' },
      { userId: analyst.id, workspaceId: wsUs.id, role: 'ANALYST' },
      { userId: opsMember.id, workspaceId: wsCn.id, role: 'ANALYST' },
      { userId: opsMember.id, workspaceId: wsUs.id, role: 'ADMIN' },
    ],
  });

  const workspacesConfig = [
    {
      ws: wsCn,
      prefix: 'CN',
      companies: CN_COMPANIES,
      contacts: CN_CONTACTS,
      tags: TAG_POOL_CN,
      priceMap: { STARTER: 1990, PRO: 6800, ENTERPRISE: 22800 },
      domainSuffix: 'cn-corp.cn',
      isCn: true,
    },
    {
      ws: wsUs,
      prefix: 'US',
      companies: US_COMPANIES,
      contacts: US_CONTACTS,
      tags: TAG_POOL_US,
      priceMap: { STARTER: 299, PRO: 990, ENTERPRISE: 3450 },
      domainSuffix: 'enterprise.io',
      isCn: false,
    },
  ];

  let orderCounter = 10001;

  for (const cfg of workspacesConfig) {
    const createdCustomers: Array<{
      id: string;
      companyName: string;
      planTier: (typeof TIERS)[number];
      channel: (typeof CHANNELS)[number];
      status: string;
      createdAt: Date;
    }> = [];

    // 4. Create 68 enterprise customers spread over past 12 months (more in recent months for growth)
    for (let i = 0; i < cfg.companies.length; i++) {
      const companyName = cfg.companies[i];
      const contactName = cfg.contacts[i % cfg.contacts.length];
      const planTier = pickWeighted(rng, TIERS, [0.42, 0.38, 0.2]);
      const channel = pickWeighted(rng, CHANNELS, [0.34, 0.28, 0.18, 0.2]);

      // Spread customer signups across 360 days with slight recency growth bias
      // Ensure every month in last 6 months has at least 8-12 cohort customers
      let signupDaysAgo: number;
      if (i < 54) {
        const monthBucket = i % 6; // 0..5 months ago
        signupDaysAgo = monthBucket * 30 + Math.floor(rng() * 27) + 1;
      } else {
        signupDaysAgo = 181 + Math.floor(rng() * 175);
      }

      const createdAt = daysAgo(now, signupDaysAgo, rng);
      const statusRoll = rng();
      const status = statusRoll < 0.74 ? 'ACTIVE' : statusRoll < 0.9 ? 'AT_RISK' : 'CHURNED';
      const healthScore =
        status === 'ACTIVE'
          ? Math.floor(75 + rng() * 25)
          : status === 'AT_RISK'
            ? Math.floor(42 + rng() * 30)
            : Math.floor(12 + rng() * 28);

      const loginAgo =
        status === 'ACTIVE'
          ? Math.floor(rng() * 6)
          : status === 'AT_RISK'
            ? Math.floor(7 + rng() * 18)
            : Math.floor(30 + rng() * 60);

      const pickedTags: string[] = [];
      const tagCount = 1 + Math.floor(rng() * 2);
      for (let t = 0; t < tagCount; t++) {
        const tg = cfg.tags[Math.floor(rng() * cfg.tags.length)];
        if (!pickedTags.includes(tg)) pickedTags.push(tg);
      }
      if (planTier === 'ENTERPRISE' && !pickedTags.includes(cfg.tags[0])) {
        pickedTags.unshift(cfg.tags[0]);
      }

      const emailSlug = `contact${i + 1}.${cfg.prefix.toLowerCase()}@${cfg.domainSuffix}`;

      const cust = await client.customer.create({
        data: {
          workspaceId: cfg.ws.id,
          companyName,
          contactName,
          email: emailSlug,
          planTier,
          channel,
          healthScore,
          status,
          ltv: 0,
          tagsJson: JSON.stringify(pickedTags),
          lastLoginAt: daysAgo(now, Math.min(loginAgo, signupDaysAgo), rng),
          createdAt,
        },
      });

      createdCustomers.push({
        id: cust.id,
        companyName,
        planTier,
        channel,
        status,
        createdAt,
      });
    }

    // 5. Generate 450+ realistic orders over past 12 months with cohort renewals & expansion
    const ordersToInsert: Array<{
      orderCode: string;
      workspaceId: string;
      customerId: string;
      amount: number;
      status: string;
      channel: string;
      planTier: string;
      note: string | null;
      invoiced: boolean;
      createdAt: Date;
    }> = [];

    const ltvAccumulator = new Map<string, number>();

    for (const cust of createdCustomers) {
      const basePrice = cfg.priceMap[cust.planTier];
      // Initial subscription order on signup date (M0)
      const initialVariance = 0.9 + rng() * 0.35;
      const m0Amount = Math.round(basePrice * initialVariance);
      const m0Status = rng() < 0.94 ? 'PAID' : 'PENDING';

      ordersToInsert.push({
        orderCode: `PO-${cfg.prefix}-${orderCounter++}`,
        workspaceId: cfg.ws.id,
        customerId: cust.id,
        amount: m0Amount,
        status: m0Status,
        channel: cust.channel,
        planTier: cust.planTier,
        note: cfg.isCn ? '首期订阅开通与实施交付' : 'Initial subscription onboarding',
        invoiced: m0Status === 'PAID' && rng() < 0.78,
        createdAt: cust.createdAt,
      });

      if (m0Status === 'PAID') {
        ltvAccumulator.set(cust.id, (ltvAccumulator.get(cust.id) ?? 0) + m0Amount);
      }

      // Subsequent monthly renewals (M1..M11) governed by realistic retention probability
      const baseRetention =
        cust.status === 'ACTIVE' ? 0.92 : cust.status === 'AT_RISK' ? 0.72 : 0.42;

      for (let m = 1; m <= 11; m++) {
        const renewDate = addMonthsClamped(cust.createdAt, m, now, rng);
        if (!renewDate) break;

        // Retention decays smoothly over time
        const keepProb = Math.pow(baseRetention, Math.min(m, 4) * 0.55);
        if (rng() > keepProb) {
          // Churned customers stop renewing after dropping
          if (cust.status === 'CHURNED') break;
          continue;
        }

        // Seasonal boost in Q4 (months 10,11) & subtle expansion over tenure
        const monthNum = renewDate.getUTCMonth() + 1;
        const seasonal = monthNum >= 10 || monthNum === 6 ? 1.12 : 1.0;
        const expansion = 1 + m * 0.025 + (rng() - 0.35) * 0.18;
        const amount = Math.round(basePrice * seasonal * expansion);

        const sRoll = rng();
        const status =
          sRoll < 0.85 ? 'PAID' : sRoll < 0.91 ? 'PENDING' : sRoll < 0.97 ? 'REFUNDED' : 'FAILED';

        ordersToInsert.push({
          orderCode: `PO-${cfg.prefix}-${orderCounter++}`,
          workspaceId: cfg.ws.id,
          customerId: cust.id,
          amount,
          status,
          channel: cust.channel,
          planTier: cust.planTier,
          note:
            status === 'REFUNDED'
              ? cfg.isCn
                ? '客户调整席位申请部分/全额退款'
                : 'Seat adjustment refund processed'
              : status === 'FAILED'
                ? cfg.isCn
                  ? '企业卡扣款失败，待财务重连'
                  : 'Card authorization declined; retry scheduled'
                : null,
          invoiced: status === 'PAID' && rng() < 0.72,
          createdAt: renewDate,
        });

        if (status === 'PAID') {
          ltvAccumulator.set(cust.id, (ltvAccumulator.get(cust.id) ?? 0) + amount);
        }
      }
    }

    // Add extra add-on / expansion / recent high-frequency orders so total > 450 & last 30d looks vibrant
    const extraCount = Math.max(140, 465 - ordersToInsert.length);
    for (let e = 0; e < extraCount; e++) {
      const cust = createdCustomers[Math.floor(rng() * createdCustomers.length)];
      // Bias extra orders slightly toward recent 120 days to give crisp growth trajectory
      const recencyBias = Math.pow(rng(), 1.45);
      const ago = Math.floor(recencyBias * 355);
      const orderDate = daysAgo(now, ago, rng);
      const basePrice = cfg.priceMap[cust.planTier];
      const amount = Math.round(basePrice * (0.65 + rng() * 0.85));

      const sRoll = rng();
      const status =
        sRoll < 0.83 ? 'PAID' : sRoll < 0.9 ? 'PENDING' : sRoll < 0.965 ? 'REFUNDED' : 'FAILED';

      ordersToInsert.push({
        orderCode: `PO-${cfg.prefix}-${orderCounter++}`,
        workspaceId: cfg.ws.id,
        customerId: cust.id,
        amount,
        status,
        channel: cust.channel,
        planTier: cust.planTier,
        note:
          status === 'PAID'
            ? cfg.isCn
              ? '增购数据席位与 API 调用额度包'
              : 'Seat expansion & API quota add-on'
            : null,
        invoiced: status === 'PAID' && rng() < 0.68,
        createdAt: orderDate,
      });

      if (status === 'PAID') {
        ltvAccumulator.set(cust.id, (ltvAccumulator.get(cust.id) ?? 0) + amount);
      }
    }

    await client.order.createMany({ data: ordersToInsert });

    // Sync accurate customer LTV back to DB
    for (const [custId, ltv] of ltvAccumulator.entries()) {
      await client.customer.update({
        where: { id: custId },
        data: { ltv: Math.round(ltv * 100) / 100 },
      });
    }

    // 6. Generate 365 days x 4 channels FunnelStat
    const funnelRows: Array<{
      workspaceId: string;
      date: Date;
      channel: string;
      visitors: number;
      signups: number;
      trials: number;
      paidUsers: number;
    }> = [];

    const channelProfiles: Record<
      (typeof CHANNELS)[number],
      { baseVisitors: number; signupRate: number; trialRate: number; paidRate: number }
    > = {
      ORGANIC: { baseVisitors: cfg.isCn ? 420 : 380, signupRate: 0.145, trialRate: 0.44, paidRate: 0.31 },
      PAID_SEARCH: { baseVisitors: cfg.isCn ? 360 : 340, signupRate: 0.125, trialRate: 0.41, paidRate: 0.27 },
      SOCIAL: { baseVisitors: cfg.isCn ? 310 : 270, signupRate: 0.095, trialRate: 0.35, paidRate: 0.21 },
      PARTNER: { baseVisitors: cfg.isCn ? 165 : 155, signupRate: 0.19, trialRate: 0.52, paidRate: 0.39 },
    };

    for (let d = 364; d >= 0; d--) {
      const dayDate = new Date(now.getTime() - d * 86400 * 1000);
      dayDate.setUTCHours(0, 0, 0, 0);

      // Smooth 12-month growth multiplier from 0.68 -> 1.25 + weekday cadence
      const progress = (364 - d) / 364;
      const growthFactor = 0.68 + progress * 0.57;
      const dow = dayDate.getUTCDay();
      const weekdayFactor = dow === 0 || dow === 6 ? 0.74 : 1.08;
      const seasonalWave = 1 + Math.sin((progress * Math.PI * 4) + 0.5) * 0.09;

      for (const ch of CHANNELS) {
        const prof = channelProfiles[ch];
        const noise = 0.86 + rng() * 0.28;
        const visitors = Math.max(
          20,
          Math.round(prof.baseVisitors * growthFactor * weekdayFactor * seasonalWave * noise),
        );
        const signups = Math.max(
          4,
          Math.round(visitors * prof.signupRate * (0.9 + rng() * 0.2)),
        );
        const trials = Math.max(
          2,
          Math.round(signups * prof.trialRate * (0.9 + rng() * 0.2)),
        );
        const paidUsers = Math.max(
          1,
          Math.round(trials * prof.paidRate * (0.88 + rng() * 0.24)),
        );

        funnelRows.push({
          workspaceId: cfg.ws.id,
          date: dayDate,
          channel: ch,
          visitors,
          signups,
          trials,
          paidUsers,
        });
      }
    }

    await client.funnelStat.createMany({ data: funnelRows });

    // 7. Alert Rules (4 per workspace)
    const rule1 = await client.alertRule.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '退款率异常飙升预警 (> 5%)' : 'High Refund Rate Anomaly (> 5%)',
        metric: 'REFUND_RATE',
        operator: 'GT',
        threshold: 5.0,
        severity: 'CRITICAL',
        enabled: true,
      },
    });

    const rule2 = await client.alertRule.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '付费转化率跌破警戒线 (< 2.5%)' : 'Conversion Rate Drop (< 2.5%)',
        metric: 'CONVERSION_RATE',
        operator: 'LT',
        threshold: 2.5,
        severity: 'WARNING',
        enabled: true,
      },
    });

    const rule3 = await client.alertRule.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn
          ? '日均净营收低于目标基准 (< ¥18,000)'
          : 'Daily Revenue Below Floor (< $2,800)',
        metric: 'DAILY_REVENUE',
        operator: 'LT',
        threshold: cfg.isCn ? 18000 : 2800,
        severity: 'WARNING',
        enabled: true,
      },
    });

    const rule4 = await client.alertRule.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn
          ? '单日营收高增长突破播报 (> ¥45,000)'
          : 'Daily Revenue Surge Milestone (> $6,500)',
        metric: 'DAILY_REVENUE',
        operator: 'GT',
        threshold: cfg.isCn ? 45000 : 6500,
        severity: 'INFO',
        enabled: true,
      },
    });

    // 8. Historical Alert Events
    await client.alertEvent.createMany({
      data: [
        {
          workspaceId: cfg.ws.id,
          ruleId: rule1.id,
          actualValue: 6.4,
          message: cfg.isCn
            ? '近 7 日订单退款率达到 6.40%，超过阈值 5.00%，请复核企业席位变更记录。'
            : '7-day refund rate reached 6.40%, exceeding 5.00% threshold. Review seat adjustments.',
          resolved: false,
          triggeredAt: daysAgo(now, 1, rng),
        },
        {
          workspaceId: cfg.ws.id,
          ruleId: rule2.id,
          actualValue: 2.18,
          message: cfg.isCn
            ? '近 7 日访问到付费转化率为 2.18%，低于警戒值 2.50%。'
            : '7-day visitor-to-paid conversion fell to 2.18%, below 2.50% floor.',
          resolved: false,
          triggeredAt: daysAgo(now, 2, rng),
        },
        {
          workspaceId: cfg.ws.id,
          ruleId: rule4.id,
          actualValue: cfg.isCn ? 52400 : 7820,
          message: cfg.isCn
            ? '单日已结算营收突破 ¥52,400，高于里程碑目标 ¥45,000。'
            : 'Daily settled revenue reached $7,820, exceeding milestone $6,500.',
          resolved: true,
          triggeredAt: daysAgo(now, 5, rng),
        },
        {
          workspaceId: cfg.ws.id,
          ruleId: rule3.id,
          actualValue: cfg.isCn ? 14200 : 2210,
          message: cfg.isCn
            ? '周末日均营收回落至 ¥14,200，已核实为正常节假日波动。'
            : 'Weekend daily revenue dipped to $2,210; verified as normal seasonal lull.',
          resolved: true,
          triggeredAt: daysAgo(now, 9, rng),
        },
      ],
    });

    // 9. Historical Audit Logs
    const sampleCustomers = createdCustomers.slice(0, 5);
    await client.auditLog.createMany({
      data: [
        {
          workspaceId: cfg.ws.id,
          userId: owner.id,
          action: 'ALERT_RULE_CREATED',
          targetType: 'AlertRule',
          targetId: rule1.id,
          detailJson: JSON.stringify({ name: rule1.name, threshold: rule1.threshold }),
          createdAt: daysAgo(now, 14, rng),
        },
        {
          workspaceId: cfg.ws.id,
          userId: admin.id,
          action: 'CUSTOMER_CREATED',
          targetType: 'Customer',
          targetId: sampleCustomers[0].id,
          detailJson: JSON.stringify({ companyName: sampleCustomers[0].companyName, planTier: sampleCustomers[0].planTier }),
          createdAt: daysAgo(now, 10, rng),
        },
        {
          workspaceId: cfg.ws.id,
          userId: owner.id,
          action: 'TEAM_ROLE_UPDATED',
          targetType: 'Membership',
          targetId: admin.id,
          detailJson: JSON.stringify({ memberEmail: admin.email, role: 'ADMIN' }),
          createdAt: daysAgo(now, 7, rng),
        },
        {
          workspaceId: cfg.ws.id,
          userId: admin.id,
          action: 'ORDER_INVOICED',
          targetType: 'Order',
          targetId: `PO-${cfg.prefix}-10012`,
          detailJson: JSON.stringify({ invoiced: true }),
          createdAt: daysAgo(now, 4, rng),
        },
        {
          workspaceId: cfg.ws.id,
          userId: owner.id,
          action: 'ALERT_EVENT_RESOLVED',
          targetType: 'AlertEvent',
          targetId: rule4.id,
          detailJson: JSON.stringify({ resolved: true }),
          createdAt: daysAgo(now, 3, rng),
        },
        {
          workspaceId: cfg.ws.id,
          userId: admin.id,
          action: 'CUSTOMER_CREATED',
          targetType: 'Customer',
          targetId: sampleCustomers[1].id,
          detailJson: JSON.stringify({ companyName: sampleCustomers[1].companyName, planTier: sampleCustomers[1].planTier }),
          createdAt: daysAgo(now, 1, rng),
        },
      ],
    });

    // 10. Automated Revenue Playbooks & Historical Runs
    const pb1 = await client.playbook.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '高价值 KA 流失挽留自动化' : 'High-LTV Churn Rescue Playbook',
        description: cfg.isCn
          ? '扫描健康度 < 65 且处于预警状态的高 LTV 企业客户，自动打标「VIP挽留」并通知 CSM 团队'
          : 'Detects at-risk accounts with health < 65 & high LTV, applies VIP Rescue tag, and escalates to CS',
        triggerType: 'AT_RISK_HIGH_LTV',
        actionType: 'TAG_VIP_RESCUE',
        configJson: JSON.stringify({ maxHealthScore: 65, minLtv: cfg.isCn ? 15000 : 2500 }),
        enabled: true,
        lastRunAt: daysAgo(now, 1, rng),
      },
    });

    const pb2 = await client.playbook.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '健康高潜客户升舱 Enterprise 标记' : 'Pro-to-Enterprise Expansion Identifier',
        description: cfg.isCn
          ? '识别健康度 >= 88 的 Pro/Starter 活跃客户，自动标记「高潜增购」推送至销售扩张管道'
          : 'Flags active Pro/Starter customers with health >= 88 as Expansion Ready for AE upsell outreach',
        triggerType: 'EXPANSION_READY',
        actionType: 'FLAG_UPSELL',
        configJson: JSON.stringify({ minHealthScore: 88 }),
        enabled: true,
        lastRunAt: daysAgo(now, 2, rng),
      },
    });

    const pb3 = await client.playbook.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '已结算订单自动财务开票核销' : 'Automated Settled Order Invoicing',
        description: cfg.isCn
          ? '批量扫描近期已支付但未开票的合规订单，自动执行财务开票状态核销并记录审计轨迹'
          : 'Sweeps settled PAID orders pending invoice issuance and marks them invoiced with full audit trail',
        triggerType: 'UNINVOICED_PAID',
        actionType: 'AUTO_INVOICE',
        configJson: JSON.stringify({ batchLimit: 25 }),
        enabled: true,
        lastRunAt: daysAgo(now, 3, rng),
      },
    });

    const pb4 = await client.playbook.create({
      data: {
        workspaceId: cfg.ws.id,
        name: cfg.isCn ? '高退款风险账户异常巡检简报' : 'Refund Anomaly Escalation Digest',
        description: cfg.isCn
          ? '聚合近 30 天发生退款交易的企业清单，生成风控核查摘要并推送 Webhook 事件'
          : 'Aggregates accounts with refunded transactions over 30d and dispatches risk escalation summary',
        triggerType: 'HIGH_REFUND_RISK',
        actionType: 'DISPATCH_DIGEST',
        configJson: JSON.stringify({ windowDays: 30 }),
        enabled: true,
        lastRunAt: daysAgo(now, 4, rng),
      },
    });

    await client.playbookRun.createMany({
      data: [
        {
          workspaceId: cfg.ws.id,
          playbookId: pb1.id,
          status: 'SUCCESS',
          matchedCount: 6,
          affectedJson: JSON.stringify(sampleCustomers.slice(0, 3).map((c) => c.companyName)),
          summary: cfg.isCn
            ? '已识别 6 家高价值预警企业并自动附加「VIP挽留」跟进标签'
            : 'Flagged 6 high-LTV at-risk accounts with VIP Rescue tag',
          durationMs: 28,
          executedAt: daysAgo(now, 1, rng),
        },
        {
          workspaceId: cfg.ws.id,
          playbookId: pb2.id,
          status: 'SUCCESS',
          matchedCount: 11,
          affectedJson: JSON.stringify(sampleCustomers.slice(2, 5).map((c) => c.companyName)),
          summary: cfg.isCn
            ? '已标记 11 家高健康度企业进入 Enterprise 升舱增购名单'
            : 'Tagged 11 high-health accounts for Enterprise upsell pipeline',
          durationMs: 21,
          executedAt: daysAgo(now, 2, rng),
        },
        {
          workspaceId: cfg.ws.id,
          playbookId: pb3.id,
          status: 'SUCCESS',
          matchedCount: 14,
          affectedJson: JSON.stringify(['Auto-Invoice Batch #402']),
          summary: cfg.isCn
            ? '已完成 14 笔已支付订单自动开票核销'
            : 'Automatically invoiced 14 settled paid orders',
          durationMs: 39,
          executedAt: daysAgo(now, 3, rng),
        },
        {
          workspaceId: cfg.ws.id,
          playbookId: pb4.id,
          status: 'SUCCESS',
          matchedCount: 4,
          affectedJson: JSON.stringify(['Finance Risk Digest']),
          summary: cfg.isCn
            ? '已汇总 4 笔近 30 日退款事件并推送风控摘要'
            : 'Compiled 4 recent refund events into risk escalation digest',
          durationMs: 17,
          executedAt: daysAgo(now, 4, rng),
        },
      ],
    });

    // 11. Saved Custom BI Reports
    await client.savedReport.createMany({
      data: [
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? '各获客渠道 90 日净营收对比' : '90D Net Revenue by Acquisition Channel',
          description: cfg.isCn ? '用于市场部季度预算复盘与 ROI 分配' : 'Quarterly marketing channel attribution breakdown',
          dataset: 'ORDERS',
          dimension: 'channel',
          metric: 'SUM_REVENUE',
          chartType: 'BAR',
          range: '90d',
          pinned: true,
        },
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? '全年度月度营收增长轨迹' : '12M Monthly Settled Revenue Curve',
          description: cfg.isCn ? '董事会月度汇报核心营收趋势视图' : 'Board-level 12-month revenue expansion trajectory',
          dataset: 'ORDERS',
          dimension: 'month',
          metric: 'SUM_REVENUE',
          chartType: 'AREA',
          range: '12m',
          pinned: true,
        },
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? '订阅层级客户平均健康度剖析' : 'Average Customer Health by Plan Tier',
          description: cfg.isCn ? '对比 Enterprise / Pro / Starter 客户健康评分分布' : 'Compares CS health scores across subscription tiers',
          dataset: 'CUSTOMERS',
          dimension: 'planTier',
          metric: 'AVG_HEALTH',
          chartType: 'BAR',
          range: '12m',
          pinned: false,
        },
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? '各渠道付费转化用户占比' : 'Paid Conversions Share by Channel',
          description: cfg.isCn ? '统计近 90 天各渠道实际完成付费转化的用户分布' : 'Distribution of converted paid accounts per channel',
          dataset: 'FUNNEL',
          dimension: 'channel',
          metric: 'PAID_USERS',
          chartType: 'PIE',
          range: '90d',
          pinned: false,
        },
      ],
    });

    // 12. Developer Webhook Endpoints
    await client.webhookEndpoint.createMany({
      data: [
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? '飞书 / Slack 营收播报机器人' : 'Slack #revops-live Revenue Stream',
          url: cfg.isCn ? 'https://open.feishu.cn/open-apis/bot/v2/hook/pulseops-live' : 'https://hooks.slack.com/services/T00/B00/pulseops',
          secret: `po_hook_${cfg.prefix.toLowerCase()}_demo_feishu_signing_key_01`,
          eventsJson: JSON.stringify(['order.paid', 'order.refunded', 'alert.triggered']),
          enabled: true,
          deliveryCount: 148,
          lastStatus: 200,
          lastDeliveredAt: daysAgo(now, 0, rng),
          lastPayloadJson: JSON.stringify({
            event: 'order.paid',
            workspace: cfg.ws.slug,
            currency: cfg.ws.currency,
            status: 'delivered',
          }),
        },
        {
          workspaceId: cfg.ws.id,
          name: cfg.isCn ? 'ERP 财务自动对账回调' : 'NetSuite / Stripe ERP Sync Hook',
          url: cfg.isCn ? 'https://erp.nebula-cn.example.com/webhooks/pulseops' : 'https://api.netsuite-sync.example.io/v1/revops',
          secret: `po_hook_${cfg.prefix.toLowerCase()}_demo_erp_signing_key_02`,
          eventsJson: JSON.stringify(['order.paid', 'playbook.executed']),
          enabled: true,
          deliveryCount: 84,
          lastStatus: 200,
          lastDeliveredAt: daysAgo(now, 1, rng),
          lastPayloadJson: JSON.stringify({
            event: 'playbook.executed',
            workspace: cfg.ws.slug,
            matchedCount: 14,
          }),
        },
      ],
    });
  }

  console.log('✅ PulseOps deterministic seed complete: 2 workspaces, 4 users, 136 customers, 900+ orders, 2920 funnel stats, 8 playbooks, 8 BI reports, 4 webhooks.');
}

// Run directly when executed as a script
const isDirectRun = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isDirectRun) {
  seedDatabase()
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
