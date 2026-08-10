/** 訊息列表：渲染所有訊息，新訊息自動捲動至底部；空態顯示快捷建議。 */
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  sessionId: string;
  loading: boolean;
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

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            {/* Hero */}
            <div className="relative mb-5">
              <div className="absolute inset-0 animate-pulse rounded-3xl bg-gradient-to-br from-blue-500/30 to-indigo-600/30 blur-xl" />
              <div className="relative flex h-18 w-18 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500/20 via-indigo-500/20 to-purple-600/20 p-4 text-4xl shadow-2xl ring-1 ring-blue-400/30 backdrop-blur-sm">
                🔄
              </div>
            </div>
            <h1 className="bg-gradient-to-r from-blue-300 via-indigo-300 to-purple-300 bg-clip-text text-2xl font-bold text-transparent">
              EvoLoop 自我反思助手
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              生成 → 評估 → 反思 → 優化的閉環，複雜目標可交給多代理人公司團隊分工完成
            </p>

            {/* 快捷建議 */}
            <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSuggest?.(s.text, s.company)}
                  className={`group relative overflow-hidden rounded-xl border px-4 py-3.5 text-left text-xs text-gray-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    s.company
                      ? 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/50 hover:bg-purple-500/10 hover:shadow-purple-900/20'
                      : 'border-blue-500/20 bg-blue-500/5 hover:border-blue-500/50 hover:bg-blue-500/10 hover:shadow-blue-900/20'
                  }`}
                >
                  <span
                    className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-medium ${
                      s.company
                        ? 'text-purple-400/80 group-hover:text-purple-300'
                        : 'text-blue-400/80 group-hover:text-blue-300'
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
