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
import ErrorState from './ui/ErrorState';

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
  const [railOpen, setRailOpen] = useState(false);
  /** LiveBoard 與訊息同欄停靠；預設收合，有活動再展開 */
  const [boardOpen, setBoardOpen] = useState(false);

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
    <div className="flex min-h-0 flex-1 flex-col apple-canvas">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span
              className={liveFeed.live || streaming || sending ? 'apple-dot apple-dot--ok' : 'apple-dot'}
              style={
                liveFeed.live || streaming || sending
                  ? undefined
                  : { background: '#8E8E93', boxShadow: '0 0 0 2px #8E8E9333' }
              }
            />
            <div>
              <p className="apple-heading text-[15px]">對話</p>
              <p className="mt-0.5 text-[10px] text-[#636366]">
                {sending || streaming
                  ? '生成中'
                  : runningTasks > 0
                    ? `${runningTasks} 任務進行中`
                    : liveFeed.live
                      ? 'LIVE'
                      : '待命'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBoardOpen((v) => !v)}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-bold text-[#AEAEB2] hover:text-[#F5F5F7]"
            >
              {boardOpen ? '收合動態' : '展開動態'}
            </button>
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-bold text-[#AEAEB2] hover:text-[#F5F5F7]"
            >
              {railOpen ? '隱藏側欄' : '監控側欄'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TopKpi label="訊息" value={String(messages.length)} hint={`任務 ${taskMsgs}`} />
          <TopKpi
            label="忙碌"
            value={String(s?.roles_busy ?? 0)}
            hint={`等待 ${s?.roles_waiting ?? 0}`}
            accent="text-[#34C759]"
            pulse={(s?.roles_busy ?? 0) > 0}
          />
          <TopKpi
            label="費用"
            value={fmtUsd(s?.total_cost_usd ?? 0)}
            hint="API＋雲"
            accent="text-[#007AFF]"
          />
          <TopKpi
            label="告警"
            value={String(s?.alerts_open ?? 0)}
            accent={(s?.alerts_open ?? 0) > 0 ? 'text-[#FF9500]' : 'text-[#F5F5F7]'}
          />
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-4 py-2">
          <ErrorState
            kind={error.includes('OPC') || error.includes('護欄') ? 'opc_guard' : 'llm'}
            message={error}
            compact
            onRetry={lastQuery ? onRetry : undefined}
            onDismiss={onDismissError}
          />
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
          {(tickerItems.length > 0 || streaming || sending) && <LiveTicker items={tickerItems} />}
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
