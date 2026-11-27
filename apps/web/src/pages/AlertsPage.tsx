import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Radar,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  Loader2,
} from 'lucide-react';
import { apiRequest, type AlertEventRecord, type AlertRuleRecord } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatDateTime, formatPercent } from '../lib/format';
import { toast } from '../store/toastStore';
import { EmptyState } from '../components/EmptyState';
import { useEscapeKey } from '../hooks/useEscapeKey';

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  WARNING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  INFO: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
};

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'CRITICAL') return <AlertOctagon className="h-4 w-4 text-rose-600 dark:text-rose-400" />;
  if (severity === 'WARNING') return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  return <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />;
}

export function AlertsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [eventFilter, setEventFilter] = useState<'all' | 'false' | 'true'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  useEscapeKey(modalOpen, () => setModalOpen(false));
  const [lastSnapshot, setLastSnapshot] = useState<{
    DAILY_REVENUE: number;
    REFUND_RATE: number;
    CONVERSION_RATE: number;
  } | null>(null);

  // New rule form state
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<'DAILY_REVENUE' | 'REFUND_RATE' | 'CONVERSION_RATE'>('REFUND_RATE');
  const [operator, setOperator] = useState<'GT' | 'LT'>('GT');
  const [threshold, setThreshold] = useState('5');
  const [severity, setSeverity] = useState<'INFO' | 'WARNING' | 'CRITICAL'>('WARNING');

  const rulesQuery = useQuery({
    queryKey: ['alerts', 'rules', activeWorkspace?.id],
    queryFn: () => apiRequest<{ currency: string; rules: AlertRuleRecord[] }>('/api/alerts/rules'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const telemetryQuery = useQuery({
    queryKey: ['alerts', 'telemetry', activeWorkspace?.id],
    queryFn: () =>
      apiRequest<{
        currency: string;
        metrics: { DAILY_REVENUE: number; REFUND_RATE: number; CONVERSION_RATE: number };
        sampleOrders7d: number;
      }>('/api/alerts/telemetry'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const resolveAllMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ resolvedCount: number }>('/api/alerts/events/resolve-all', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (res) => {
      toast.success(
        lang === 'zh'
          ? `已批量解决 ${res.resolvedCount} 条预警事件`
          : `Resolved ${res.resolvedCount} pending alert events`,
      );
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const eventsQuery = useQuery({
    queryKey: ['alerts', 'events', activeWorkspace?.id, eventFilter],
    queryFn: () =>
      apiRequest<{ currency: string; unresolvedCount: number; events: AlertEventRecord[] }>(
        `/api/alerts/events?resolved=${eventFilter}`,
      ),
    enabled: Boolean(activeWorkspace?.id),
  });

  const evaluateMutation = useMutation({
    mutationFn: () =>
      apiRequest<{
        currency: string;
        evaluatedRules: number;
        triggeredCount: number;
        metrics: { DAILY_REVENUE: number; REFUND_RATE: number; CONVERSION_RATE: number };
      }>('/api/alerts/evaluate', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (data) => {
      setLastSnapshot(data.metrics);
      toast.info(
        t('alerts.evalResultTitle'),
        t('alerts.evalResultMsg', { rules: data.evaluatedRules, triggered: data.triggeredCount }),
      );
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createRuleMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name,
          metric,
          operator,
          threshold: Number(threshold),
          severity,
          enabled: true,
        }),
      }),
    onSuccess: () => {
      toast.success(t('alerts.ruleCreated'));
      setModalOpen(false);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (rule: AlertRuleRecord) =>
      apiRequest(`/api/alerts/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !rule.enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/alerts/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('alerts.ruleDeleted'));
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resolveEventMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/alerts/events/${id}/resolve`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => {
      toast.success(t('alerts.eventResolved'));
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currency = rulesQuery.data?.currency || activeWorkspace?.currency || 'CNY';

  const formatThreshold = (m: string, v: number) =>
    m === 'DAILY_REVENUE' ? formatCurrency(v, currency) : formatPercent(v, 2);

  const handleCreateRule = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || Number.isNaN(Number(threshold))) return;
    createRuleMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('alerts.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('alerts.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canWrite || evaluateMutation.isPending}
            title={!canWrite ? t('alerts.readonlyTip') : ''}
            onClick={() => evaluateMutation.mutate()}
            className="btn-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
          >
            {evaluateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {evaluateMutation.isPending ? t('alerts.evaluating') : t('alerts.evaluateNow')}
          </button>

          <button
            type="button"
            disabled={!canWrite}
            title={!canWrite ? t('alerts.readonlyTip') : ''}
            onClick={() => setModalOpen(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            {t('alerts.newRule')}
          </button>
        </div>
      </div>

      {/* Always-On 7-Day Real Telemetry Gauge Strip */}
      {(lastSnapshot || telemetryQuery.data?.metrics) && (() => {
        const snap = lastSnapshot ?? telemetryQuery.data!.metrics;
        const refundHigh = snap.REFUND_RATE > 5;
        const convLow = snap.CONVERSION_RATE < 2.5;
        return (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            <div className="surface-card p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>{t('alerts.metrics.DAILY_REVENUE')}</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  7D LIVE
                </span>
              </div>
              <div className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(snap.DAILY_REVENUE, currency)}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div className="h-full w-4/5 rounded-full bg-indigo-500" />
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>{t('alerts.metrics.REFUND_RATE')}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    refundHigh
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  }`}
                >
                  {refundHigh ? (lang === 'zh' ? '超出 5% 阈值' : 'Above 5%') : (lang === 'zh' ? '健康正常' : 'Healthy')}
                </span>
              </div>
              <div className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {formatPercent(snap.REFUND_RATE)}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${refundHigh ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, snap.REFUND_RATE * 10)}%` }}
                />
              </div>
            </div>

            <div className="surface-card p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>{t('alerts.metrics.CONVERSION_RATE')}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    convLow
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  }`}
                >
                  {convLow ? (lang === 'zh' ? '低于 2.5% 警戒线' : 'Below 2.5%') : (lang === 'zh' ? '表现良好' : 'On Target')}
                </span>
              </div>
              <div className="tabular-nums mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {formatPercent(snap.CONVERSION_RATE)}
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${convLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, snap.CONVERSION_RATE * 20)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Upper Section: Alert Rules Grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t('alerts.rulesSection')} ({rulesQuery.data?.rules.length ?? 0})
        </h2>

        {!rulesQuery.data?.rules.length ? (
          <div className="surface-card">
            <EmptyState title={t('alerts.noRules')} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {rulesQuery.data.rules.map((rule) => (
              <div key={rule.id} className="surface-card flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <SeverityIcon severity={rule.severity} />
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {rule.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      {t(`alerts.metrics.${rule.metric}`)}
                    </span>
                    <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {rule.operator === 'GT' ? '>' : '<'} {formatThreshold(rule.metric, rule.threshold)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        SEVERITY_STYLE[rule.severity]
                      }`}
                    >
                      {t(`alerts.severities.${rule.severity}`)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={!canWrite}
                    title={!canWrite ? t('alerts.readonlyTip') : ''}
                    onClick={() => toggleRuleMutation.mutate(rule)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-45 ${
                      rule.enabled ? 'bg-[#4F46E5]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                        rule.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite}
                    title={!canWrite ? t('alerts.readonlyTip') : t('alerts.deleteRule')}
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lower Section: Triggered Events Stream */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('alerts.eventsSection')}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {(eventsQuery.data?.unresolvedCount ?? 0) > 0 && (
              <button
                type="button"
                disabled={!canWrite || resolveAllMutation.isPending}
                title={!canWrite ? t('alerts.readonlyTip') : ''}
                onClick={() => resolveAllMutation.mutate()}
                className="btn-secondary h-8 px-2.5 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {lang === 'zh' ? '全部标记已解决' : 'Resolve All'}
              </button>
            )}

            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs dark:bg-white/[0.06]">
            {[
              { id: 'all', label: t('alerts.filterAll') },
              { id: 'false', label: t('alerts.filterUnresolved') },
              { id: 'true', label: t('alerts.filterResolved') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEventFilter(tab.id as 'all' | 'false' | 'true')}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  eventFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1E293B] dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="surface-card divide-y divide-slate-100 dark:divide-white/[0.06]">
          {!eventsQuery.data?.events.length ? (
            <EmptyState title={t('alerts.noEvents')} />
          ) : (
            eventsQuery.data.events.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <SeverityIcon severity={ev.rule.severity} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ev.rule.name}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          ev.resolved
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300'
                        }`}
                      >
                        {ev.resolved ? t('alerts.resolvedTag') : t('alerts.pendingTag')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ev.message}</p>
                    <div className="mt-1.5 flex items-center gap-3 tabular-nums text-[11px] text-slate-400">
                      <span>{formatDateTime(ev.triggeredAt, lang)}</span>
                      <span>
                        {lang === 'zh' ? '实际值' : 'Actual'}: <strong className="text-slate-600 dark:text-slate-200">{formatThreshold(ev.rule.metric, ev.actualValue)}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {!ev.resolved && (
                  <button
                    type="button"
                    disabled={!canWrite || resolveEventMutation.isPending}
                    title={!canWrite ? t('alerts.readonlyTip') : ''}
                    onClick={() => resolveEventMutation.mutate(ev.id)}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {t('alerts.resolveBtn')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* New Alert Rule Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="surface-card w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('alerts.newRule')}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t('alerts.ruleName')}
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field w-full"
                  placeholder="e.g. Refund spike > 6%"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('alerts.metric')}
                  </label>
                  <select
                    value={metric}
                    onChange={(e) =>
                      setMetric(e.target.value as 'DAILY_REVENUE' | 'REFUND_RATE' | 'CONVERSION_RATE')
                    }
                    className="input-field w-full"
                  >
                    <option value="REFUND_RATE">{t('alerts.metrics.REFUND_RATE')}</option>
                    <option value="CONVERSION_RATE">{t('alerts.metrics.CONVERSION_RATE')}</option>
                    <option value="DAILY_REVENUE">{t('alerts.metrics.DAILY_REVENUE')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('alerts.operator')}
                  </label>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value as 'GT' | 'LT')}
                    className="input-field w-full"
                  >
                    <option value="GT">{t('alerts.operators.GT')}</option>
                    <option value="LT">{t('alerts.operators.LT')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('alerts.threshold')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="input-field tabular-nums w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('alerts.severity')}
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as 'INFO' | 'WARNING' | 'CRITICAL')}
                    className="input-field w-full"
                  >
                    <option value="INFO">{t('alerts.severities.INFO')}</option>
                    <option value="WARNING">{t('alerts.severities.WARNING')}</option>
                    <option value="CRITICAL">{t('alerts.severities.CRITICAL')}</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                  {t('customers.cancel')}
                </button>
                <button type="submit" disabled={createRuleMutation.isPending} className="btn-primary">
                  {createRuleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('alerts.createRuleSubmit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
