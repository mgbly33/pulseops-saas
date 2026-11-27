import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  FileCheck2,
  RotateCcw,
  CheckCircle2,
  Save,
  Clock,
  Lock,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import {
  apiRequest,
  downloadCsvExport,
  type AuditLogRecord,
  type OrderRecord,
  type OrdersListResponse,
} from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatCurrency, formatDateTime } from '../lib/format';
import { toast } from '../store/toastStore';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeletons';

const STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  REFUNDED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  FAILED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10',
};

const TIER_BADGE: Record<string, string> = {
  STARTER: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
  PRO: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  ENTERPRISE: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
};

const columnHelper = createColumnHelper<OrderRecord>();

export function OrdersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || 'ALL';
  const channel = searchParams.get('channel') || 'ALL';
  const planTier = searchParams.get('planTier') || 'ALL';
  const search = searchParams.get('search') || '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

  const [searchInput, setSearchInput] = useState(search);
  const [exporting, setExporting] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Clear stale row selection when page, filters, or active workspace changes
  useEffect(() => {
    setRowSelection({});
  }, [page, status, channel, planTier, search, activeWorkspace?.id]);

  // Keep local search input in sync if URL search param resets externally
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce search query synced to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        const next = new URLSearchParams(searchParams);
        if (searchInput.trim()) next.set('search', searchInput.trim());
        else next.delete('search');
        next.set('page', '1');
        setSearchParams(next, { replace: true });
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [searchInput, search, searchParams, setSearchParams]);

  const setFilter = (key: string, val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val === 'ALL' || !val) next.delete(key);
    else next.set(key, val);
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const toggleSort = (field: string) => {
    const next = new URLSearchParams(searchParams);
    if (sortBy === field) {
      next.set('sortDir', sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sortBy', field);
      next.set('sortDir', 'desc');
    }
    setSearchParams(next, { replace: true });
  };

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      page: String(page),
      pageSize: '15',
      sortBy,
      sortDir,
    });
    if (status !== 'ALL') p.set('status', status);
    if (channel !== 'ALL') p.set('channel', channel);
    if (planTier !== 'ALL') p.set('planTier', planTier);
    if (search) p.set('search', search);
    return p;
  }, [page, sortBy, sortDir, status, channel, planTier, search]);

  const ordersQuery = useQuery({
    queryKey: ['orders', activeWorkspace?.id, queryParams.toString()],
    queryFn: () => apiRequest<OrdersListResponse>(`/api/orders?${queryParams.toString()}`),
    enabled: Boolean(activeWorkspace?.id),
  });

  const detailQuery = useQuery({
    queryKey: ['orders', 'detail', activeWorkspace?.id, selectedOrderId],
    queryFn: () =>
      apiRequest<{ currency: string; order: OrderRecord; timeline: AuditLogRecord[] }>(
        `/api/orders/${selectedOrderId}`,
      ),
    enabled: Boolean(activeWorkspace?.id && selectedOrderId),
  });

  useEffect(() => {
    if (detailQuery.data?.order) {
      setNoteDraft(detailQuery.data.order.note ?? '');
    }
  }, [detailQuery.data?.order]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedOrderId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedOrderId]);

  const patchOrderMutation = useMutation({
    mutationFn: (payload: { id: string; status?: string; invoiced?: boolean; note?: string }) =>
      apiRequest<{ order: OrderRecord }>(`/api/orders/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: payload.status,
          invoiced: payload.invoiced,
          note: payload.note,
        }),
      }),
    onSuccess: () => {
      toast.success(t('orders.updatedSuccess'));
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkActionMutation = useMutation({
    mutationFn: (payload: { orderIds: string[]; action: 'MARK_INVOICED' | 'MARK_REFUNDED' | 'MARK_PAID' }) =>
      apiRequest<{ updatedCount: number; action: string }>('/api/orders/bulk-action', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      toast.success(
        lang === 'zh'
          ? `批量操作已完成（更新 ${res.updatedCount} 条订单并写入审计日志）`
          : `Bulk action completed (${res.updatedCount} orders updated & audited)`,
      );
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const currency = ordersQuery.data?.currency || activeWorkspace?.currency || 'CNY';

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsvExport(queryParams);
      toast.success(t('orders.exportSuccess'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onClick={(e) => e.stopPropagation()}
            onChange={row.getToggleSelectedHandler()}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        ),
      }),
      columnHelper.accessor('orderCode', {
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('orderCode')}
            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
          >
            {t('orders.colOrderCode')}
            <ArrowUpDown className="h-3 w-3 opacity-60" />
          </button>
        ),
        cell: (info) => (
          <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.customer.companyName, {
        id: 'customer',
        header: t('orders.colCustomer'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {row.original.customer.companyName}
            </div>
            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {row.original.customer.contactName}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('planTier', {
        header: t('orders.colTier'),
        cell: (info) => (
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
              TIER_BADGE[info.getValue()] || ''
            }`}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('channel', {
        header: t('orders.colChannel'),
        cell: (info) => (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {t(`channels.${info.getValue()}`)}
          </span>
        ),
      }),
      columnHelper.accessor('amount', {
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('amount')}
            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
          >
            {t('orders.colAmount')}
            <ArrowUpDown className="h-3 w-3 opacity-60" />
          </button>
        ),
        cell: (info) => (
          <span className="tabular-nums text-xs font-semibold text-slate-900 dark:text-white">
            {formatCurrency(info.getValue(), currency)}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('status')}
            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
          >
            {t('orders.colStatus')}
            <ArrowUpDown className="h-3 w-3 opacity-60" />
          </button>
        ),
        cell: (info) => (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              STATUS_BADGE[info.getValue()] || ''
            }`}
          >
            {t(`orderStatus.${info.getValue()}`)}
          </span>
        ),
      }),
      columnHelper.accessor('invoiced', {
        header: t('orders.colInvoice'),
        cell: (info) =>
          info.getValue() ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <FileCheck2 className="h-3.5 w-3.5" />
              {t('orders.invoiced')}
            </span>
          ) : (
            <span className="text-[11px] text-slate-400">{t('orders.uninvoiced')}</span>
          ),
      }),
      columnHelper.accessor('createdAt', {
        header: () => (
          <button
            type="button"
            onClick={() => toggleSort('createdAt')}
            className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
          >
            {t('orders.colDate')}
            <ArrowUpDown className="h-3 w-3 opacity-60" />
          </button>
        ),
        cell: (info) => (
          <span className="tabular-nums whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
            {formatDateTime(info.getValue(), lang)}
          </span>
        ),
      }),
    ],
    [currency, lang, sortBy, sortDir, t],
  );

  const table = useReactTable({
    data: ordersQuery.data?.items ?? [],
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const total = ordersQuery.data?.total ?? 0;
  const totalPages = ordersQuery.data?.totalPages ?? 1;
  const fromIdx = total === 0 ? 0 : (page - 1) * 15 + 1;
  const toIdx = Math.min(total, page * 15);
  const selectedOrder = detailQuery.data?.order;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('orders.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('orders.subtitle')}</p>
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={handleExportCsv}
          className="btn-secondary shrink-0"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? t('orders.exporting') : t('orders.exportCsv')}
        </button>
      </div>

      {/* Filtered Orders Financial Summary Strip */}
      {ordersQuery.data?.summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: lang === 'zh' ? '当前筛选交易总额' : 'Filtered GMV',
              val: formatCurrency(ordersQuery.data.summary.totalAmount, currency),
              sub: `${ordersQuery.data.total} ${lang === 'zh' ? '笔订单' : 'orders'}`,
              tone: 'text-slate-900 dark:text-white',
            },
            {
              label: lang === 'zh' ? '已支付结算净额' : 'Settled Paid',
              val: formatCurrency(ordersQuery.data.summary.paidAmount, currency),
              sub: `${ordersQuery.data.summary.paidCount} ${lang === 'zh' ? '笔已支付' : 'paid'}`,
              tone: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              label: lang === 'zh' ? '待结算金额' : 'Pending Settlement',
              val: formatCurrency(ordersQuery.data.summary.pendingAmount, currency),
              sub: lang === 'zh' ? '财务核对中' : 'In reconciliation',
              tone: 'text-amber-600 dark:text-amber-400',
            },
            {
              label: lang === 'zh' ? '退款扣减金额' : 'Refunded Volume',
              val: formatCurrency(ordersQuery.data.summary.refundedAmount, currency),
              sub: `${ordersQuery.data.summary.refundedCount} ${lang === 'zh' ? '笔已退款' : 'refunded'}`,
              tone: 'text-rose-600 dark:text-rose-400',
            },
          ].map((card, i) => (
            <div key={i} className="surface-card px-4 py-3">
              <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">{card.label}</div>
              <div className={`tabular-nums mt-1 text-lg font-bold ${card.tone}`}>{card.val}</div>
              <div className="tabular-nums mt-0.5 text-[11px] text-slate-400">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Action Bar when rows are selected */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 text-xs dark:border-indigo-500/30 dark:bg-indigo-500/15">
          <span className="font-semibold text-indigo-900 dark:text-indigo-200">
            {lang === 'zh' ? `已选中 ${selectedIds.length} 笔订单` : `${selectedIds.length} orders selected`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canWrite || bulkActionMutation.isPending}
              title={!canWrite ? t('orders.readonlyTip') : ''}
              onClick={() => bulkActionMutation.mutate({ orderIds: selectedIds, action: 'MARK_INVOICED' })}
              className="btn-secondary h-8 px-3 text-xs"
            >
              <FileCheck2 className="h-3.5 w-3.5 text-indigo-600" />
              {lang === 'zh' ? '批量标记开票' : 'Bulk Invoice'}
            </button>
            <button
              type="button"
              disabled={!canWrite || bulkActionMutation.isPending}
              title={!canWrite ? t('orders.readonlyTip') : ''}
              onClick={() => bulkActionMutation.mutate({ orderIds: selectedIds, action: 'MARK_REFUNDED' })}
              className="btn-danger h-8 px-3 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {lang === 'zh' ? '批量标记退款' : 'Bulk Refund'}
            </button>
            <button
              type="button"
              onClick={() => setRowSelection({})}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10"
            >
              {t('customers.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="surface-card flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('orders.searchPlaceholder')}
            className="input-field w-full !pl-9"
          />
        </div>

        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="input-field text-xs font-medium"
        >
          {(['ALL', 'PAID', 'PENDING', 'REFUNDED', 'FAILED'] as const).map((st) => (
            <option key={st} value={st}>
              {t(`orderStatus.${st}`)}
            </option>
          ))}
        </select>

        <select
          value={channel}
          onChange={(e) => setFilter('channel', e.target.value)}
          className="input-field text-xs font-medium"
        >
          {(['ALL', 'ORGANIC', 'PAID_SEARCH', 'SOCIAL', 'PARTNER'] as const).map((ch) => (
            <option key={ch} value={ch}>
              {t(`channels.${ch}`)}
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

        {(status !== 'ALL' || channel !== 'ALL' || planTier !== 'ALL' || search) && (
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
      </div>

      {/* TanStack Data Table */}
      <div className="surface-card overflow-hidden">
        {ordersQuery.isLoading ? (
          <TableSkeleton rows={10} />
        ) : ordersQuery.data?.items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr
                    key={hg.id}
                    className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400"
                  >
                    {hg.headers.map((header) => (
                      <th key={header.id} className="whitespace-nowrap px-3 py-3">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedOrderId(row.original.id)}
                    className={`cursor-pointer transition hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] ${
                      selectedOrderId === row.original.id
                        ? 'bg-indigo-50/70 dark:bg-indigo-500/10'
                        : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs dark:border-white/[0.08]">
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {t('orders.showing', { from: fromIdx, to: toIdx, total })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setFilter('page', String(page - 1))}
              className="btn-secondary h-8 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('orders.prevPage')}
            </button>
            <span className="tabular-nums px-2 font-medium text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setFilter('page', String(page + 1))}
              className="btn-secondary h-8 px-2.5 text-xs"
            >
              {t('orders.nextPage')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-out Order Detail Drawer */}
      {selectedOrderId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]"
          onClick={() => setSelectedOrderId(null)}
        >
          <div
            className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111827]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/[0.08]">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('orders.drawerTitle')}
                </h2>
                {selectedOrder && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(selectedOrder.orderCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1600);
                    }}
                    className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                  >
                    <span>{selectedOrder.orderCode}</span>
                    {copiedCode ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-70" />}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {detailQuery.isLoading || !selectedOrder ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                </div>
              ) : (
                <>
                  {/* Order Amount & Status Card */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <div className="flex items-center justify-between">
                      <span className="tabular-nums text-2xl font-bold text-slate-900 dark:text-white">
                        {formatCurrency(selectedOrder.amount, currency)}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[selectedOrder.status]
                        }`}
                      >
                        {t(`orderStatus.${selectedOrder.status}`)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <div>
                        {t('orders.colTier')}:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {selectedOrder.planTier}
                        </strong>
                      </div>
                      <div>
                        {t('orders.colChannel')}:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {t(`channels.${selectedOrder.channel}`)}
                        </strong>
                      </div>
                      <div>
                        {t('orders.colInvoice')}:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {selectedOrder.invoiced ? t('orders.invoiced') : t('orders.uninvoiced')}
                        </strong>
                      </div>
                      <div className="tabular-nums">
                        {formatDateTime(selectedOrder.createdAt, lang)}
                      </div>
                    </div>

                    {/* Visual Order Lifecycle Stepper */}
                    <div className="mt-4 flex items-center gap-2 border-t border-slate-200/70 pt-3 text-[11px] dark:border-white/[0.08]">
                      {[
                        { label: lang === 'zh' ? '订单创建' : 'Created', done: true },
                        {
                          label:
                            selectedOrder.status === 'REFUNDED'
                              ? lang === 'zh'
                                ? '已退款'
                                : 'Refunded'
                              : selectedOrder.status === 'PAID'
                                ? lang === 'zh'
                                  ? '支付结算'
                                  : 'Settled'
                                : t(`orderStatus.${selectedOrder.status}`),
                          done: selectedOrder.status === 'PAID' || selectedOrder.status === 'REFUNDED',
                          danger: selectedOrder.status === 'REFUNDED' || selectedOrder.status === 'FAILED',
                        },
                        { label: lang === 'zh' ? '财务开票' : 'Invoiced', done: selectedOrder.invoiced },
                      ].map((step, i) => (
                        <div key={i} className="flex flex-1 items-center gap-1.5">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                              step.danger
                                ? 'bg-rose-500 text-white'
                                : step.done
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-zinc-400'
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="truncate font-medium text-slate-700 dark:text-zinc-300">
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t('orders.customerInfo')}
                    </h3>
                    <div className="rounded-xl border border-slate-200 p-3.5 text-xs dark:border-white/[0.08]">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {selectedOrder.customer.companyName}
                      </div>
                      <div className="mt-1 text-slate-500 dark:text-slate-400">
                        {selectedOrder.customer.contactName} · {selectedOrder.customer.email}
                      </div>
                    </div>
                  </div>

                  {/* Operational Actions */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {t('orders.actions')}
                      </h3>
                      {!canWrite && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Lock className="h-3 w-3" />
                          ANALYST
                        </span>
                      )}
                    </div>

                    {!canWrite && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        {t('orders.readonlyTip')}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {selectedOrder.status !== 'REFUNDED' ? (
                        <button
                          type="button"
                          disabled={!canWrite || patchOrderMutation.isPending}
                          title={!canWrite ? t('orders.readonlyTip') : ''}
                          onClick={() =>
                            patchOrderMutation.mutate({ id: selectedOrder.id, status: 'REFUNDED' })
                          }
                          className="btn-danger text-xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {t('orders.markRefund')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canWrite || patchOrderMutation.isPending}
                          title={!canWrite ? t('orders.readonlyTip') : ''}
                          onClick={() =>
                            patchOrderMutation.mutate({ id: selectedOrder.id, status: 'PAID' })
                          }
                          className="btn-secondary text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {t('orders.markPaid')}
                        </button>
                      )}

                      {!selectedOrder.invoiced && (
                        <button
                          type="button"
                          disabled={!canWrite || patchOrderMutation.isPending}
                          title={!canWrite ? t('orders.readonlyTip') : ''}
                          onClick={() =>
                            patchOrderMutation.mutate({ id: selectedOrder.id, invoiced: true })
                          }
                          className="btn-secondary text-xs"
                        >
                          <FileCheck2 className="h-3.5 w-3.5 text-indigo-600" />
                          {t('orders.markInvoiced')}
                        </button>
                      )}
                    </div>

                    {/* Note editor */}
                    <div className="mt-4">
                      <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t('orders.noteLabel')}
                      </label>
                      <textarea
                        rows={3}
                        disabled={!canWrite}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder={t('orders.notePlaceholder')}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-[#0F172A] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        disabled={!canWrite || patchOrderMutation.isPending}
                        onClick={() =>
                          patchOrderMutation.mutate({ id: selectedOrder.id, note: noteDraft })
                        }
                        className="btn-primary mt-2 h-8 px-3 text-xs"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {t('orders.saveNote')}
                      </button>
                    </div>
                  </div>

                  {/* Audit Timeline */}
                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {t('orders.timelineTitle')}
                    </h3>
                    {(detailQuery.data?.timeline.length ?? 0) === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-white/10">
                        {t('orders.timelineEmpty')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {(detailQuery.data?.timeline ?? []).map((log) => (
                          <div
                            key={log.id}
                            className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-white/[0.06] dark:bg-white/[0.02]"
                          >
                            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                  {log.action}
                                </span>
                                <span className="tabular-nums text-[10px] text-slate-400">
                                  {formatDateTime(log.createdAt, lang)}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {log.user.name} ({log.user.email})
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
