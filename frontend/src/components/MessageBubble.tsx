/** 單則訊息氣泡：任務面板、Markdown 渲染、複製按鈕、評分/模式徽章、回饋。 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../types';
import { cancelTask, resumeTask, sendFeedback } from '../api/client';
import TaskPanel from './TaskPanel';

interface MessageBubbleProps {
  message: ChatMessage;
  sessionId: string;
  /** 開啟整頁任務視圖 */
  onOpenTask?: () => void;
  /** 打開執行軌跡視圖 */
  onOpenTrace?: (taskId: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageBubble({ message, sessionId, onOpenTask, onOpenTrace }: MessageBubbleProps) {
  const [feedbackSent, setFeedbackSent] = useState<1 | 2 | undefined>(message.feedback);
  const [showThanks, setShowThanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const isUser = message.role === 'user';

  /** 取消任務（盡力而為，後續狀態由 WebSocket/輪詢推送更新） */
  const handleCancelTask = async (taskId: string) => {
    setCancelError(null);
    try {
      await cancelTask(taskId);
    } catch (err) {
      setCancelError((err as Error).message);
      setTimeout(() => setCancelError(null), 3000);
    }
  };

  /** 斷點續跑（盡力而為，後續狀態由 WebSocket/輪詢推送更新） */
  const handleResumeTask = async (taskId: string) => {
    setCancelError(null);
    try {
      await resumeTask(taskId);
    } catch (err) {
      setCancelError((err as Error).message);
      setTimeout(() => setCancelError(null), 3000);
    }
  };

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
    <div className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 頭像 */}
      <div
        className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-lg transition-transform duration-200 group-hover:scale-105 ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 ring-1 ring-blue-400/30'
            : 'bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 ring-1 ring-gray-600/50'
        }`}
      >
        {isUser ? '👤' : '🔄'}
      </div>

      <div className={`flex max-w-[92%] min-w-0 flex-col gap-1.5 lg:max-w-[88%] xl:max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed break-words transition-shadow duration-200 ${
            isUser
              ? 'rounded-br-md bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 whitespace-pre-wrap text-white shadow-lg shadow-blue-900/20 ring-1 ring-blue-500/20'
              : 'rounded-bl-md bg-gray-800/80 text-gray-100 shadow-lg shadow-black/10 ring-1 ring-gray-700/40 backdrop-blur-sm hover:ring-gray-600/50'
          }`}
        >
          {message.taskState && (
            <TaskPanel
              task={message.taskState}
              onOpenFull={onOpenTask}
              onCancel={(taskId) => void handleCancelTask(taskId)}
              onResume={(taskId) => void handleResumeTask(taskId)}
              onOpenTrace={onOpenTrace}
            />
          )}
          {cancelError && (
            <p className="mt-1 text-xs text-red-300">⚠️ {cancelError}</p>
          )}
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
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-gray-500">
          <span className="tabular-nums text-[11px] text-gray-600">{formatTime(message.timestamp)}</span>
          {message.executionStrategy === 'company' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300 ring-1 ring-purple-500/25">
              🏢 公司運行時
            </span>
          )}
          {message.meta?.score != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/25">
              ⭐ 評分 {message.meta.score.toFixed(1)}
            </span>
          )}
          {!!message.meta?.iteration && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-sky-500/25">
              🔁 迭代 {message.meta.iteration}
            </span>
          )}
          {message.meta?.multiDim && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-amber-500/25">
              📊 準確{message.meta.multiDim.accuracy.score.toFixed(1)} 完整{message.meta.multiDim.completeness.score.toFixed(1)} 清晰{message.meta.multiDim.clarity.score.toFixed(1)} 相關{message.meta.multiDim.relevance.score.toFixed(1)}
            </span>
          )}
        </div>

        {/* 操作列：AI 訊息且非生成中 */}
        {!isUser && !message.streaming && (message.content || message.taskState) && (
          <div className="flex items-center gap-0.5 px-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 transition-all hover:bg-gray-700/60 hover:text-gray-200"
            >
              {copied ? '✓ 已複製' : '📋 複製'}
            </button>
            <button
              onClick={() => void handleFeedback(2)}
              disabled={!!feedbackSent}
              className={`rounded-lg px-2 py-1 text-sm transition-all ${
                feedbackSent === 2
                  ? 'bg-green-600/20 ring-1 ring-green-500/50'
                  : 'hover:bg-gray-700/60 disabled:opacity-30'
              }`}
              aria-label="滿意"
            >
              👍
            </button>
            <button
              onClick={() => void handleFeedback(1)}
              disabled={!!feedbackSent}
              className={`rounded-lg px-2 py-1 text-sm transition-all ${
                feedbackSent === 1
                  ? 'bg-red-600/20 ring-1 ring-red-500/50'
                  : 'hover:bg-gray-700/60 disabled:opacity-30'
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
