import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BarChart3,
  TrendingUp,
  Receipt,
  Users,
  BellRing,
  ShieldCheck,
  Zap,
  Radio,
  Moon,
  Sun,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Eye,
  Building2,
  ExternalLink,
  Menu,
  X,
  Plus,
  Loader2,
  Check,
  Sparkles,
  Globe2,
  Workflow,
  BarChart2,
  Terminal,
} from 'lucide-react';
import { useActiveWorkspace, useAuthStore, type WorkspaceSummary } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { apiRequest, type AlertEventRecord, type OrderRecord } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { toast } from '../store/toastStore';
import { CommandPaletteModal } from './CommandPaletteModal';
import { CopilotDrawer } from './CopilotDrawer';
import { GlobalRollupModal } from './GlobalRollupModal';
import { useEscapeKey } from '../hooks/useEscapeKey';

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { user, workspaces, setWorkspaces, setActiveWorkspace, logout } = useAuthStore();
  const activeWorkspace = useActiveWorkspace();
  const { theme, toggleTheme, lang, toggleLang, sidebarCollapsed, setSidebarCollapsed, setCommandOpen } =
    useUiStore();

  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [autoPulse, setAutoPulse] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [rollupOpen, setRollupOpen] = useState(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // Close workspace switcher when clicking outside
  useEffect(() => {
    if (!wsDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [wsDropdownOpen]);

  useEscapeKey(wsDropdownOpen, () => setWsDropdownOpen(false));
  useEscapeKey(mobileMenuOpen, () => setMobileMenuOpen(false));

  // Keyboard shortcut Cmd/Ctrl+J for PulseAI Copilot
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setCopilotOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Create Workspace modal
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsCurrency, setNewWsCurrency] = useState<'CNY' | 'USD'>('CNY');
  useEscapeKey(createWsOpen, () => setCreateWsOpen(false));

  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const alertsQuery = useQuery({
    queryKey: ['alerts-unread', activeWorkspace?.id],
    queryFn: () =>
      apiRequest<{ unresolvedCount: number; events: AlertEventRecord[] }>('/api/alerts/events?resolved=false'),
    enabled: Boolean(activeWorkspace?.id),
    refetchInterval: 45_000,
  });

  const simulateOrderMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ currency: string; order: OrderRecord }>('/api/webhooks/simulate-order', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      toast.success(
        t('topbar.simulatedSuccess'),
        t('topbar.simulatedDetail', {
          company: data.order.customer.companyName,
          amount: formatCurrency(data.order.amount, data.currency),
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => {
      setAutoPulse(false);
      toast.error(err.message);
    },
  });

  // Live Auto-Pulse Telemetry Stream (fires every 7s when toggled on)
  useEffect(() => {
    if (!autoPulse || !canWrite) return;
    const id = setInterval(() => {
      simulateOrderMutation.mutate();
    }, 7000);
    return () => clearInterval(id);
  }, [autoPulse, canWrite]);

  const createWorkspaceMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ workspace: WorkspaceSummary }>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: newWsName, currency: newWsCurrency }),
      }),
    onSuccess: (res) => {
      const updated = [...workspaces, res.workspace];
      setWorkspaces(updated);
      setActiveWorkspace(res.workspace.id);
      setCreateWsOpen(false);
      setNewWsName('');
      queryClient.invalidateQueries();
      toast.success(t('topbar.workspaceCreated'), res.workspace.name);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const navGroups: Array<{
    label: string;
    items: Array<{
      to: string;
      label: string;
      icon: typeof BarChart3;
      end?: boolean;
      pill?: string;
      badge?: number;
    }>;
  }> = [
    {
      label: t('nav.sectionAnalytics'),
      items: [
        { to: '/', label: t('nav.overview'), icon: BarChart3, end: true },
        { to: '/forecast', label: t('nav.forecast'), icon: TrendingUp, pill: 'AI' },
        { to: '/reports', label: t('nav.reports'), icon: BarChart2, pill: 'BI' },
      ],
    },
    {
      label: t('nav.sectionOps'),
      items: [
        { to: '/playbooks', label: t('nav.playbooks'), icon: Workflow, pill: 'AUTO' },
        { to: '/orders', label: t('nav.orders'), icon: Receipt },
        { to: '/customers', label: t('nav.customers'), icon: Users },
        {
          to: '/alerts',
          label: t('nav.alerts'),
          icon: BellRing,
          badge: alertsQuery.data?.unresolvedCount ?? 0,
        },
      ],
    },
    {
      label: t('nav.sectionGovernance'),
      items: [
        { to: '/developers', label: t('nav.developers'), icon: Terminal },
        { to: '/team', label: t('nav.team'), icon: ShieldCheck },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const currentNav = allNavItems.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  const handleWorkspaceSwitch = (wsId: string) => {
    setAutoPulse(false);
    setActiveWorkspace(wsId);
    setWsDropdownOpen(false);
    queryClient.invalidateQueries();
  };

  const handleLogout = () => {
    setAutoPulse(false);
    logout();
    queryClient.clear();
    navigate('/login');
  };

  const handleCreateWsSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    createWorkspaceMutation.mutate();
  };

  const roleBadgeColor =
    activeWorkspace?.role === 'OWNER'
      ? 'bg-indigo-50/90 text-indigo-700 border-indigo-200/80 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
      : activeWorkspace?.role === 'ADMIN'
        ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
        : 'bg-amber-50/90 text-amber-700 border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30';

  const renderSidebarContent = (mobile = false) => (
    <div className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200/75 px-4 dark:border-white/[0.07]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#635BFF] via-[#4F46E5] to-[#4338CA] text-white shadow-[0_2px_10px_rgba(79,70,229,0.4)]">
            <Activity className="h-4 w-4" />
          </div>
          {(!sidebarCollapsed || mobile) && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
                <span>PulseOps</span>
                <span className="rounded-md bg-gradient-to-r from-indigo-500/15 to-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  PRO
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t('nav.liveTelemetry')}</span>
              </div>
            </div>
          )}
        </div>
        {mobile ? (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
            className="hidden rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 lg:inline-flex"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Workspace Switcher */}
      <div ref={wsDropdownRef} className="relative border-b border-slate-200/75 p-3 dark:border-white/[0.07]">
        <button
          type="button"
          onClick={() => setWsDropdownOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200/90 bg-slate-50/70 px-2.5 py-2 text-left transition hover:border-indigo-300/70 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/[0.14] dark:hover:bg-white/[0.05]"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-950 font-mono text-xs font-bold text-white shadow-sm dark:from-indigo-500 dark:to-violet-600">
            {activeWorkspace?.currency === 'USD' ? '$' : '¥'}
          </div>
          {(!sidebarCollapsed || mobile) && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-slate-900 dark:text-zinc-100">
                  {activeWorkspace?.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-400">
                  <span className="font-mono font-medium">{activeWorkspace?.currency}</span>
                  <span>·</span>
                  <span className="truncate">{activeWorkspace?.role}</span>
                </div>
              </div>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${wsDropdownOpen ? 'rotate-180' : ''}`}
              />
            </>
          )}
        </button>

        {wsDropdownOpen && (
          <div className="surface-card absolute left-3 right-3 top-[66px] z-40 p-1.5 shadow-2xl">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
              {t('nav.workspace')}
            </div>
            <div className="space-y-0.5">
              {workspaces.map((ws) => {
                const active = ws.id === activeWorkspace?.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleWorkspaceSwitch(ws.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition ${
                      active
                        ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{ws.name}</span>
                    </div>
                    <div className="ml-2 flex shrink-0 items-center gap-1.5">
                      <span className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">
                        {ws.currency}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => {
                  setWsDropdownOpen(false);
                  setRollupOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <Globe2 className="h-3.5 w-3.5" />
                <span>{lang === 'zh' ? '全球集团合并视角' : 'Global Consolidated View'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWsDropdownOpen(false);
                  setCreateWsOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t('nav.createWorkspace')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Grouped Navigation Links */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {(!sidebarCollapsed || mobile) && (
              <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-zinc-500">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => mobile && setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-50/90 text-[#4F46E5] shadow-[inset_0_0_0_1px_rgba(79,70,229,0.12)] dark:bg-indigo-500/15 dark:text-indigo-200 dark:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.22)]'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#4F46E5] dark:bg-indigo-400" />
                        )}
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#4F46E5] dark:text-indigo-300' : 'opacity-80'}`} />
                        {(!sidebarCollapsed || mobile) && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {'pill' in item && item.pill && (
                              <span className="rounded-md bg-gradient-to-r from-indigo-500/15 to-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-indigo-600 dark:text-indigo-300">
                                {item.pill}
                              </span>
                            )}
                            {'badge' in item && item.badge !== undefined && item.badge > 0 && (
                              <span className="tabular-nums rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom User & Docs Footer */}
      <div className="border-t border-slate-200/75 p-3 dark:border-white/[0.07]">
        {(!sidebarCollapsed || mobile) && (
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            className="mb-2 flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
          >
            <span>{t('nav.apiDocs')}</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        )}
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/80 p-2 dark:bg-white/[0.03]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-600 text-xs font-bold text-white shadow-sm">
            {user?.name?.slice(0, 2).toUpperCase() || 'PO'}
          </div>
          {(!sidebarCollapsed || mobile) && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-slate-900 dark:text-zinc-100">
                {user?.name}
              </div>
              <div className="truncate text-[10px] text-slate-500 dark:text-zinc-400">{user?.email}</div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={t('nav.signOut')}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="canvas-mesh flex min-h-screen bg-[#F7F8FA] dark:bg-[#09090B]">
      {/* Desktop Sidebar */}
      <aside
        className={`no-print sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/75 bg-white/95 backdrop-blur-xl transition-all duration-200 dark:border-white/[0.07] dark:bg-[#0D0D10]/95 lg:block ${
          sidebarCollapsed ? 'w-[74px]' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 h-full w-64 bg-white dark:bg-[#0D0D10]">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Glassmorphic Topbar */}
        <header className="no-print glass-header sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="hidden text-slate-400 dark:text-zinc-500 sm:inline">
                {activeWorkspace?.name}
              </span>
              <span className="hidden text-slate-300 dark:text-zinc-700 sm:inline">/</span>
              <span className="truncate font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
                {currentNav?.label ?? 'PulseOps'}
              </span>
            </div>
            {activeWorkspace && (
              <span
                className={`hidden whitespace-nowrap shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold 2xl:inline-flex ${roleBadgeColor}`}
              >
                {activeWorkspace.role === 'ANALYST' && <Eye className="h-3 w-3" />}
                {t(`roles.${activeWorkspace.role}`)}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* PulseAI Copilot Trigger */}
            <button
              type="button"
              onClick={() => setCopilotOpen(true)}
              className="inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50 to-violet-50 px-2.5 text-xs font-semibold text-indigo-700 transition hover:border-indigo-400 dark:border-indigo-500/35 dark:from-indigo-500/15 dark:to-violet-500/15 dark:text-indigo-200"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
              <span className="hidden sm:inline">PulseAI</span>
              <kbd className="hidden rounded bg-white/80 px-1 py-0.5 font-mono text-[9px] text-indigo-500 dark:bg-white/10 dark:text-indigo-300 2xl:inline">
                ⌘J
              </kbd>
            </button>

            {/* Global Multi-Workspace Rollup Trigger */}
            <button
              type="button"
              onClick={() => setRollupOpen(true)}
              title={lang === 'zh' ? '全球集团合并视角' : 'Global Consolidated Rollup'}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08] md:flex"
            >
              <Globe2 className="h-4 w-4" />
            </button>

            {/* Quick Command Palette Trigger */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              title={t('topbar.searchHint')}
              className="hidden h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/80 px-2.5 text-xs text-slate-500 transition hover:border-slate-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.07] md:flex"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden 2xl:inline">{t('topbar.searchHint')}</span>
              <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-white/10 dark:bg-white/5">
                ⌘K
              </kbd>
            </button>

            {/* Live Auto-Pulse Stream Switch */}
            <button
              type="button"
              disabled={!canWrite}
              title={!canWrite ? t('orders.readonlyTip') : t('topbar.autoPulse')}
              onClick={() => setAutoPulse((v) => !v)}
              className={`hidden h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 sm:inline-flex ${
                autoPulse
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]'
              }`}
            >
              <Radio className={`h-3.5 w-3.5 shrink-0 ${autoPulse ? 'animate-pulse text-emerald-500' : ''}`} />
              <span className="hidden xl:inline">
                {autoPulse ? t('topbar.autoPulseActive') : t('topbar.autoPulse')}
              </span>
            </button>

            {/* One-Click Live Order Injection */}
            <button
              type="button"
              disabled={!canWrite || simulateOrderMutation.isPending}
              title={!canWrite ? t('orders.readonlyTip') : t('topbar.simulateOrder')}
              onClick={() => simulateOrderMutation.mutate()}
              className="btn-primary h-8 shrink-0 whitespace-nowrap px-3 text-xs"
            >
              <Zap className="h-3.5 w-3.5 shrink-0 fill-current" />
              <span className="hidden sm:inline">
                {simulateOrderMutation.isPending ? t('topbar.simulating') : t('topbar.simulateOrder')}
              </span>
            </button>

            {/* Unread Alerts Bell */}
            <button
              type="button"
              onClick={() => navigate('/alerts')}
              title={`${alertsQuery.data?.unresolvedCount ?? 0} ${t('topbar.unreadAlerts')}`}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
            >
              <BellRing className="h-4 w-4" />
              {(alertsQuery.data?.unresolvedCount ?? 0) > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 tabular-nums text-[10px] font-bold text-white shadow-sm">
                  {alertsQuery.data?.unresolvedCount}
                </span>
              )}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'light' ? t('topbar.themeDark') : t('topbar.themeLight')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Language Toggle */}
            <button
              type="button"
              onClick={toggleLang}
              className="flex h-8 shrink-0 whitespace-nowrap items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
            >
              {lang === 'zh' ? '中 / EN' : 'EN / 中'}
            </button>
          </div>
        </header>

        {/* Read-only RBAC Banner */}
        {activeWorkspace?.role === 'ANALYST' && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-200/80 bg-amber-50/90 px-4 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span>{t('topbar.readonlyBanner')}</span>
          </div>
        )}

        {/* Active Route Content */}
        <main className="mx-auto w-full max-w-[1480px] flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Create Workspace Modal */}
      {createWsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
          onClick={() => setCreateWsOpen(false)}
        >
          <div
            className="surface-card w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t('nav.createWorkspace')}
              </h2>
              <button
                type="button"
                onClick={() => setCreateWsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateWsSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {t('auth.workspaceName')}
                </label>
                <input
                  required
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="input-field w-full"
                  placeholder="APAC Enterprise Hub"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {t('auth.currency')}
                </label>
                <select
                  value={newWsCurrency}
                  onChange={(e) => setNewWsCurrency(e.target.value as 'CNY' | 'USD')}
                  className="input-field w-full"
                >
                  <option value="CNY">CNY (¥)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateWsOpen(false)} className="btn-secondary">
                  {t('customers.cancel')}
                </button>
                <button type="submit" disabled={createWorkspaceMutation.isPending} className="btn-primary">
                  {createWorkspaceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('nav.createWorkspace')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CommandPaletteModal
        onInjectOrder={canWrite ? () => simulateOrderMutation.mutate() : undefined}
        onOpenCopilot={() => setCopilotOpen(true)}
        onOpenRollup={() => setRollupOpen(true)}
      />
      <CopilotDrawer open={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <GlobalRollupModal open={rollupOpen} onClose={() => setRollupOpen(false)} />
    </div>
  );
}
