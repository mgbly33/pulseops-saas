import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Terminal,
  Webhook,
  Plus,
  Send,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { formatDateTime } from '../lib/format';
import { toast } from '../store/toastStore';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface WebhookEndpointRecord {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  enabled: boolean;
  deliveryCount: number;
  lastStatus: number | null;
  lastDeliveredAt: string | null;
}

interface DeliveryPreview {
  endpointId: string;
  url: string;
  httpStatus: number;
  latencyMs: number;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}

const ALL_EVENTS = ['order.paid', 'order.refunded', 'customer.at_risk', 'alert.triggered', 'playbook.executed'];

export function DevelopersPage() {
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const canWrite = activeWorkspace?.role === 'OWNER' || activeWorkspace?.role === 'ADMIN';

  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [lastDelivery, setLastDelivery] = useState<DeliveryPreview | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  useEscapeKey(createOpen, () => setCreateOpen(false));
  const [name, setName] = useState('');
  const [url, setUrl] = useState('https://hooks.example.com/pulseops');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['order.paid', 'alert.triggered']);

  const query = useQuery({
    queryKey: ['developers', 'webhooks', activeWorkspace?.id],
    queryFn: () =>
      apiRequest<{ workspaceId: string; endpoints: WebhookEndpointRecord[] }>('/api/developers/webhooks'),
    enabled: Boolean(activeWorkspace?.id),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/developers/webhooks', {
        method: 'POST',
        body: JSON.stringify({ name, url, events: selectedEvents }),
      }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? 'Webhook 端点已创建并生成 HMAC 签名密钥' : 'Webhook endpoint registered');
      setCreateOpen(false);
      setName('');
      queryClient.invalidateQueries({ queryKey: ['developers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => {
      setTestingId(id);
      return apiRequest<{ delivery: DeliveryPreview }>(`/api/developers/webhooks/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (res) => {
      setLastDelivery(res.delivery);
      toast.success(
        lang === 'zh'
          ? `HMAC-SHA256 签名测试事件发送成功 (HTTP ${res.delivery.httpStatus} · ${res.delivery.latencyMs}ms)`
          : `Signed test webhook delivered (HTTP ${res.delivery.httpStatus} · ${res.delivery.latencyMs}ms)`,
      );
      queryClient.invalidateQueries({ queryKey: ['developers'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setTestingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/developers/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(lang === 'zh' ? 'Webhook 端点已删除' : 'Webhook deleted');
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || selectedEvents.length === 0) return;
    createMutation.mutate();
  };

  const curlSnippet = `curl -X GET "${window.location.origin}/api/analytics/overview?range=30d" \\
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \\
  -H "X-Workspace-Id: ${activeWorkspace?.id ?? 'workspace_id'}"`;

  const readonlyTip =
    lang === 'zh'
      ? '只读分析师视角（ANALYST）无权管理或派发 Webhook 测试'
      : 'Analyst role (ANALYST) cannot create, delete, or dispatch webhook tests';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Terminal className="h-3 w-3" />
            DEVELOPERS · WEBHOOKS & HMAC
          </div>
          <h1 className="mt-1.5 text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
            {lang === 'zh' ? '开发者中心与 Webhook 签名沙盒' : 'Developers & Signed Webhooks Console'}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            {lang === 'zh'
              ? '管理实时事件推送端点、HMAC-SHA256 签名密钥，并在线派发带签名请求头的测试事件进行联调'
              : 'Configure outbound event webhooks with HMAC-SHA256 signing secrets and inspect live test deliveries'}
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
          {lang === 'zh' ? '添加 Webhook 端点' : 'Add Webhook Endpoint'}
        </button>
      </div>

      {/* Main Split: Endpoints List + Live HMAC Delivery Inspector */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-3.5 xl:col-span-7">
          {(query.data?.endpoints ?? []).map((ep) => {
            const revealed = Boolean(revealedSecrets[ep.id]);
            return (
              <div key={ep.id} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 text-indigo-500" />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{ep.name}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        HTTP {ep.lastStatus ?? 200}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-zinc-400">
                      {ep.url}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!canWrite || testingId === ep.id}
                      title={!canWrite ? readonlyTip : ''}
                      onClick={() => testMutation.mutate(ep.id)}
                      className="btn-secondary h-8 px-2.5 text-xs"
                    >
                      {testingId === ep.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5 text-indigo-500" />
                      )}
                      {lang === 'zh' ? '派发签名测试' : 'Send Test'}
                    </button>
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => deleteMutation.mutate(ep.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Signing Secret Bar */}
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 font-mono text-[11px] dark:border-white/[0.07] dark:bg-white/[0.02]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span className="truncate text-slate-700 dark:text-zinc-300">
                      {revealed ? ep.secret : `${ep.secret.slice(0, 12)}••••••••••••••••••••`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRevealedSecrets((s) => ({ ...s, [ep.id]: !s[ep.id] }))}
                      className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                    >
                      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(ep.id, ep.secret)}
                      className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
                    >
                      {copiedKey === ep.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {ep.events.map((ev) => (
                      <span
                        key={ev}
                        className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                  <span className="tabular-nums text-[11px] text-slate-400">
                    {ep.deliveryCount} {lang === 'zh' ? '次成功送达' : 'deliveries'}
                    {ep.lastDeliveredAt ? ` · ${formatDateTime(ep.lastDeliveredAt, lang)}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Live HMAC Signed Payload Inspector + cURL Quickstart */}
        <div className="space-y-4 xl:col-span-5">
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-white/[0.07]">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {lang === 'zh' ? '实时签名请求检验台 (HMAC-SHA256)' : 'Signed Delivery Inspector'}
              </span>
              {lastDelivery && (
                <span className="tabular-nums rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  200 OK · {lastDelivery.latencyMs}ms
                </span>
              )}
            </div>
            <div className="p-4">
              {!lastDelivery ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400 dark:border-white/10">
                  {lang === 'zh'
                    ? '点击左侧任意端点的「派发签名测试」查看真实 HMAC-SHA256 请求头与 JSON 负载'
                    : 'Click "Send Test" on any endpoint to inspect the real HMAC-SHA256 signature header & JSON payload'}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
                    <div className="text-slate-400">// HTTP Request Headers</div>
                    {Object.entries(lastDelivery.headers).map(([k, v]) => (
                      <div key={k} className="mt-1 break-all">
                        <span className="text-indigo-300">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                  <pre className="max-h-60 overflow-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
                    {JSON.stringify(lastDelivery.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Workspace Quick cURL Snippet */}
          <div className="surface-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {lang === 'zh' ? '工作区 REST API 快速调用示例' : 'Workspace REST API Quickstart'}
              </span>
              <button
                type="button"
                onClick={() => copyText('curl', curlSnippet)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
              >
                {copiedKey === 'curl' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copy cURL
              </button>
            </div>
            <pre className="overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-indigo-200">
              {curlSnippet}
            </pre>
          </div>
        </div>
      </div>

      {/* Create Webhook Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs"
          onClick={() => setCreateOpen(false)}
        >
          <div className="surface-card w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {lang === 'zh' ? '注册新 Webhook 回调端点' : 'Register Webhook Endpoint'}
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
                  {lang === 'zh' ? '端点名称' : 'Endpoint Name'}
                </label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" placeholder="CRM Sync Webhook" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Endpoint URL (HTTPS)
                </label>
                <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} className="input-field w-full font-mono text-xs" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {lang === 'zh' ? '订阅事件列表' : 'Subscribed Events'}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_EVENTS.map((ev) => {
                    const active = selectedEvents.includes(ev);
                    return (
                      <button
                        key={ev}
                        type="button"
                        onClick={() => toggleEvent(ev)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                          active
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
                            : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-zinc-400'
                        }`}
                      >
                        {ev}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {lang === 'zh' ? '创建端点' : 'Create Endpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
