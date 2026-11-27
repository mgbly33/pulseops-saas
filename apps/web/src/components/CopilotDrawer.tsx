import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, X, Send, ArrowUpRight, Bot, User, Loader2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useActiveWorkspace } from '../store/authStore';
import { useUiStore } from '../store/uiStore';

interface CopilotReply {
  intent: string;
  answer: string;
  highlights: Array<{ label: string; value: string }>;
  table?: { columns: string[]; rows: string[][] };
  actionLink?: { label: string; to: string };
  suggestions: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: CopilotReply;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function renderRichText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function CopilotDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const activeWorkspace = useActiveWorkspace();
  const lang = useUiStore((s) => s.lang);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const starterPrompts =
    lang === 'zh'
      ? [
          '哪些高价值企业客户有流失风险？',
          '近30天哪个渠道 ROI 最高？',
          '汇总大客户 LTV 排行榜',
          '目前退款率和待开票订单情况？',
          '给我一份本期经营整体诊断简报',
        ]
      : [
          'Which high-LTV accounts are at risk?',
          'Which acquisition channel has the best ROI?',
          'Show top enterprise accounts by LTV',
          'Analyze 30-day refund rate and uninvoiced orders',
          'Give me an executive revenue summary',
        ];

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      apiRequest<CopilotReply>('/api/copilot/ask', {
        method: 'POST',
        body: JSON.stringify({ question, lang }),
      }),
    onSuccess: (reply) => {
      setMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, role: 'assistant', text: reply.answer, reply },
      ]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, askMutation.isPending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const sendQuestion = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || askMutation.isPending) return;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setInput('');
    askMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-slate-200/80 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0D0D11]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-500 text-white shadow-md">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <span>PulseAI RevOps Copilot</span>
                <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                  LIVE SQL
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                {activeWorkspace?.name} · {lang === 'zh' ? '直连实时数据库聚合分析' : 'Live workspace database analyst'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Conversation Feed */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 to-white p-4 text-xs leading-relaxed text-slate-700 dark:border-indigo-500/25 dark:bg-indigo-500/[0.08] dark:from-indigo-500/10 dark:to-transparent dark:text-zinc-300">
                {lang === 'zh'
                  ? '你好！我是 PulseAI 商业增长副驾驶。你可以直接用自然语言提问，我会实时查询当前工作区的订单、客户 LTV、渠道归因与退款数据并给出结构化证据与行动建议。'
                  : 'Hello! I am PulseAI, your live RevOps analyst. Ask any question in plain English or Chinese — I query your active workspace database in real time and return structured evidence.'}
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  {lang === 'zh' ? '推荐高管提问' : 'Suggested Executive Queries'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendQuestion(p)}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[88%] space-y-3 rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#4F46E5] text-white shadow-sm'
                    : 'border border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-white/[0.08] dark:bg-[#15151B] dark:text-zinc-300'
                }`}
              >
                <div>{msg.role === 'assistant' ? renderRichText(msg.text) : msg.text}</div>

                {/* Metric Highlights */}
                {msg.reply?.highlights && msg.reply.highlights.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {msg.reply.highlights.map((h, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.03]"
                      >
                        <div className="truncate text-[10px] text-slate-400">{h.label}</div>
                        <div className="tabular-nums mt-0.5 truncate text-xs font-bold text-slate-900 dark:text-white">
                          {h.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline Live Evidence Table */}
                {msg.reply?.table && msg.reply.table.rows.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white dark:border-white/[0.07] dark:bg-[#0F0F14]">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-zinc-400">
                          {msg.reply.table.columns.map((c, idx) => (
                            <th key={idx} className="whitespace-nowrap px-2.5 py-1.5 font-semibold">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                        {msg.reply.table.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="tabular-nums whitespace-nowrap px-2.5 py-1.5 text-slate-700 dark:text-zinc-200"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action Deep-Link & Follow-ups */}
                {msg.reply?.actionLink && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate(msg.reply!.actionLink!.to);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-200"
                  >
                    <span>{msg.reply.actionLink.label}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {msg.reply?.suggestions && msg.reply.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.reply.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendQuestion(s)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-zinc-200">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {askMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{lang === 'zh' ? '正在实时聚合工作区数据...' : 'Querying live workspace telemetry...'}</span>
            </div>
          )}
        </div>

        {/* Input Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-200/80 p-4 dark:border-white/[0.08]"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              lang === 'zh'
                ? '输入业务问题，例如：哪些高价值客户有流失风险？'
                : 'Ask a RevOps question, e.g., Which channel has the best ROI?'
            }
            className="input-field flex-1 text-xs"
          />
          <button type="submit" disabled={!input.trim() || askMutation.isPending} className="btn-primary h-9 px-3.5">
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
