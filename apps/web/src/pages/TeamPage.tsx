import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Check,
  Minus,
  Search,
  ChevronLeft,
  ChevronRight,
  Lock,
  UserPlus,
  X,
  Loader2,
} from 'lucide-react';
import { apiRequest, type AuditLogRecord, type TeamMemberRecord } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatDateTime, formatShortDate } from '../lib/format';
import { toast } from '../store/toastStore';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeletons';
import { useEscapeKey } from '../hooks/useEscapeKey';

export function TeamPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const isOwner = activeWorkspace?.role === 'OWNER';

  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  useEscapeKey(inviteOpen, () => setInviteOpen(false));
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'ADMIN' | 'ANALYST'>('ANALYST');

  const membersQuery = useQuery({
    queryKey: ['team', 'members', activeWorkspace?.id],
    queryFn: () => apiRequest<{ members: TeamMemberRecord[] }>('/api/team/members'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const auditParams = new URLSearchParams({
    page: String(auditPage),
    pageSize: '15',
  });
  if (auditSearch.trim()) auditParams.set('search', auditSearch.trim());

  const auditQuery = useQuery({
    queryKey: ['audit-logs', activeWorkspace?.id, auditParams.toString()],
    queryFn: () =>
      apiRequest<{
        items: AuditLogRecord[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/audit-logs?${auditParams.toString()}`),
    enabled: Boolean(activeWorkspace?.id),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'OWNER' | 'ADMIN' | 'ANALYST' }) =>
      apiRequest(`/api/team/members/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast.success(t('team.roleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['team'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/team/invite', {
        method: 'POST',
        body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole }),
      }),
    onSuccess: () => {
      toast.success(
        lang === 'zh' ? '新成员已加入工作区并写入审计日志' : 'Member invited & logged to audit trail',
      );
      setInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['team'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleInviteSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    inviteMutation.mutate();
  };

  const matrixRows = [
    { label: t('team.matrix.viewAnalytics'), owner: true, admin: true, analyst: true },
    { label: t('team.matrix.exportCsv'), owner: true, admin: true, analyst: true },
    { label: t('team.matrix.mutateOrders'), owner: true, admin: true, analyst: false },
    { label: t('team.matrix.manageAlerts'), owner: true, admin: true, analyst: false },
    { label: t('team.matrix.manageRoles'), owner: true, admin: false, analyst: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('team.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('team.subtitle')}</p>
        </div>
        <button
          type="button"
          disabled={!isOwner}
          title={!isOwner ? t('team.ownerOnlyTip') : ''}
          onClick={() => setInviteOpen(true)}
          className="btn-primary shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          {lang === 'zh' ? '邀请团队成员' : 'Invite Member'}
        </button>
      </div>

      {/* Top Row: Members + RBAC Permission Matrix */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Members Table */}
        <div className="surface-card overflow-hidden xl:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-white/[0.08]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('team.membersSection')}
            </h2>
            {!isOwner && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <Lock className="h-3 w-3" />
                {t('team.ownerOnlyTip')}
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {membersQuery.data?.members.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{m.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="tabular-nums hidden text-[11px] text-slate-400 sm:inline">
                    {formatShortDate(m.joinedAt)}
                  </span>
                  <select
                    disabled={!isOwner || updateRoleMutation.isPending}
                    title={!isOwner ? t('team.ownerOnlyTip') : ''}
                    value={m.role}
                    onChange={(e) =>
                      updateRoleMutation.mutate({
                        id: m.id,
                        role: e.target.value as 'OWNER' | 'ADMIN' | 'ANALYST',
                      })
                    }
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#0F172A] dark:text-slate-200"
                  >
                    <option value="OWNER">OWNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="ANALYST">ANALYST</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RBAC Matrix Card */}
        <div className="surface-card overflow-hidden xl:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-white/[0.08]">
            <ShieldCheck className="h-4 w-4 text-[#4F46E5]" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('team.matrixSection')}
            </h2>
          </div>

          <div className="p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                  <th className="pb-2 text-left font-medium">{t('team.matrix.capability')}</th>
                  <th className="pb-2 text-center font-semibold text-indigo-600 dark:text-indigo-400">
                    OWNER
                  </th>
                  <th className="pb-2 text-center font-semibold text-emerald-600 dark:text-emerald-400">
                    ADMIN
                  </th>
                  <th className="pb-2 text-center font-semibold text-amber-600 dark:text-amber-400">
                    ANALYST
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {matrixRows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-2 text-slate-700 dark:text-slate-300">{r.label}</td>
                    {[r.owner, r.admin, r.analyst].map((allowed, idx) => (
                      <td key={idx} className="py-2.5 text-center">
                        {allowed ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Operation Audit Trail */}
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-white/[0.08]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('team.auditSection')} ({auditQuery.data?.total ?? 0})
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={auditSearch}
              onChange={(e) => {
                setAuditSearch(e.target.value);
                setAuditPage(1);
              }}
              placeholder={t('team.searchAudit')}
              className="input-field h-8 w-full !pl-8 text-xs"
            />
          </div>
        </div>

        {auditQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : !auditQuery.data?.items.length ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400">
                  <th className="px-4 py-2.5">{t('team.colTime')}</th>
                  <th className="px-4 py-2.5">{t('team.colActor')}</th>
                  <th className="px-4 py-2.5">{t('team.colAction')}</th>
                  <th className="px-4 py-2.5">{t('team.colTarget')}</th>
                  <th className="px-4 py-2.5">{t('team.colDetail')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {auditQuery.data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                    <td className="tabular-nums whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDateTime(log.createdAt, lang)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{log.user.name}</div>
                      <div className="text-[11px] text-slate-400">{log.user.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {log.targetType}:{log.targetId.slice(0, 18)}
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(log.detail)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span
                              key={k}
                              className="inline-flex max-w-[180px] truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"
                              title={`${k}: ${String(v)}`}
                            >
                              <span className="mr-1 text-slate-400">{k}:</span>
                              {String(v)}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {auditQuery.data && auditQuery.data.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 text-xs dark:border-white/[0.08]">
            <button
              type="button"
              disabled={auditPage <= 1}
              onClick={() => setAuditPage((p) => p - 1)}
              className="btn-secondary h-8 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('orders.prevPage')}
            </button>
            <span className="tabular-nums px-2 text-slate-600 dark:text-slate-300">
              {auditPage} / {auditQuery.data.totalPages}
            </span>
            <button
              type="button"
              disabled={auditPage >= auditQuery.data.totalPages}
              onClick={() => setAuditPage((p) => p + 1)}
              className="btn-secondary h-8 px-2.5 text-xs"
            >
              {t('orders.nextPage')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Invite Member Modal (OWNER Only) */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="surface-card w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'zh' ? '邀请新成员加入工作区' : 'Invite Workspace Member'}
              </h2>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleInviteSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {t('auth.name')}
                </label>
                <input
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="input-field w-full"
                  placeholder="Grace Lin"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="grace@pulseops.io"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {t('team.colRole')}
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'OWNER' | 'ADMIN' | 'ANALYST')}
                  className="input-field w-full"
                >
                  <option value="ANALYST">ANALYST ({lang === 'zh' ? '只读' : 'Read-Only'})</option>
                  <option value="ADMIN">ADMIN ({lang === 'zh' ? '运营管理' : 'Operations'})</option>
                  <option value="OWNER">OWNER ({lang === 'zh' ? '工作区负责人' : 'Full Control'})</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setInviteOpen(false)} className="btn-secondary">
                  {t('customers.cancel')}
                </button>
                <button type="submit" disabled={inviteMutation.isPending} className="btn-primary">
                  {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === 'zh' ? '发送邀请' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
