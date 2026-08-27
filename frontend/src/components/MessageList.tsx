/** 訊息列表：渲染所有訊息，新訊息自動捲動至底部；空態顯示快捷建議。 */
import { useEffect, useRef } from 'react';
import { fmtUsd } from '../lib/agentUi';
import type { ChatLiveMonitorState } from '../hooks/useChatLiveMonitor';
import type { ChatMessage } from '../types';
import { MiniKpi } from './ChatMonitorCards';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  sessionId: string;
  loading: boolean;
  sending?: boolean;
  monitor?: ChatLiveMonitorState;
  /** 開啟整頁任務視圖 */
  onOpenTask?: (messageId: string) => void;
  /** 打開執行軌跡視圖 */
  onOpenTrace?: (taskId: string) => void;
  /** 點擊快捷建議 */
  onSuggest?: (text: string, companyMode: boolean) => void;
}

const SUGGESTIONS: { text: string; company: boolean }[] = [
  { text: '用三句話介紹 EvoLoop 反思迴圈的原理', company: false },
  { text: '幫我寫一份本週工作報告大綱', company: true },
  { text: '分析 React 與 Vue 的優劣並給出選型建議', company: false },
  { text: '用一首五言絕句描寫秋天', company: true },
];

export default function MessageList({
  messages,
  sessionId,
  loading,
  sending,
  monitor,
  onOpenTask,
  onOpenTrace,
  onSuggest,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 訊息變化時自動滾動至最新訊息
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
          載入對話歷史中…
        </div>
      </div>
    );
  }

  const summary = monitor?.agents?.summary;
  const streaming = messages.some((m) => m.streaming);
  const activeTasks = messages.filter(
    (m) => m.taskState?.status === 'running' || m.taskState?.status === 'pending',
  ).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 lg:px-5">
      <div className="flex w-full flex-col gap-4">
        {messages.length > 0 && monitor && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            <MiniKpi
              label="本對話"
              value={String(messages.length)}
              hint={sending || streaming ? '生成中' : '則訊息'}
              accent={streaming ? 'green' : undefined}
            />
            <MiniKpi label="進行任務" value={String(activeTasks)} hint="公司／OPC" accent="blue" />
            <MiniKpi
              label="Agent 忙碌"
              value={String(summary?.roles_busy ?? 0)}
              hint={`等待 ${summary?.roles_waiting ?? 0}`}
              accent="green"
            />
            <MiniKpi
              label="API 花費"
              value={fmtUsd(summary?.total_api_cost_usd ?? 0)}
              hint="本輪詢"
              accent="violet"
            />
            <MiniKpi
              label="雲資源"
              value={fmtUsd((summary?.total_docker_cost_usd ?? 0) + (summary?.total_aliyun_cost_usd ?? 0))}
              hint="Docker＋阿里雲"
              accent="orange"
            />
            <MiniKpi
              label="OPC"
              value={monitor.opc?.live?.reachable ? '連線' : '—'}
              hint={monitor.opc?.guard?.sim_enabled ? '模擬' : '工業'}
              accent="cyan"
            />
          </div>
        )}

        {messages.length === 0 && (
          <div className="mt-2 flex flex-col">
            <div className="mb-6 rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900/90 via-gray-900/60 to-blue-950/20 px-5 py-8 text-center sm:px-8 lg:py-10">
              <div className="relative mx-auto mb-4 inline-flex">
                <div className="absolute inset-0 animate-pulse rounded-3xl bg-gradient-to-br from-blue-500/25 to-cyan-600/20 blur-xl" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 via-sky-500/15 to-cyan-600/20 text-3xl ring-1 ring-blue-400/25">
                  🔄
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-100 sm:text-3xl">
                EvoLoop 對話工作台
              </h1>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
                生成 → 評估 → 反思 → 優化。上方劇場由真實 phase／Agent 狀態驅動（手動切場景）；右側即時監控 Agent、API／雲預算與事件流。
              </p>
              <div className="mx-auto mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  ['反思閉環', '品質達標再交付'],
                  ['公司運行時', '多角色並行'],
                  ['OPC 整合', '工業感知決策'],
                  ['預算護欄', 'API＋雲資源'],
                  ['阿里雲 BSS', '雲帳單接入'],
                  ['即時監控', '右側 5s 輪詢'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-gray-800/80 bg-gray-950/50 px-3 py-2.5 text-left">
                    <p className="text-[12px] font-medium text-gray-200">{t}</p>
                    <p className="mt-0.5 text-[10px] text-gray-500">{d}</p>
                  </div>
                ))}
              </div>
            </div>

            {monitor && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                <MiniKpi label="角色" value={String(summary?.roles_total ?? 0)} hint="Agent 席位" accent="violet" />
                <MiniKpi label="忙碌" value={String(summary?.roles_busy ?? 0)} hint="執行中" accent="green" />
                <MiniKpi label="API" value={fmtUsd(summary?.total_api_cost_usd ?? 0)} accent="violet" />
                <MiniKpi label="阿里雲" value={fmtUsd(summary?.total_aliyun_cost_usd ?? 0)} accent="orange" />
                <MiniKpi label="記憶庫" value={String(monitor.memoryCount)} hint="向量" accent="cyan" />
                <MiniKpi
                  label="LLM"
                  value={monitor.llmOps?.configured ? 'OK' : '—'}
                  hint={monitor.llmOps?.model?.split('/').pop() ?? '未配置'}
                  accent={monitor.llmOps?.configured ? 'green' : undefined}
                />
              </div>
            )}

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">快捷開始</p>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSuggest?.(s.text, s.company)}
                  className={`group relative overflow-hidden rounded-xl border px-4 py-3.5 text-left text-xs text-gray-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    s.company
                      ? 'border-violet-500/20 bg-violet-500/5 hover:border-violet-500/45 hover:bg-violet-500/10'
                      : 'border-sky-500/20 bg-sky-500/5 hover:border-sky-500/45 hover:bg-sky-500/10'
                  }`}
                >
                  <span
                    className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-medium ${
                      s.company
                        ? 'text-violet-400/80 group-hover:text-violet-300'
                        : 'text-sky-400/80 group-hover:text-sky-300'
                    }`}
                  >
                    {s.company ? '🏢 公司模式' : '⚙️ 標準模式'}
                  </span>
                  <span className="leading-relaxed">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            sessionId={sessionId}
            onOpenTask={msg.taskState ? () => onOpenTask?.(msg.id) : undefined}
            onOpenTrace={onOpenTrace}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
