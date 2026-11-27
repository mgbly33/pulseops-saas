import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Zap,
  Crown,
  Eye,
  Moon,
  Sun,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuthStore, type AuthUser, type WorkspaceSummary } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { toast } from '../store/toastStore';

interface AuthResponse {
  token: string;
  user: AuthUser;
  workspaces: WorkspaceSummary[];
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const { theme, toggleTheme, lang, toggleLang } = useUiStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('owner@pulseops.io');
  const [password, setPassword] = useState('PulseOwner2026!');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [currency, setCurrency] = useState<'CNY' | 'USD'>('CNY');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPassword: string, tag: string) => {
    setError(null);
    setLoading(tag);
    try {
      const data = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setSession(data.token, data.user, data.workspaces);
      toast.success(t('auth.loginSuccess'), data.user.name);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await performLogin(email, password, 'form');
      return;
    }

    setError(null);
    setLoading('form');
    try {
      const data = await apiRequest<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, workspaceName, currency }),
      });
      setSession(data.token, data.user, data.workspaces);
      toast.success(t('auth.registerSuccess'), data.workspaces[0]?.name);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19]">
      {/* Left Brand & Value Proposition Column */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-slate-200 bg-slate-950 p-8 text-white lg:flex xl:p-10 dark:border-white/[0.08]">
        {/* Subtle technical grid & indigo radial glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(79,70,229,0.55), transparent 50%), radial-gradient(circle at 80% 80%, rgba(16,185,129,0.28), transparent 45%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F46E5] shadow-lg shadow-indigo-500/30">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">PulseOps</div>
            <div className="text-xs text-slate-400">{t('app.subtitle')}</div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3 py-1 text-[11px] font-semibold tracking-wider text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('auth.heroBadge')}
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
            {t('auth.heroTitle')}
          </h1>
          <p className="text-sm leading-relaxed text-slate-400">{t('auth.heroDesc')}</p>

          <div className="space-y-4 pt-2">
            {/* Live Glassmorphic Telemetry Showcase Card */}
            <div className="rounded-2xl border border-white/[0.1] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-mono text-indigo-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE REVOPS TELEMETRY · 12M
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  NRR 118.4%
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 tabular-nums">
                <div>
                  <div className="text-[10px] text-slate-400">ARR Run-Rate</div>
                  <div className="mt-0.5 text-lg font-bold text-white">¥7.91M</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">MRR Growth</div>
                  <div className="mt-0.5 text-lg font-bold text-emerald-400">+23.8%</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Workspaces</div>
                  <div className="mt-0.5 text-lg font-bold text-indigo-300">CNY / USD</div>
                </div>
              </div>
              <div className="mt-3 flex h-10 items-end gap-1.5">
                {[34, 42, 39, 51, 56, 48, 63, 72, 68, 84, 91, 100].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-indigo-500/50 to-emerald-400/90"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {[
              { icon: ShieldCheck, title: t('auth.feature1Title'), desc: t('auth.feature1Desc') },
              { icon: BarChart3, title: t('auth.feature2Title'), desc: t('auth.feature2Desc') },
              { icon: Zap, title: t('auth.feature3Title'), desc: t('auth.feature3Desc') },
            ].map((f, idx) => {
              const Icon = f.icon;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 backdrop-blur-sm"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{f.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
          <span>React 19 · Fastify · Prisma · RBAC · OpenAPI</span>
          <span className="tabular-nums">2 Workspaces · 12M Telemetry Seeded</span>
        </div>
      </div>

      {/* Right Auth Column */}
      <div className="relative flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        {/* Top-right Theme & Language Switcher */}
        <div className="absolute right-6 top-6 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleLang}
            className="flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            {lang === 'zh' ? '中 / EN' : 'EN / 中'}
          </button>
        </div>

        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F46E5] text-white">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-base font-bold text-slate-900 dark:text-white">PulseOps</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mode === 'login' ? t('auth.welcome') : t('auth.registerTitle')}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{t('auth.subtitle')}</p>
          </div>

          {/* One-Click Demo Role Launchers */}
          <div className="surface-card space-y-2.5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                {t('auth.quickDemoTitle')}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                LIVE DB
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('auth.quickDemoDesc')}</p>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => performLogin('owner@pulseops.io', 'PulseOwner2026!', 'owner')}
                className="group flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/80 px-3.5 py-2.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20"
              >
                <div className="flex items-start gap-2.5">
                  <Crown className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5] dark:text-indigo-300" />
                  <div>
                    <div className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">
                      {t('auth.demoOwnerBtn')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                      {t('auth.demoOwnerSub')}
                    </div>
                  </div>
                </div>
                {loading === 'owner' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-indigo-500 transition group-hover:translate-x-0.5" />
                )}
              </button>

              <button
                type="button"
                disabled={loading !== null}
                onClick={() => performLogin('analyst@pulseops.io', 'PulseView2026!', 'analyst')}
                className="group flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left transition hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-amber-500/40"
              >
                <div className="flex items-start gap-2.5">
                  <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {t('auth.demoAnalystBtn')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {t('auth.demoAnalystSub')}
                    </div>
                  </div>
                </div>
                {loading === 'analyst' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
                ) : (
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                )}
              </button>
            </div>
          </div>

          {/* Standard Email / Password Form */}
          <form onSubmit={handleSubmit} className="surface-card space-y-4 p-5">
            {mode === 'register' && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t('auth.name')}
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field w-full"
                    placeholder="Alex Chen"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('auth.workspaceName')}
                    </label>
                    <input
                      required
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="input-field w-full"
                      placeholder="Acme RevOps"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t('auth.currency')}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as 'CNY' | 'USD')}
                      className="input-field w-full"
                    >
                      <option value="CNY">CNY (¥)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('auth.email')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full"
                placeholder="owner@pulseops.io"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t('auth.password')}
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full"
                placeholder="••••••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading !== null} className="btn-primary w-full">
              {loading === 'form' && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? t('auth.signIn') : t('auth.signUp')}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
