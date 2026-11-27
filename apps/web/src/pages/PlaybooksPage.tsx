import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Workflow,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  X,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatDateTime } from '../lib/format';
import { toast } from '../store/toastStore';
import { EmptyState } from '../components/EmptyState';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface PlaybookRecord {
  id: string;
  name: string;
  description: string;
  triggerType: 'AT_RISK_HIGH_LTV' | 'EXPANSION_READY' | 'UNINVOICED_PAID' | 'HIGH_REFUND_RISK';
  actionType: 'TAG_VIP_RESCUE' | 'FLAG_UPSELL' | 'AUTO_INVOICE' | 'DISPATCH_DIGEST';
  enabled: boolean;
  lastRunAt: string | null;
  runsCount: number;
}

interface PlaybookRunRecord {
  id: string;
  playbookId: string;
  status: string;
  matchedCount: number;
  affected: string[];
  summary: string;
  durationMs: number;
  executedAt: string;
  playbook: { name: string; triggerType: string; actionType: string };
}

export function PlaybooksPage() {
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [createOpen, setCreateOpen] = useState(false);
  useEscapeKey(createOpen, () => setCreateOpen(false));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<PlaybookRecord['triggerType']>('AT_RISK_HIGH_LTV');
  const [actionType, setActionType] = useState<PlaybookRecord['actionType']>('TAG_VIP_RESCUE');
  const [runningId, setRunningId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['playbooks', activeWorkspace?.id],
    queryFn: () => apiRequest<{ playbooks: PlaybookRecord[]; runs: PlaybookRunRecord[] }>('/api/playbooks'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => {
      setRunningId(id);
      return apiRequest<{ run: PlaybookRunRecord }>(`/api/playbooks/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (res) => {
      toast.success(
        lang === 'zh'
          ? `剧本执行完成（命中 ${res.run.matchedCount} 条 · ${res.run.durationMs}ms）`
          : `Playbook executed (${res.run.matchedCount} matched · ${res.run.durationMs}ms)`,
        res.run.summary,
      );
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setRunningId(null),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/playbooks', {
        method: 'POST',
        body: JSON.stringify({ name, description, triggerType, actionType }),
      }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? '自动化剧本已创建' : 'Playbook created');
      setCreateOpen(false);
      setName('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (pb: PlaybookRecord) =>
      apiRequest(`/api/playbooks/${pb.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !pb.enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['playbooks'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/playbooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? '剧本已删除' : 'Playbook deleted');
      queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const triggerLabels: Record<string, string> = {
    AT_RISK_HIGH_LTV: lang === 'zh' ? '高价值客户流失预警' : 'At-Risk High-LTV Account',
    EXPANSION_READY: lang === 'zh' ? '健康高潜账户待升舱' : 'Healthy Expansion Ready',
    UNINVOICED_PAID: lang === 'zh' ? '已结算订单待开票' : 'Uninvoiced Paid Orders',
    HIGH_REFUND_RISK: lang === 'zh' ? '近30日退款异常扫描' : '30D Refund Anomaly Sweep',
  };

  const actionLabels: Record<string, string> = {
    TAG_VIP_RESCUE: lang === 'zh' ? '自动打标「VIP挽留」' : 'Tag VIP Rescue',
    FLAG_UPSELL: lang === 'zh' ? '标记「高潜增购」线索' : 'Flag Upsell Pipeline',
    AUTO_INVOICE: lang === 'zh' ? '批量自动财务开票' : 'Auto-Invoice Orders',
    DISPATCH_DIGEST: lang === 'zh' ? '生成风控派发摘要' : 'Dispatch Risk Digest',
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    createMutation.mutate();
  };

  const readonlyTip =
    lang === 'zh'
      ? '只读分析师视角（ANALYST）无权创建、修改或执行剧本'
      : 'Analyst role (ANALYST) cannot create, edit, or execute playbooks';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Workflow className="h-3 w-3" />
            REVOPS AUTOMATION ENGINE
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            {lang === 'zh' ? '自动化营收运营剧本 (Playbooks)' : 'Automated Revenue Playbooks'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {lang === 'zh'
              ? '编排触发条件与自动动作工作流，一键扫描真实数据库执行客户打标、自动开票与风险派单'
              : 'Orchestrate Trigger → Action RevOps automations that execute live mutations across customers and orders'}
          </p>
        </div>

        <button
          type="button"
          disabled={!canWrite}
          title={!canWrite ? readonlyTip : ''}
          onClick={() => setCreateOpen(true)}
          className="btn-primary shrink-0"
        >
          <Plus className="h-4 w-4" />
          {lang === 'zh' ? '新建自动化剧本' : 'New Playbook'}
        </button>
      </div>

      {/* Playbook Workflow Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(query.data?.playbooks ?? []).map((pb) => (
          <div key={pb.id} className="surface-card-interactive flex flex-col justify-between p-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                      <Zap className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{pb.name}</h3>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                    {pb.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => toggleMutation.mutate(pb)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-45 ${
                      pb.enabled ? 'bg-[#4F46E5]' : 'bg-slate-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                        pb.enabled ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => deleteMutation.mutate(pb.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-500/15"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Visual Flow Pill: WHEN Trigger -> DO Action */}
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 text-[11px] dark:border-white/[0.06] dark:bg-white/[0.02]">
                <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {lang === 'zh' ? '触发' : 'WHEN'} · {triggerLabels[pb.triggerType] || pb.triggerType}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {lang === 'zh' ? '动作' : 'DO'} · {actionLabels[pb.actionType] || pb.actionType}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
              <div className="flex items-center gap-3 tabular-nums text-[11px] text-slate-400">
                <span>
                  {lang === 'zh' ? `累计执行 ${pb.runsCount} 次` : `${pb.runsCount} runs`}
                </span>
                {pb.lastRunAt && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(pb.lastRunAt, lang)}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={!canWrite || runningId === pb.id}
                title={!canWrite ? readonlyTip : ''}
                onClick={() => runMutation.mutate(pb.id)}
                className="btn-primary h-8 px-3 text-xs"
              >
                {runningId === pb.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                {lang === 'zh' ? '立即执行剧本' : 'Run Now'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live Execution History Log */}
      <section className="surface-card overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-3.5 dark:border-white/[0.07]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {lang === 'zh' ? '自动化执行追踪日志' : 'Execution Run History'} ({query.data?.runs.length ?? 0})
          </h2>
        </div>

        {!query.data?.runs.length ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {query.data.runs.map((run) => (
              <div key={run.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {run.playbook.name}
                    </span>
                    <span className="tabular-nums rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                      {run.matchedCount} {lang === 'zh' ? '条命中' : 'matched'}
                    </span>
                    <span className="tabular-nums font-mono text-[10px] text-slate-400">
                      {run.durationMs}ms
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-zinc-300">{run.summary}</p>
                  {run.affected.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {run.affected.map((item, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="tabular-nums shrink-0 text-[11px] text-slate-400">
                  {formatDateTime(run.executedAt, lang)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New Playbook Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
          onClick={() => setCreateOpen(false)}
        >
          <div className="surface-card w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'zh' ? '新建 RevOps 自动化剧本' : 'Create Automation Playbook'}
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {lang === 'zh' ? '剧本名称' : 'Playbook Name'}
                </label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {lang === 'zh' ? '业务说明' : 'Description'}
                </label>
                <input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {lang === 'zh' ? '触发条件 (WHEN)' : 'Trigger (WHEN)'}
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as PlaybookRecord['triggerType'])}
                  className="input-field w-full"
                >
                  {Object.entries(triggerLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {lang === 'zh' ? '执行动作 (DO)' : 'Automated Action (DO)'}
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as PlaybookRecord['actionType'])}
                  className="input-field w-full"
                >
                  {Object.entries(actionLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === 'zh' ? '保存剧本' : 'Save Playbook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
