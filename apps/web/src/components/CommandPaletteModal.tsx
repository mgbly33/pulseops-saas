import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  TrendingUp,
  BarChart2,
  Workflow,
  Receipt,
  Users,
  BellRing,
  Terminal,
  ShieldCheck,
  Search,
  Moon,
  Sun,
  Languages,
  Zap,
  Sparkles,
  Globe2,
  X,
} from 'lucide-react';
import { useUiStore } from '../store/uiStore';

interface CommandPaletteModalProps {
  onInjectOrder?: () => void;
  onOpenCopilot?: () => void;
  onOpenRollup?: () => void;
}

export function CommandPaletteModal({
  onInjectOrder,
  onOpenCopilot,
  onOpenRollup,
}: CommandPaletteModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { commandOpen, setCommandOpen, theme, toggleTheme, toggleLang, lang } = useUiStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      } else if (e.key === 'Escape' && commandOpen) {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, setCommandOpen]);

  if (!commandOpen) return null;

  const navGroup = lang === 'zh' ? '页面跳转' : 'Navigate';
  const actGroup = lang === 'zh' ? '快捷操作' : 'Actions';
  const prefGroup = lang === 'zh' ? '界面偏好' : 'Preferences';

  const items = [
    { id: 'overview', group: navGroup, label: t('nav.overview'), icon: BarChart3, action: () => navigate('/') },
    { id: 'forecast', group: navGroup, label: t('nav.forecast'), icon: TrendingUp, action: () => navigate('/forecast') },
    { id: 'reports', group: navGroup, label: t('nav.reports'), icon: BarChart2, action: () => navigate('/reports') },
    { id: 'playbooks', group: navGroup, label: t('nav.playbooks'), icon: Workflow, action: () => navigate('/playbooks') },
    { id: 'orders', group: navGroup, label: t('nav.orders'), icon: Receipt, action: () => navigate('/orders') },
    { id: 'customers', group: navGroup, label: t('nav.customers'), icon: Users, action: () => navigate('/customers') },
    { id: 'alerts', group: navGroup, label: t('nav.alerts'), icon: BellRing, action: () => navigate('/alerts') },
    { id: 'developers', group: navGroup, label: t('nav.developers'), icon: Terminal, action: () => navigate('/developers') },
    { id: 'team', group: navGroup, label: t('nav.team'), icon: ShieldCheck, action: () => navigate('/team') },
    ...(onOpenCopilot
      ? [
          {
            id: 'copilot',
            group: actGroup,
            label: lang === 'zh' ? '打开 PulseAI 商业副驾驶 (⌘J)' : 'Open PulseAI Copilot (⌘J)',
            icon: Sparkles,
            action: onOpenCopilot,
          },
        ]
      : []),
    ...(onOpenRollup
      ? [
          {
            id: 'rollup',
            group: actGroup,
            label: lang === 'zh' ? '打开全球集团合并驾驶舱' : 'Open Global Consolidated Rollup',
            icon: Globe2,
            action: onOpenRollup,
          },
        ]
      : []),
    ...(onInjectOrder
      ? [{ id: 'inject', group: actGroup, label: t('topbar.simulateOrder'), icon: Zap, action: onInjectOrder }]
      : []),
    {
      id: 'theme',
      group: prefGroup,
      label: theme === 'light' ? t('topbar.themeDark') : t('topbar.themeLight'),
      icon: theme === 'light' ? Moon : Sun,
      action: () => toggleTheme(),
    },
    {
      id: 'lang',
      group: prefGroup,
      label: lang === 'zh' ? '切换语言 (中 / EN)' : 'Switch Language (EN / 中)',
      icon: Languages,
      action: () => toggleLang(),
    },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase().trim()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 px-4 pt-24 backdrop-blur-xs"
      onClick={() => setCommandOpen(false)}
    >
      <div
        className="surface-card w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200/80 px-4 py-3 dark:border-white/[0.08]">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('topbar.searchHint')}
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => setCommandOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.action();
                  setCommandOpen(false);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-slate-400" />
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  {item.group}
                </span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">{t('common.emptyTitle')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
