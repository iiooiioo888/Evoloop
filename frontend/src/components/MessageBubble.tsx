/** 單則訊息氣泡：任務面板、Markdown 渲染、複製按鈕、評分/模式徽章、回饋。 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../types';
import { sendFeedback } from '../api/client';
import TaskPanel from './TaskPanel';

interface MessageBubbleProps {
  message: ChatMessage;
  sessionId: string;
  /** 開啟整頁任務視圖 */
  onOpenTask?: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageBubble({ message, sessionId, onOpenTask }: MessageBubbleProps) {
  const [feedbackSent, setFeedbackSent] = useState<1 | 2 | undefined>(message.feedback);
  const [showThanks, setShowThanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleFeedback = async (rating: 1 | 2) => {
    if (feedbackSent || message.streaming) return;
    await sendFeedback(sessionId, rating);
    setFeedbackSent(rating);
    setShowThanks(true);
    setTimeout(() => setShowThanks(false), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪貼簿不可用時靜默忽略
    }
  };

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 頭像 */}
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm shadow-md ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
            : 'bg-gradient-to-br from-gray-700 to-gray-800 ring-1 ring-gray-600'
        }`}
      >
        {isUser ? '👤' : '🔄'}
      </div>

      <div className={`flex max-w-[82%] min-w-0 flex-col gap-1 sm:max-w-[72%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm ${
            isUser
              ? 'rounded-br-sm bg-gradient-to-br from-blue-600 to-indigo-600 whitespace-pre-wrap text-white'
              : 'rounded-bl-sm bg-gray-800/90 text-gray-100 ring-1 ring-gray-700/50'
          }`}
        >
          {message.taskState && <TaskPanel task={message.taskState} onOpenFull={onOpenTask} />}
          {message.content ? (
            isUser ? (
              message.content
            ) : (
              /* AI 回答以 Markdown 渲染 */
              <div className="markdown-body">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )
          ) : (
            message.streaming &&
            !message.taskState && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                建立任務中…
              </span>
            )
          )}
        </div>

        {/* 時間 + 徽章列 */}
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-gray-500">
          <span>{formatTime(message.timestamp)}</span>
          {message.companyMode && (
            <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[11px] text-purple-300 ring-1 ring-purple-500/30">
              🏢 公司模式
            </span>
          )}
          {message.meta?.score != null && (
            <span className="rounded-full bg-gray-700/40 px-2 py-0.5 text-[11px] text-gray-300">
              評分 {message.meta.score}
            </span>
          )}
          {!!message.meta?.iteration && (
            <span className="rounded-full bg-gray-700/40 px-2 py-0.5 text-[11px] text-gray-300">
              迭代 {message.meta.iteration}
            </span>
          )}
        </div>

        {/* 操作列：AI 訊息且非生成中 */}
        {!isUser && !message.streaming && (message.content || message.taskState) && (
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={handleCopy}
              className="rounded-md px-1.5 py-0.5 text-xs text-gray-400 opacity-60 transition-colors hover:bg-gray-700 hover:opacity-100"
            >
              {copied ? '✓ 已複製' : '📋 複製'}
            </button>
            <button
              onClick={() => void handleFeedback(2)}
              disabled={!!feedbackSent}
              className={`rounded-md px-1.5 py-0.5 text-sm transition-colors ${
                feedbackSent === 2
                  ? 'bg-green-600/20 ring-1 ring-green-500/50'
                  : 'opacity-60 hover:bg-gray-700 hover:opacity-100 disabled:opacity-30'
              }`}
              aria-label="滿意"
            >
              👍
            </button>
            <button
              onClick={() => void handleFeedback(1)}
              disabled={!!feedbackSent}
              className={`rounded-md px-1.5 py-0.5 text-sm transition-colors ${
                feedbackSent === 1
                  ? 'bg-red-600/20 ring-1 ring-red-500/50'
                  : 'opacity-60 hover:bg-gray-700 hover:opacity-100 disabled:opacity-30'
              }`}
              aria-label="不滿意"
            >
              👎
            </button>
            {showThanks && (
              <span className="animate-pulse text-xs text-green-400">感謝您的回饋！</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
