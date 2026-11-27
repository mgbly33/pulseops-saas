import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { BarChart2, Save, Download, Trash2, Bookmark, Sparkles, Loader2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useActiveWorkspace, useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatNumber } from '../lib/format';
import { toast } from '../store/toastStore';

interface SavedReportRecord {
  id: string;
  name: string;
  description: string;
  dataset: 'ORDERS' | 'CUSTOMERS' | 'FUNNEL';
  dimension: 'channel' | 'planTier' | 'status' | 'month';
  metric: 'SUM_REVENUE' | 'COUNT' | 'AVG_AMOUNT' | 'AVG_HEALTH' | 'PAID_USERS';
  chartType: 'BAR' | 'AREA' | 'PIE' | 'TABLE';
  range: '7d' | '30d' | '90d' | '12m';
  pinned: boolean;
}

const PIE_COLORS = ['#635BFF', '#10B981', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6'];

const VALID_DIMENSIONS: Record<SavedReportRecord['dataset'], SavedReportRecord['dimension'][]> = {
  ORDERS: ['channel', 'planTier', 'status', 'month'],
  CUSTOMERS: ['channel', 'planTier', 'status', 'month'],
  FUNNEL: ['channel', 'month'],
};

const VALID_METRICS: Record<SavedReportRecord['dataset'], SavedReportRecord['metric'][]> = {
  ORDERS: ['SUM_REVENUE', 'COUNT', 'AVG_AMOUNT'],
  CUSTOMERS: ['SUM_REVENUE', 'COUNT', 'AVG_AMOUNT', 'AVG_HEALTH'],
  FUNNEL: ['PAID_USERS', 'COUNT'],
};

export function ReportsPage() {
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const { token } = useAuthStore();
  const theme = useUiStore((s) => s.theme);
  const lang = useUiStore((s) => s.lang);
  const isDark = theme === 'dark';
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [dataset, setDataset] = useState<SavedReportRecord['dataset']>('ORDERS');
  const [dimension, setDimension] = useState<SavedReportRecord['dimension']>('channel');
  const [metric, setMetric] = useState<SavedReportRecord['metric']>('SUM_REVENUE');
  const [chartType, setChartType] = useState<SavedReportRecord['chartType']>('BAR');
  const [range, setRange] = useState<SavedReportRecord['range']>('90d');
  const [reportName, setReportName] = useState('');
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const handleDatasetChange = (nextDataset: SavedReportRecord['dataset']) => {
    setDataset(nextDataset);
    const allowedDims = VALID_DIMENSIONS[nextDataset];
    if (!allowedDims.includes(dimension)) setDimension(allowedDims[0]);
    const allowedMetrics = VALID_METRICS[nextDataset];
    if (!allowedMetrics.includes(metric)) setMetric(allowedMetrics[0]);
  };

  const datasetLabel: Record<SavedReportRecord['dataset'], string> = {
    ORDERS: lang === 'zh' ? '订单交易 (Orders)' : 'Orders',
    CUSTOMERS: lang === 'zh' ? '企业客户 (Customers)' : 'Customers',
    FUNNEL: lang === 'zh' ? '转化漏斗 (Funnel)' : 'Funnel',
  };

  const dimLabel: Record<SavedReportRecord['dimension'], string> = {
    channel: lang === 'zh' ? '获客渠道' : 'Channel',
    planTier: lang === 'zh' ? '订阅层级' : 'Plan Tier',
    status: lang === 'zh' ? '状态' : 'Status',
    month: lang === 'zh' ? '月份' : 'Month',
  };

  const metricLabel: Record<SavedReportRecord['metric'], string> = {
    SUM_REVENUE: lang === 'zh' ? (dataset === 'CUSTOMERS' ? '累计 LTV 总额' : '已结算净营收') : dataset === 'CUSTOMERS' ? 'Total LTV' : 'Net Revenue',
    COUNT: lang === 'zh' ? (dataset === 'FUNNEL' ? '访问总人数' : '记录总数') : dataset === 'FUNNEL' ? 'Total Visitors' : 'Record Count',
    AVG_AMOUNT: lang === 'zh' ? (dataset === 'CUSTOMERS' ? '平均客户 LTV' : '平均客单价') : dataset === 'CUSTOMERS' ? 'Avg LTV' : 'Avg Order Value',
    AVG_HEALTH: lang === 'zh' ? '平均健康评分' : 'Avg Health Score',
    PAID_USERS: lang === 'zh' ? '付费转化用户数' : 'Paid Conversions',
  };

  const savedQuery = useQuery({
    queryKey: ['reports', 'saved', activeWorkspace?.id],
    queryFn: () => apiRequest<{ currency: string; reports: SavedReportRecord[] }>('/api/reports'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const liveQuery = useQuery({
    queryKey: ['reports', 'query', activeWorkspace?.id, dataset, dimension, metric, range],
    queryFn: () =>
      apiRequest<{
        currency: string;
        total: number;
        rows: Array<{ label: string; value: number; count: number }>;
      }>('/api/reports/query', {
        method: 'POST',
        body: JSON.stringify({ dataset, dimension, metric, range }),
      }),
    enabled: Boolean(activeWorkspace?.id),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          name: reportName.trim() || `${dataset} · ${dimension} (${range})`,
          dataset,
          dimension,
          metric,
          chartType,
          range,
        }),
      }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? '自定义 BI 报表已保存到报表库' : 'Custom BI report saved');
      setReportName('');
      queryClient.invalidateQueries({ queryKey: ['reports', 'saved'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? '报表已移除' : 'Report removed');
      queryClient.invalidateQueries({ queryKey: ['reports', 'saved'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loadSaved = (r: SavedReportRecord) => {
    setActiveReportId(r.id);
    setDataset(r.dataset);
    setDimension(r.dimension);
    setMetric(r.metric);
    setChartType(r.chartType);
    setRange(r.range);
    setReportName(r.name);
  };

  const handleExportReport = async (id: string) => {
    const res = await fetch(`/api/reports/${id}/export.csv`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(activeWorkspace?.id ? { 'X-Workspace-Id': activeWorkspace.id } : {}),
      },
    });
    if (!res.ok) {
      toast.error('CSV export failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulseops-bi-${id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(lang === 'zh' ? 'BI 报表 CSV 导出成功' : 'BI report CSV exported');
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const currency = liveQuery.data?.currency || activeWorkspace?.currency || 'CNY';
  const rows = liveQuery.data?.rows ?? [];
  const isMonetary = metric === 'SUM_REVENUE' || metric === 'AVG_AMOUNT';
  const formatVal = (v: number) => (isMonetary ? formatCurrency(v, currency) : formatNumber(v));
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#EDF1F5';
  const tickColor = isDark ? '#A1A1AA' : '#64748B';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Sparkles className="h-3 w-3" />
          NO-CODE SELF-SERVE BI STUDIO
        </div>
        <h1 className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
          {lang === 'zh' ? '自定义多维 BI 报表工坊' : 'Self-Serve Custom BI Report Builder'}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
          {lang === 'zh'
            ? '无需编写 SQL，自由组合数据集、分组维度、聚合指标与可视化图表，支持实时预览、保存至报表库及一键 CSV 导出'
            : 'Slice Orders, Customers, and Funnel datasets across custom dimensions and metrics without writing SQL'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left: Saved Reports Library */}
        <div className="surface-card flex flex-col overflow-hidden xl:col-span-4">
          <div className="flex items-center gap-2 border-b border-slate-200/80 px-4 py-3.5 dark:border-white/[0.07]">
            <Bookmark className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {lang === 'zh' ? '已保存报表库' : 'Saved Reports'} ({savedQuery.data?.reports.length ?? 0})
            </h2>
          </div>

          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/[0.06]">
            {(savedQuery.data?.reports ?? []).map((r) => (
              <div
                key={r.id}
                onClick={() => loadSaved(r)}
                className={`cursor-pointer p-4 transition hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] ${
                  activeReportId === r.id ? 'bg-indigo-50/70 dark:bg-indigo-500/15' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-slate-900 dark:text-white">{r.name}</div>
                    {r.description && (
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-zinc-400">
                        {r.description}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Export CSV"
                      onClick={() => handleExportReport(r.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deleteMutation.mutate(r.id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-white/10 dark:text-zinc-300">
                    {r.dataset}
                  </span>
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    BY {r.dimension}
                  </span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    {r.chartType} · {r.range}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Interactive Query Builder + Live Visualization Canvas */}
        <div className="space-y-4 xl:col-span-8">
          {/* Query Configurator */}
          <form onSubmit={handleSave} className="surface-card space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {lang === 'zh' ? '数据集' : 'Dataset'}
                </label>
                <select
                  value={dataset}
                  onChange={(e) => handleDatasetChange(e.target.value as SavedReportRecord['dataset'])}
                  className="input-field h-8 w-full py-0 text-xs"
                >
                  {(['ORDERS', 'CUSTOMERS', 'FUNNEL'] as const).map((ds) => (
                    <option key={ds} value={ds}>
                      {datasetLabel[ds]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {lang === 'zh' ? '分组维度' : 'Group By'}
                </label>
                <select
                  value={dimension}
                  onChange={(e) => setDimension(e.target.value as SavedReportRecord['dimension'])}
                  className="input-field h-8 w-full py-0 text-xs"
                >
                  {VALID_DIMENSIONS[dataset].map((dim) => (
                    <option key={dim} value={dim}>
                      {dimLabel[dim]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {lang === 'zh' ? '聚合指标' : 'Metric'}
                </label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as SavedReportRecord['metric'])}
                  className="input-field h-8 w-full py-0 text-xs"
                >
                  {VALID_METRICS[dataset].map((m) => (
                    <option key={m} value={m}>
                      {metricLabel[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {lang === 'zh' ? '图表类型' : 'Chart'}
                </label>
                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as SavedReportRecord['chartType'])}
                  className="input-field h-8 w-full py-0 text-xs"
                >
                  <option value="BAR">BAR</option>
                  <option value="AREA">AREA</option>
                  <option value="PIE">PIE</option>
                  <option value="TABLE">TABLE</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {lang === 'zh' ? '时间窗口' : 'Range'}
                </label>
                <select
                  value={range}
                  onChange={(e) => setRange(e.target.value as SavedReportRecord['range'])}
                  className="input-field h-8 w-full py-0 text-xs"
                >
                  <option value="7d">7D</option>
                  <option value="30d">30D</option>
                  <option value="90d">90D</option>
                  <option value="12m">12M</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder={lang === 'zh' ? '输入报表名称保存到报表库...' : 'Name this report to save...'}
                className="input-field h-8 flex-1 text-xs"
              />
              <button type="submit" disabled={!canWrite || saveMutation.isPending} className="btn-primary h-8 px-3 text-xs">
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {lang === 'zh' ? '保存到报表库' : 'Save Report'}
              </button>
            </div>
          </form>

          {/* Live Chart Canvas */}
          <div className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  {datasetLabel[dataset]} · {metricLabel[metric]}（{lang === 'zh' ? '按' : 'by'} {dimLabel[dimension]}）
                </span>
              </div>
              <span className="tabular-nums rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-zinc-200">
                {lang === 'zh' ? '合计' : 'Total'}: {formatVal(liveQuery.data?.total ?? 0)}
              </span>
            </div>

            {chartType !== 'TABLE' && (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'BAR' ? (
                    <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fill: tickColor, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={62}
                        tickFormatter={(v: number) => (isMonetary ? formatCurrency(v, currency, true) : String(v))}
                      />
                      <Tooltip
                        formatter={(val: number) => formatVal(val)}
                        contentStyle={{
                          backgroundColor: '#0D0D12',
                          borderColor: '#3F3F46',
                          borderRadius: 12,
                          fontSize: 12,
                          color: '#fff',
                        }}
                      />
                      <Bar dataKey="value" fill="#635BFF" radius={[6, 6, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  ) : chartType === 'AREA' ? (
                    <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="biAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fill: tickColor, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={62}
                        tickFormatter={(v: number) => (isMonetary ? formatCurrency(v, currency, true) : String(v))}
                      />
                      <Tooltip
                        formatter={(val: number) => formatVal(val)}
                        contentStyle={{
                          backgroundColor: '#0D0D12',
                          borderColor: '#3F3F46',
                          borderRadius: 12,
                          fontSize: 12,
                          color: '#fff',
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#10B981" strokeWidth={2.5} fill="url(#biAreaGrad)" />
                    </AreaChart>
                  ) : (
                    <PieChart>
                      <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={60} outerRadius={96} paddingAngle={3}>
                        {rows.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => formatVal(val)}
                        contentStyle={{
                          backgroundColor: '#0D0D12',
                          borderColor: '#3F3F46',
                          borderRadius: 12,
                          fontSize: 12,
                          color: '#fff',
                        }}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}

            {/* Underlying Precision Data Table */}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/[0.07]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-semibold uppercase text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-400">
                    <th className="px-4 py-2.5">{dimLabel[dimension]}</th>
                    <th className="px-4 py-2.5 text-right">{metricLabel[metric]}</th>
                    <th className="px-4 py-2.5 text-right">{lang === 'zh' ? '样本记录数' : 'Records'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {rows.map((row) => (
                    <tr key={row.label} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-800 dark:text-zinc-200">
                        {row.label}
                      </td>
                      <td className="tabular-nums px-4 py-2 text-right font-bold text-indigo-600 dark:text-indigo-300">
                        {formatVal(row.value)}
                      </td>
                      <td className="tabular-nums px-4 py-2 text-right text-slate-500 dark:text-zinc-400">
                        {formatNumber(row.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
