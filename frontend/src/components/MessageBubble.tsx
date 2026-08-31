/** 單則訊息氣泡：任務面板、Markdown、評分、回饋（Apple 語彙）。 */
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../types';
import { cancelTask, resumeTask, sendFeedback } from '../api/client';
import { ReflectionRadar } from './ReflectionCharts';
import TaskPanel from './TaskPanel';
import ErrorState from './ui/ErrorState';

interface MessageBubbleProps {
  message: ChatMessage;
  sessionId: string;
  onOpenTask?: () => void;
  onOpenTrace?: (taskId: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageBubble({
  message,
  sessionId,
  onOpenTask,
  onOpenTrace,
}: MessageBubbleProps) {
  const [feedbackSent, setFeedbackSent] = useState<1 | 2 | undefined>(message.feedback);
  const [showThanks, setShowThanks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const isUser = message.role === 'user';

  const handleCancelTask = async (taskId: string) => {
    setCancelError(null);
    try {
      await cancelTask(taskId);
    } catch (err) {
      setCancelError((err as Error).message);
      setTimeout(() => setCancelError(null), 3000);
    }
  };

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
      // ignore
    }
  };

  return (
    <div className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          isUser
            ? 'bg-[#007AFF] text-white'
            : 'bg-white/[0.08] text-[#AEAEB2] ring-1 ring-white/[0.08]'
        }`}
      >
        {isUser ? '你' : 'E'}
      </div>

      <div
        className={`flex max-w-[92%] min-w-0 flex-col gap-2 lg:max-w-[88%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-[14px] font-normal leading-relaxed break-words ${
            isUser
              ? 'rounded-br-md bg-[#007AFF] whitespace-pre-wrap text-white'
              : 'rounded-bl-md bg-white/[0.06] text-[#F5F5F7] ring-1 ring-white/[0.08]'
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
            <div className="mt-2">
              <ErrorState kind="generic" message={cancelError} compact />
            </div>
          )}
          {message.content ? (
            isUser ? (
              message.content
            ) : (
              <div className="markdown-body">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )
          ) : (
            message.streaming &&
            !message.taskState && (
              <span className="inline-flex items-center gap-2 text-[#8E8E93]">
                <span className="apple-dot apple-dot--info" />
                建立任務中…
              </span>
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-[#636366]">
          <span className="apple-data">{formatTime(message.timestamp)}</span>
          {message.executionStrategy === 'company' && (
            <span className="rounded-full bg-[#007AFF]/12 px-2 py-0.5 font-bold text-[#64D2FF]">
              公司運行時
            </span>
          )}
          {message.meta?.score != null && (
            <span className="rounded-full bg-[#34C759]/12 px-2 py-0.5 font-bold text-[#34C759]">
              {message.meta.score.toFixed(1)}
            </span>
          )}
          {!!message.meta?.iteration && (
            <span className="apple-data text-[#8E8E93]">iter {message.meta.iteration}</span>
          )}
          {message.meta?.multiDim && !message.streaming && (
            <button
              type="button"
              onClick={() => setShowRadar((v) => !v)}
              className="rounded-full bg-white/[0.06] px-2 py-0.5 font-bold text-[#AEAEB2] hover:text-[#F5F5F7]"
            >
              {showRadar ? '隱藏雷達' : '四維評分'}
            </button>
          )}
        </div>

        {showRadar && message.meta?.multiDim && !message.streaming && (
          <div className="mt-1 w-full max-w-sm">
            <ReflectionRadar multiDim={message.meta.multiDim} height={180} />
          </div>
        )}

        {!isUser && !message.streaming && (message.content || message.taskState) && (
          <div className="flex items-center gap-1 px-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-lg px-2 py-1 text-[11px] text-[#8E8E93] hover:bg-white/[0.06] hover:text-[#F5F5F7]"
            >
              {copied ? '已複製' : '複製'}
            </button>
            <button
              type="button"
              onClick={() => void handleFeedback(2)}
              disabled={!!feedbackSent}
              className={`rounded-lg px-2 py-1 text-[11px] ${
                feedbackSent === 2
                  ? 'text-[#34C759]'
                  : 'text-[#8E8E93] hover:bg-white/[0.06] hover:text-[#F5F5F7] disabled:opacity-30'
              }`}
              aria-label="滿意"
            >
              讚
            </button>
            <button
              type="button"
              onClick={() => void handleFeedback(1)}
              disabled={!!feedbackSent}
              className={`rounded-lg px-2 py-1 text-[11px] ${
                feedbackSent === 1
                  ? 'text-[#FF3B30]'
                  : 'text-[#8E8E93] hover:bg-white/[0.06] hover:text-[#F5F5F7] disabled:opacity-30'
              }`}
              aria-label="不滿意"
            >
              差
            </button>
            {showThanks && <span className="text-[11px] text-[#34C759]">感謝回饋</span>}
          </div>
        )}
      </div>
    </div>
  );
}
