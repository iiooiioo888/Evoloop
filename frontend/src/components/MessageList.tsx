/**
 * 訊息列表：自動捲動；空態僅品牌＋少數快捷建議（無 KPI 牆）。
 */
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
  sessionId: string;
  loading: boolean;
  sending?: boolean;
  onOpenTask?: (messageId: string) => void;
  onOpenTrace?: (taskId: string) => void;
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[13px] text-[#8E8E93]">載入對話…</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-8 py-10 sm:py-16">
            <div>
              <p className="apple-title mb-3">EvoLoop</p>
              <h2 className="apple-heading text-[28px] leading-tight sm:text-[34px]">
                問一件事，
                <br />
                讓閉環幫你優化到達標。
              </h2>
              <p className="mt-4 max-w-md text-[15px] font-normal leading-relaxed text-[#8E8E93]">
                簡單任務一次生成；複雜任務自動走公司運行時；工業任務注入 OPC 感知。
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => onSuggest?.(s.text, s.company)}
                  className="apple-card apple-card--tight apple-card--pad text-left transition-colors hover:border-white/15"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#636366]">
                    {s.company ? '公司運行時' : '統一模式'}
                  </p>
                  <p className="mt-2 text-[13px] font-normal leading-snug text-[#F5F5F7]">{s.text}</p>
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
