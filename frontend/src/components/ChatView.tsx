/**
 * ChatView — 全頁對話工作台：KPI +（對話欄內）即時動態 + 訊息 + 右側監控。
 * 即時動態為 Apple LiveBoard 柵格，無場景輪播／自動下一步。
 */
import { useEffect, useMemo, useState } from 'react';
import { fmtUsd, fmtWhen } from '../lib/agentUi';
import { buildAnimLiveFeed } from '../lib/animLive';
import { useChatLiveMonitor } from '../hooks/useChatLiveMonitor';
import type { ChatMessage } from '../types';
import ChatLiveRail from './ChatLiveRail';
import { LiveTicker, TopKpi } from './ChatMonitorCards';
import InputBar from './InputBar';
import type { SendOptions } from './InputBar';
import LiveBoard from './LiveBoard';
import MessageList from './MessageList';

interface ChatViewProps {
  messages: ChatMessage[];
  sessionId: string;
  loading: boolean;
  sending: boolean;
  error: string | null;
  lastQuery: string | null;
  onSend: (text: string, options: SendOptions) => void;
  onRetry: () => void;
  onDismissError: () => void;
  onOpenTask: (messageId: string) => void;
  onOpenTrace?: (taskId: string) => void;
  onSuggest: (text: string, company: boolean) => void;
}

export default function ChatView({
  messages,
  sessionId,
  loading,
  sending,
  error,
  lastQuery,
  onSend,
  onRetry,
  onDismissError,
  onOpenTask,
  onOpenTrace,
  onSuggest,
}: ChatViewProps) {
  const monitor = useChatLiveMonitor();
  const [railOpen, setRailOpen] = useState(true);
  /** LiveBoard 與訊息同欄停靠，不橫跨右側監控 */
  const [boardOpen, setBoardOpen] = useState(true);

  const s = monitor.agents?.summary;
  const streaming = messages.some((m) => m.streaming);
  const taskMsgs = messages.filter((m) => m.taskState).length;
  const runningTasks = messages.filter(
    (m) => m.taskState?.status === 'running' || m.taskState?.status === 'pending',
  ).length;

  const liveFeed = useMemo(
    () =>
      buildAnimLiveFeed({
        agents: monitor.agents,
        optimization: monitor.optimization,
        opc: monitor.opc,
        billing: monitor.billing,
        llmOps: monitor.llmOps,
        messages,
        updatedAt: monitor.updatedAt,
      }),
    [
      monitor.agents,
      monitor.optimization,
      monitor.opc,
      monitor.billing,
      monitor.llmOps,
      monitor.updatedAt,
      messages,
    ],
  );

  // 有真實活動時自動展開面板
  useEffect(() => {
    if (liveFeed.live || streaming || sending) setBoardOpen(true);
  }, [liveFeed.live, streaming, sending]);

  const tickerItems = useMemo(() => {
    const items: Array<{ key: string; text: string; ts?: string; accent?: string }> = [];
    if (sending || streaming) {
      const phase = messages.find((m) => m.streaming)?.streamPhase;
      items.push({
        key: 'gen',
        text: phase ? `生成中 · ${phase}` : '生成中…',
        accent: 'text-emerald-300',
      });
    }
    for (const a of monitor.agents?.agents ?? []) {
      for (const ev of (a.events ?? []).slice(0, 2)) {
        items.push({
          key: `${a.id}-${ev.ts}-${ev.event}`,
          ts: ev.ts ? fmtWhen(ev.ts).split(' ')[1] : undefined,
          text: `${a.name} · ${ev.event.replace(/_/g, ' ')}`,
          accent: ev.event.includes('error') ? 'text-red-300' : 'text-gray-400',
        });
      }
    }
    return items.slice(0, 12);
  }, [sending, streaming, messages, monitor.agents?.agents]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-gray-800 bg-gray-950/50 px-3 py-2.5 lg:px-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">對話工作台</p>
            <p className="text-[10px] text-gray-600">
              KPI · LiveBoard · 右側監控
              {sending || streaming ? ' · 生成中' : ''}
              {runningTasks > 0 ? ` · ${runningTasks} 任務進行中` : ''}
              {liveFeed.live ? ' · LIVE' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBoardOpen((v) => !v)}
              className="rounded-xl border border-white/[0.08] px-2.5 py-1 text-[11px] text-[#8E8E93] hover:border-[#007AFF]/40 hover:text-[#64D2FF]"
            >
              {boardOpen ? '收合動態' : '展開動態'}
            </button>
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="rounded-lg border border-gray-800 px-2.5 py-1 text-[11px] text-gray-400 hover:border-blue-500/40 hover:text-blue-300 lg:hidden"
            >
              {railOpen ? '隱藏監控' : '顯示監控'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-12">
          <TopKpi label="本對話訊息" value={String(messages.length)} hint={`任務卡 ${taskMsgs}`} />
          <TopKpi
            label="忙碌 Agent"
            value={String(s?.roles_busy ?? 0)}
            hint={`等待 ${s?.roles_waiting ?? 0}`}
            accent="text-emerald-300"
            pulse={(s?.roles_busy ?? 0) > 0}
          />
          <TopKpi
            label="開放工作"
            value={String(s?.work_items_open ?? 0)}
            hint={`角色 ${s?.roles_total ?? 0}`}
            accent="text-[#64D2FF]"
          />
          <TopKpi
            label="公司任務"
            value={String(s?.running_company_tasks ?? 0)}
            hint={`合計 ${s?.company_tasks ?? 0}`}
            accent="text-sky-300"
            pulse={(s?.running_company_tasks ?? 0) > 0}
          />
          <TopKpi
            label="告警"
            value={String(s?.alerts_open ?? 0)}
            hint={`異常 ${s?.roles_disabled ?? 0}`}
            accent={(s?.alerts_open ?? 0) > 0 ? 'text-amber-300' : 'text-gray-100'}
          />
          <TopKpi
            label="記憶庫"
            value={String(monitor.memoryCount)}
            hint="向量條目"
            accent="text-cyan-300"
          />
          <TopKpi
            label="API 用量"
            value={fmtUsd(s?.total_api_cost_usd ?? 0)}
            hint="LLM token"
            accent="text-[#64D2FF]"
          />
          <TopKpi
            label="Docker"
            value={fmtUsd(s?.total_docker_cost_usd ?? 0)}
            hint="容器分攤"
            accent="text-sky-300"
          />
          <TopKpi
            label="阿里雲"
            value={fmtUsd(s?.total_aliyun_cost_usd ?? 0)}
            hint="BSS 帳目"
            accent="text-orange-300"
          />
          <TopKpi
            label="Agent 合計"
            value={fmtUsd(s?.total_cost_usd ?? 0)}
            hint="API＋雲"
            accent="text-amber-300"
          />
          <TopKpi
            label="雲 CPU"
            value={monitor.cloudLatest.cpu > 0 ? `${monitor.cloudLatest.cpu.toFixed(0)}%` : '—'}
            hint={`${monitor.cloudLatest.memMb.toFixed(0)} MB`}
            accent="text-blue-300"
          />
          <TopKpi
            label="LLM"
            value={monitor.llmOps?.configured ? (monitor.llmOps.ops?.stale ? 'Stale' : 'OK') : '—'}
            hint={monitor.llmOps?.model?.split('/').pop() ?? '未配置'}
            accent={monitor.llmOps?.configured && !monitor.llmOps.ops?.stale ? 'text-emerald-300' : 'text-gray-400'}
          />
          <TopKpi
            label="LLM 快取"
            value={`${Math.round((monitor.optimization?.llm_cache.hit_rate ?? 0) * 100)}%`}
            hint={`trace ${monitor.optimization?.trace.trace_count ?? 0}`}
            accent="text-emerald-300"
          />
          <TopKpi
            label="路由門檻"
            value={
              monitor.optimization?.routing_feedback.adaptive_length_threshold != null
                ? String(monitor.optimization.routing_feedback.adaptive_length_threshold)
                : '—'
            }
            hint="P0 任務-模型匹配"
            accent="text-[#64D2FF]"
          />
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-800 bg-red-900/40 px-4 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-red-200">⚠️ {error}</span>
            <div className="flex shrink-0 gap-2">
              {lastQuery && (
                <button
                  onClick={onRetry}
                  className="rounded-md bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                >
                  重试
                </button>
              )}
              <button
                onClick={onDismissError}
                className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-800/50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          {boardOpen && (
            <div className="anim-theater-dock shrink-0 border-b border-white/[0.06] px-3 py-2">
              <LiveBoard feed={liveFeed} density="dock" />
            </div>
          )}
          <MessageList
            messages={messages}
            sessionId={sessionId}
            loading={loading}
            onOpenTask={onOpenTask}
            onOpenTrace={onOpenTrace}
            onSuggest={onSuggest}
            sending={sending}
            monitor={monitor}
          />
          <InputBar disabled={sending} onSend={onSend} />
          <LiveTicker items={tickerItems} />
        </div>

        {railOpen && (
          <div className="hidden min-h-0 lg:flex">
            <ChatLiveRail monitor={monitor} messages={messages} />
          </div>
        )}
        {railOpen && (
          <div className="fixed inset-y-0 right-0 z-40 flex min-h-0 lg:hidden">
            <button
              type="button"
              aria-label="關閉監控"
              className="flex-1 bg-black/50"
              onClick={() => setRailOpen(false)}
            />
            <ChatLiveRail monitor={monitor} messages={messages} compact />
          </div>
        )}
      </div>
    </div>
  );
}
