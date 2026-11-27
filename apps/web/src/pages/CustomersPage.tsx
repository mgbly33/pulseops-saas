import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  X,
  Building2,
  Mail,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Tag,
  Zap,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import {
  apiRequest,
  type CustomerRecord,
  type CustomersListResponse,
  type OrderRecord,
} from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatDateTime, formatShortDate } from '../lib/format';
import { toast } from '../store/toastStore';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeletons';

const createCustomerSchema = z.object({
  companyName: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  planTier: z.enum(['STARTER', 'PRO', 'ENTERPRISE']),
  channel: z.enum(['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER']),
});

function healthColor(score: number) {
  if (score >= 75) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' };
  if (score >= 45) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' };
  return { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' };
}

const STATUS_PILL: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  AT_RISK: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  CHURNED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
};

export function CustomersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const status = searchParams.get('status') || 'ALL';
  const planTier = searchParams.get('planTier') || 'ALL';
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [searchInput, setSearchInput] = useState(search);

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val === 'ALL' || !val) next.delete(key);
    else next.set(key, val);
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setFilter('search', searchInput.trim());
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'AT_RISK' | 'CHURNED'>('ACTIVE');
  const [editHealth, setEditHealth] = useState(80);
  const [editTags, setEditTags] = useState('');

  useEscapeKey(createOpen, () => setCreateOpen(false));
  useEscapeKey(Boolean(detailId), () => setDetailId(null));

  // Create form state
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [tierInput, setTierInput] = useState<'STARTER' | 'PRO' | 'ENTERPRISE'>('PRO');
  const [channelInput, setChannelInput] = useState<'ORGANIC' | 'PAID_SEARCH' | 'SOCIAL' | 'PARTNER'>('ORGANIC');
  const [tagsInput, setTagsInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: '12',
    sortBy: 'ltv',
    sortDir: 'desc',
  });
  if (status !== 'ALL') params.set('status', status);
  if (planTier !== 'ALL') params.set('planTier', planTier);
  if (search.trim()) params.set('search', search.trim());

  const customersQuery = useQuery({
    queryKey: ['customers', activeWorkspace?.id, params.toString()],
    queryFn: () => apiRequest<CustomersListResponse>(`/api/customers?${params.toString()}`),
    enabled: Boolean(activeWorkspace?.id),
  });

  const riskMatrixQuery = useQuery({
    queryKey: ['customers', 'risk-matrix', activeWorkspace?.id],
    queryFn: () =>
      apiRequest<{
        currency: string;
        medianLtv: number;
        healthThreshold: number;
        points: Array<{
          id: string;
          companyName: string;
          planTier: string;
          healthScore: number;
          status: string;
          ltv: number;
        }>;
      }>('/api/customers/risk-matrix'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const detailQuery = useQuery({
    queryKey: ['customers', 'detail', activeWorkspace?.id, detailId],
    queryFn: () =>
      apiRequest<{
        currency: string;
        customer: CustomerRecord & { orders: OrderRecord[]; paidCount: number; refundedCount: number };
      }>(`/api/customers/${detailId}`),
    enabled: Boolean(activeWorkspace?.id && detailId),
  });

  // Always sync editable form fields whenever customer detail loads (whether opened from card, table, OR scatter dot!)
  useEffect(() => {
    const cust = detailQuery.data?.customer;
    if (!cust) return;
    setEditStatus(cust.status);
    setEditHealth(cust.healthScore);
    setEditTags((cust.tags ?? []).join(', '));
  }, [detailQuery.data?.customer]);

  const createMutation = useMutation({
    mutationFn: (payload: {
      companyName: string;
      contactName: string;
      email: string;
      planTier: 'STARTER' | 'PRO' | 'ENTERPRISE';
      channel: 'ORGANIC' | 'PAID_SEARCH' | 'SOCIAL' | 'PARTNER';
      tags: string[];
    }) =>
      apiRequest('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success(t('customers.createdSuccess'));
      setCreateOpen(false);
      setCompanyName('');
      setContactName('');
      setEmail('');
      setTagsInput('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const patchCustomerMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'ACTIVE' | 'AT_RISK' | 'CHURNED'; healthScore: number; tags: string[] }) =>
      apiRequest(`/api/customers/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: payload.status,
          healthScore: payload.healthScore,
          tags: payload.tags,
        }),
      }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? '客户健康度与标签已更新' : 'Customer profile updated & audited');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const simulateForCustomerMutation = useMutation({
    mutationFn: (customerId: string) =>
      apiRequest<{ currency: string; order: OrderRecord }>('/api/webhooks/simulate-order', {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      }),
    onSuccess: (res) => {
      toast.success(
        t('topbar.simulatedSuccess'),
        `${res.order.customer.companyName} · ${formatCurrency(res.order.amount, res.currency)}`,
      );
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCustomerDetail = (c: CustomerRecord) => {
    setDetailId(c.id);
    setEditStatus(c.status);
    setEditHealth(c.healthScore);
    setEditTags(c.tags.join(', '));
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createCustomerSchema.safeParse({
      companyName,
      contactName,
      email,
      planTier: tierInput,
      channel: channelInput,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    const tags = tagsInput
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    createMutation.mutate({ ...parsed.data, tags });
  };

  const currency = customersQuery.data?.currency || activeWorkspace?.currency || 'CNY';
  const summary = customersQuery.data?.summary ?? { ACTIVE: 0, AT_RISK: 0, CHURNED: 0 };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('customers.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('customers.subtitle')}</p>
        </div>

        <button
          type="button"
          disabled={!canWrite}
          title={!canWrite ? t('customers.readonlyTip') : ''}
          onClick={() => setCreateOpen(true)}
          className="btn-primary shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t('customers.newCustomer')}
        </button>
      </div>

      {/* Health Summary Strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'ACTIVE', label: t('customers.activeCount'), count: summary.ACTIVE, dot: 'bg-emerald-500' },
          { key: 'AT_RISK', label: t('customers.atRiskCount'), count: summary.AT_RISK, dot: 'bg-amber-500' },
          { key: 'CHURNED', label: t('customers.churnedCount'), count: summary.CHURNED, dot: 'bg-rose-500' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter('status', status === item.key ? 'ALL' : item.key)}
            className={`surface-card flex items-center justify-between px-4 py-3 text-left transition ${
              status === item.key ? 'ring-2 ring-indigo-500' : 'hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.dot}`} />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {item.label}
              </span>
            </div>
            <span className="tabular-nums text-lg font-bold text-slate-900 dark:text-white">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {/* Account Health vs. LTV Risk Quadrant Scatter Matrix */}
      {riskMatrixQuery.data && riskMatrixQuery.data.points.length > 0 && (
        <div className="surface-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {lang === 'zh'
                  ? '企业客户健康度 × LTV 风险象限矩阵'
                  : 'Enterprise Account Health vs. LTV Risk Quadrant'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                {lang === 'zh'
                  ? '左上象限为「高价值流失预警」优先挽留区，右上象限为「核心标杆 KA」区；点击任意散点直达客户档案'
                  : 'Top-left quadrant highlights high-LTV at-risk accounts needing urgent rescue; click any dot to inspect'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                {t('customerStatus.ACTIVE')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                {t('customerStatus.AT_RISK')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                {t('customerStatus.CHURNED')}
              </span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis
                  type="number"
                  dataKey="healthScore"
                  name="Health"
                  domain={[0, 100]}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="ltv"
                  name="LTV"
                  width={62}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCurrency(v, currency, true)}
                />
                <ZAxis range={[45, 110]} />
                <ReferenceLine
                  x={riskMatrixQuery.data.healthThreshold}
                  stroke="#F59E0B"
                  strokeDasharray="4 4"
                />
                <ReferenceLine
                  y={riskMatrixQuery.data.medianLtv}
                  stroke="#635BFF"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as {
                      companyName: string;
                      planTier: string;
                      healthScore: number;
                      ltv: number;
                      status: string;
                    };
                    return (
                      <div className="rounded-xl border border-zinc-700/80 bg-[#0D0D12]/95 px-3 py-2 text-xs text-white shadow-2xl">
                        <div className="font-bold">{p.companyName}</div>
                        <div className="mt-1 tabular-nums text-zinc-300">
                          {p.planTier} · Health {p.healthScore}/100 · LTV {formatCurrency(p.ltv, currency)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={riskMatrixQuery.data.points}
                  onClick={(pt: { id?: string }) => {
                    if (pt?.id) setDetailId(pt.id);
                  }}
                  className="cursor-pointer"
                >
                  {riskMatrixQuery.data.points.map((pt) => (
                    <Cell
                      key={pt.id}
                      fill={
                        pt.status === 'ACTIVE'
                          ? '#10B981'
                          : pt.status === 'AT_RISK'
                            ? '#F59E0B'
                            : '#F43F5E'
                      }
                      fillOpacity={0.82}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div className="surface-card flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('customers.searchPlaceholder')}
            className="input-field w-full !pl-9"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="input-field py-0 text-xs font-medium"
        >
          {(['ALL', 'ACTIVE', 'AT_RISK', 'CHURNED'] as const).map((st) => (
            <option key={st} value={st}>
              {t(`customerStatus.${st}`)}
            </option>
          ))}
        </select>

        <select
          value={planTier}
          onChange={(e) => setFilter('planTier', e.target.value)}
          className="input-field py-0 text-xs font-medium"
        >
          {(['ALL', 'STARTER', 'PRO', 'ENTERPRISE'] as const).map((tier) => (
            <option key={tier} value={tier}>
              {t(`tiers.${tier}`)}
            </option>
          ))}
        </select>

        {(status !== 'ALL' || planTier !== 'ALL' || search) && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setSearchParams({}, { replace: true });
            }}
            title={t('common.resetFilters')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:border-white/10 dark:hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              viewMode === 'grid'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1E293B] dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t('customers.viewGrid')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1E293B] dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            {t('customers.viewTable')}
          </button>
        </div>
      </div>

      {/* Content */}
      {customersQuery.isLoading ? (
        <div className="surface-card">
          <TableSkeleton rows={8} />
        </div>
      ) : !customersQuery.data?.items.length ? (
        <div className="surface-card">
          <EmptyState />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customersQuery.data.items.map((c) => {
            const hc = healthColor(c.healthScore);
            return (
              <div
                key={c.id}
                onClick={() => openCustomerDetail(c)}
                className="surface-card group cursor-pointer p-4 transition hover:border-indigo-300 dark:hover:border-indigo-500/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-indigo-500" />
                      <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-300">
                        {c.companyName}
                      </h3>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                      {c.contactName} · {c.email}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[c.status]}`}
                  >
                    {t(`customerStatus.${c.status}`)}
                  </span>
                </div>

                {/* Health Bar */}
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{t('customers.healthScore')}</span>
                    <span className={`tabular-nums font-bold ${hc.text}`}>{c.healthScore} / 100</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${hc.bar}`} style={{ width: `${c.healthScore}%` }} />
                  </div>
                </div>

                {/* LTV & Orders */}
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs dark:border-white/[0.06]">
                  <div>
                    <div className="text-[10px] text-slate-400">{t('customers.ltv')}</div>
                    <div className="tabular-nums mt-0.5 font-bold text-slate-900 dark:text-white">
                      {formatCurrency(c.ltv, currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{t('customers.ordersCount')}</div>
                    <div className="tabular-nums mt-0.5 font-semibold text-slate-700 dark:text-slate-200">
                      {c.ordersCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{t('customers.lastLogin')}</div>
                    <div className="tabular-nums mt-0.5 text-slate-600 dark:text-slate-300">
                      {formatShortDate(c.lastLoginAt)}
                    </div>
                  </div>
                </div>

                {/* Tags & Tier */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {c.planTier}
                  </span>
                  {c.tags.map((tg) => (
                    <span
                      key={tg}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-white/[0.07] dark:text-slate-300"
                    >
                      {tg}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400">
                <th className="px-4 py-3">{t('customers.companyName')}</th>
                <th className="px-4 py-3">{t('customers.planTier')}</th>
                <th className="px-4 py-3">{t('customers.healthScore')}</th>
                <th className="px-4 py-3">{t('customers.ltv')}</th>
                <th className="px-4 py-3">{t('customers.ordersCount')}</th>
                <th className="px-4 py-3">{t('customers.lastLogin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {customersQuery.data.items.map((c) => {
                const hc = healthColor(c.healthScore);
                return (
                  <tr
                    key={c.id}
                    onClick={() => setDetailId(c.id)}
                    className="cursor-pointer transition hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{c.companyName}</div>
                      <div className="text-[11px] text-slate-500">{c.contactName} · {c.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {c.planTier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div className={`h-full rounded-full ${hc.bar}`} style={{ width: `${c.healthScore}%` }} />
                        </div>
                        <span className={`tabular-nums font-semibold ${hc.text}`}>{c.healthScore}</span>
                      </div>
                    </td>
                    <td className="tabular-nums px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(c.ltv, currency)}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-slate-600 dark:text-slate-300">
                      {c.ordersCount}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-slate-500">
                      {formatShortDate(c.lastLoginAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {customersQuery.data && customersQuery.data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setFilter('page', String(page - 1))}
            className="btn-secondary h-8 px-2.5 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('orders.prevPage')}
          </button>
          <span className="tabular-nums px-2 text-slate-600 dark:text-slate-300">
            {page} / {customersQuery.data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= customersQuery.data.totalPages}
            onClick={() => setFilter('page', String(page + 1))}
            className="btn-secondary h-8 px-2.5 text-xs"
          >
            {t('orders.nextPage')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Create Customer Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="surface-card w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('customers.modalCreateTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t('customers.companyName')}
                </label>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('customers.contactName')}
                  </label>
                  <input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('customers.email')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('customers.planTier')}
                  </label>
                  <select
                    value={tierInput}
                    onChange={(e) => setTierInput(e.target.value as 'STARTER' | 'PRO' | 'ENTERPRISE')}
                    className="input-field w-full"
                  >
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Pro</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('customers.channel')}
                  </label>
                  <select
                    value={channelInput}
                    onChange={(e) =>
                      setChannelInput(e.target.value as 'ORGANIC' | 'PAID_SEARCH' | 'SOCIAL' | 'PARTNER')
                    }
                    className="input-field w-full"
                  >
                    {(['ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER'] as const).map((ch) => (
                      <option key={ch} value={ch}>
                        {t(`channels.${ch}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t('customers.tags')}
                </label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder={t('customers.tagsPlaceholder')}
                  className="input-field w-full"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">
                  {t('customers.cancel')}
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('customers.createSubmit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          onClick={() => setDetailId(null)}
        >
          <div
            className="surface-card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/[0.08]">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('customers.detailTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {detailQuery.isLoading || !detailQuery.data ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {detailQuery.data.customer.companyName}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {detailQuery.data.customer.contactName} · {detailQuery.data.customer.email}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {t('customers.lastLogin')}: {formatDateTime(detailQuery.data.customer.lastLoginAt, lang)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        STATUS_PILL[detailQuery.data.customer.status]
                      }`}
                    >
                      {t(`customerStatus.${detailQuery.data.customer.status}`)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-[11px] text-slate-500">{t('customers.ltv')}</div>
                      <div className="tabular-nums mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {formatCurrency(detailQuery.data.customer.ltv, detailQuery.data.currency)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-[11px] text-slate-500">{t('customers.paidOrders')}</div>
                      <div className="tabular-nums mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {detailQuery.data.customer.paidCount}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <div className="text-[11px] text-slate-500">{t('customers.refundedOrders')}</div>
                      <div className="tabular-nums mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">
                        {detailQuery.data.customer.refundedCount}
                      </div>
                    </div>
                  </div>

                  {detailQuery.data.customer.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-slate-400" />
                      {detailQuery.data.customer.tags.map((tg) => (
                        <span
                          key={tg}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-300"
                        >
                          {tg}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick Inline CRM Actions: Edit Health/Status/Tags & Simulate Expansion Order */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                        {lang === 'zh' ? '客户健康度与标签维护' : 'Account Health & CRM Controls'}
                      </span>
                      <button
                        type="button"
                        disabled={!canWrite || simulateForCustomerMutation.isPending}
                        title={!canWrite ? t('customers.readonlyTip') : ''}
                        onClick={() => simulateForCustomerMutation.mutate(detailQuery.data.customer.id)}
                        className="btn-secondary h-7 px-2.5 text-[11px]"
                      >
                        <Zap className="h-3 w-3 text-indigo-500" />
                        {lang === 'zh' ? '为此客户注入增购订单' : 'Simulate Expansion Order'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">{lang === 'zh' ? '客户状态' : 'Status'}</label>
                        <select
                          disabled={!canWrite}
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'AT_RISK' | 'CHURNED')}
                          className="input-field h-8 w-full text-xs"
                        >
                          <option value="ACTIVE">{t('customerStatus.ACTIVE')}</option>
                          <option value="AT_RISK">{t('customerStatus.AT_RISK')}</option>
                          <option value="CHURNED">{t('customerStatus.CHURNED')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 flex justify-between text-[11px] text-slate-500">
                          <span>{t('customers.healthScore')}</span>
                          <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{editHealth}</span>
                        </label>
                        <input
                          type="range"
                          disabled={!canWrite}
                          min={0}
                          max={100}
                          value={editHealth}
                          onChange={(e) => setEditHealth(Number(e.target.value))}
                          className="pulse-slider mt-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-500">{t('customers.tags')}</label>
                        <input
                          disabled={!canWrite}
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          className="input-field h-8 w-full text-xs"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={!canWrite || patchCustomerMutation.isPending}
                        title={!canWrite ? t('customers.readonlyTip') : ''}
                        onClick={() =>
                          patchCustomerMutation.mutate({
                            id: detailQuery.data.customer.id,
                            status: editStatus,
                            healthScore: editHealth,
                            tags: editTags
                              .split(/[,，]/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .slice(0, 8),
                          })
                        }
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {lang === 'zh' ? '保存客户档案' : 'Save Changes'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t('customers.ordersCount')} ({detailQuery.data.customer.orders.length})
                    </h4>
                    {detailQuery.data.customer.orders.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-white/10">
                        {t('customers.noOrders')}
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/[0.06] dark:border-white/[0.08]">
                        {detailQuery.data.customer.orders.map((ord) => (
                          <div
                            key={ord.id}
                            className="flex items-center justify-between px-3.5 py-2.5 text-xs"
                          >
                            <div>
                              <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                                {ord.orderCode}
                              </span>
                              <span className="ml-2 text-slate-400">
                                {formatDateTime(ord.createdAt, lang)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(ord.amount, detailQuery.data.currency)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                {t(`orderStatus.${ord.status}`)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
