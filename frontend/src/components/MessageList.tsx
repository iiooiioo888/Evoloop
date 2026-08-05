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
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {messages.length === 0 && (
          <div className="mt-14 flex flex-col items-center text-center">
            {/* Hero */}
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 text-3xl ring-1 ring-blue-500/30">
              🔄
            </div>
            <p className="text-xl font-semibold text-gray-100">EvoLoop 自我反思助手</p>
            <p className="mt-1.5 max-w-md text-sm text-gray-500">
              生成 → 評估 → 反思 → 優化的閉環，複雜目標可交給多代理人公司團隊分工完成
            </p>

            {/* 快捷建議 */}
            <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => onSuggest?.(s.text, s.company)}
                  className="group rounded-xl border border-gray-800 bg-gray-900/60 px-3.5 py-3 text-left text-xs text-gray-300 transition-all hover:border-blue-500/60 hover:bg-gray-800/80 hover:text-gray-100"
                >
                  <span className="mb-1 flex items-center gap-1.5 text-[11px] text-gray-500 group-hover:text-blue-300">
                    {s.company ? '🏢 公司模式' : '⚙️ 標準模式'}
                  </span>
                  {s.text}
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
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
