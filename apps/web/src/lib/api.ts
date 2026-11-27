import { useAuthStore } from '../store/authStore';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildHeaders(extra?: Record<string, string>): HeadersInit {
  const { token, activeWorkspaceId } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeWorkspaceId) headers['X-Workspace-Id'] = activeWorkspaceId;
  return headers;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 401) {
    // Only auto-logout when hitting protected routes while signed in
    if (!path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      useAuthStore.getState().logout();
    }
  }

  if (!res.ok) {
    let payload: { error?: string; message?: string; details?: Record<string, string[]> } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore parse failure
    }
    throw new ApiError(
      res.status,
      payload.error || 'HTTP_ERROR',
      payload.message || `Request failed (${res.status})`,
      payload.details,
    );
  }

  return res.json() as Promise<T>;
}

export async function downloadCsvExport(params: URLSearchParams): Promise<void> {
  const { token, activeWorkspaceId } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeWorkspaceId) headers['X-Workspace-Id'] = activeWorkspaceId;

  const res = await fetch(`/api/orders/export.csv?${params.toString()}`, { headers });
  if (!res.ok) {
    throw new ApiError(res.status, 'EXPORT_FAILED', 'Failed to export CSV.');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `pulseops-orders-${new Date().toISOString().slice(0, 10)}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Shared DTO types
export interface KpiMetric {
  value: number;
  previousValue: number;
  deltaPct: number;
  sparkline: number[];
}

export interface OverviewResponse {
  currency: string;
  range: string;
  period: { start: string; end: string; days: number };
  executive: {
    arr: number;
    nrr: number;
    quickRatio: number;
    avgHealthScore: number;
    atRiskCustomers: number;
    periodTarget: number;
    quotaAttainmentPct: number;
  };
  kpis: {
    mrr: KpiMetric;
    totalRevenue: KpiMetric;
    ordersCount: KpiMetric;
    conversionRate: KpiMetric;
    refundRate: KpiMetric;
    arpu: { value: number; previousValue: number; deltaPct: number };
    churnRate: { value: number; totalCustomers: number; churnedCustomers: number };
  };
}

export interface TimeseriesResponse {
  currency: string;
  granularity: 'day' | 'week' | 'month';
  series: Array<{
    bucket: string;
    revenue: number;
    previousRevenue: number;
    cumulativeRevenue: number;
    orders: number;
    newCustomers: number;
  }>;
}

export interface TierBreakdownResponse {
  currency: string;
  monthly: Array<{ month: string; ENTERPRISE: number; PRO: number; STARTER: number }>;
  tiers: Array<{
    tier: 'ENTERPRISE' | 'PRO' | 'STARTER';
    customersCount: number;
    activeCount: number;
    totalLtv: number;
    avgLtv: number;
  }>;
}

export interface InsightsResponse {
  currency: string;
  insights: Array<{
    id: string;
    kind: 'positive' | 'warning' | 'critical' | 'info';
    metric: string;
    code: 'REVENUE_MOMENTUM' | 'TOP_CHANNEL' | 'AT_RISK_LTV' | 'TRIAL_CONVERSION';
    data: Record<string, string | number>;
    actionRoute: string;
  }>;
}

export interface LiveFeedResponse {
  currency: string;
  feed: Array<{
    id: string;
    type: 'ORDER' | 'ALERT' | 'AUDIT';
    title: string;
    subtitle: string;
    amount?: number;
    status?: string;
    severity?: string;
    resolved?: boolean;
    timestamp: string;
  }>;
}

export interface ForecastResponse {
  currency: string;
  assumptions: {
    baseMoMGrowthPct: number;
    effectiveMoMPct: number;
    growthBoostPct: number;
    churnReductionPct: number;
    arpuLiftPct: number;
  };
  summary: {
    currentMrr: number;
    projectedMrr6m: number;
    currentArr: number;
    projectedArr: number;
    cumulativeBaseline6m: number;
    cumulativeSimulated6m: number;
    incrementalLift6m: number;
  };
  points: Array<{
    month: string;
    actual: number | null;
    baseline: number | null;
    simulated: number | null;
    optimistic: number | null;
    conservative: number | null;
  }>;
  unitEconomics: Array<{
    tier: 'ENTERPRISE' | 'PRO' | 'STARTER';
    accounts: number;
    activeAccounts: number;
    retentionRate: number;
    avgAcv: number;
    revenueSharePct: number;
    projected6m: number;
  }>;
}

export interface ChannelsResponse {
  currency: string;
  totalRevenue: number;
  channels: Array<{
    channel: string;
    revenue: number;
    ordersCount: number;
    paidOrdersCount: number;
    aov: number;
    sharePct: number;
    roi: number;
  }>;
}

export interface FunnelResponse {
  overallConversionRate: number;
  stages: Array<{
    stage: string;
    count: number;
    conversionFromPrev: number;
    conversionFromTop: number;
    dropOffPct: number;
  }>;
}

export interface CohortsResponse {
  offsets: string[];
  cohorts: Array<{
    cohortMonth: string;
    size: number;
    retention: Array<number | null>;
  }>;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';
  channel: string;
  planTier: string;
  note: string | null;
  invoiced: boolean;
  createdAt: string;
  customer: {
    id: string;
    companyName: string;
    contactName: string;
    email: string;
    planTier: string;
    healthScore?: number;
  };
}

export interface OrdersListResponse {
  currency: string;
  summary: {
    totalAmount: number;
    paidAmount: number;
    pendingAmount: number;
    refundedAmount: number;
    paidCount: number;
    refundedCount: number;
  };
  items: OrderRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerRecord {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  planTier: 'STARTER' | 'PRO' | 'ENTERPRISE';
  channel: 'ORGANIC' | 'PAID_SEARCH' | 'SOCIAL' | 'PARTNER';
  healthScore: number;
  status: 'ACTIVE' | 'AT_RISK' | 'CHURNED';
  ltv: number;
  tags: string[];
  ordersCount: number;
  lastLoginAt: string;
  createdAt: string;
}

export interface CustomersListResponse {
  currency: string;
  items: CustomerRecord[];
  summary: { ACTIVE: number; AT_RISK: number; CHURNED: number };
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AlertRuleRecord {
  id: string;
  name: string;
  metric: 'DAILY_REVENUE' | 'REFUND_RATE' | 'CONVERSION_RATE';
  operator: 'LT' | 'GT';
  threshold: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled: boolean;
  createdAt: string;
  _count?: { events: number };
}

export interface AlertEventRecord {
  id: string;
  ruleId: string;
  actualValue: number;
  message: string;
  resolved: boolean;
  triggeredAt: string;
  rule: AlertRuleRecord;
}

export interface TeamMemberRecord {
  id: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'ANALYST';
  name: string;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  user: { id: string; name: string; email: string };
  createdAt: string;
}
