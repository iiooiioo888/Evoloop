/** 單則訊息：無框助手回覆 + 精簡任務卡。 */
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

  const hasActions = !isUser && !message.streaming && (message.content || message.taskState);

  return (
    <div className={`group flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      {message.taskState && (
        <div className="w-full max-w-[min(100%,640px)]">
          <TaskPanel
            task={message.taskState}
            onOpenFull={onOpenTask}
            onCancel={(taskId) => void handleCancelTask(taskId)}
            onResume={(taskId) => void handleResumeTask(taskId)}
            onOpenTrace={onOpenTrace}
          />
          {cancelError && (
            <div className="mt-2">
              <ErrorState kind="generic" message={cancelError} compact />
            </div>
          )}
        </div>
      )}

      {(message.content || (message.streaming && !message.taskState)) && (
        <div className={`max-w-[min(92%,640px)] min-w-0 ${isUser ? '' : 'w-full'}`}>
          {isUser ? (
            <div className="evo-msg-user whitespace-pre-wrap">{message.content}</div>
          ) : message.content ? (
            <div className="evo-msg-assistant markdown-body">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : (
            message.streaming && (
              <div className="flex items-center gap-2 py-1 text-[13px] text-[#636366]">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#636366]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#636366] [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#636366] [animation-delay:240ms]" />
                </span>
              </div>
            )
          )}
        </div>
      )}

      {hasActions && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11px] text-[#48484A] opacity-70 transition-opacity group-hover:opacity-100">
          <span>{formatTime(message.timestamp)}</span>
          {message.meta?.score != null && (
            <span className="text-[#30D158]">{message.meta.score.toFixed(1)}</span>
          )}
          {!!message.meta?.iteration && <span>{message.meta.iteration} 輪</span>}
          {message.meta?.multiDim && (
            <button
              type="button"
              onClick={() => setShowRadar((v) => !v)}
              className="hover:text-[#F5F5F7]"
            >
              {showRadar ? '收起評分' : '評分'}
            </button>
          )}
          <button type="button" onClick={() => void handleCopy()} className="hover:text-[#F5F5F7]">
            {copied ? '已複製' : '複製'}
          </button>
          <button
            type="button"
            onClick={() => void handleFeedback(2)}
            disabled={!!feedbackSent}
            className={`disabled:opacity-30 ${feedbackSent === 2 ? 'text-[#30D158]' : 'hover:text-[#F5F5F7]'}`}
          >
            讚
          </button>
          <button
            type="button"
            onClick={() => void handleFeedback(1)}
            disabled={!!feedbackSent}
            className={`disabled:opacity-30 ${feedbackSent === 1 ? 'text-[#FF453A]' : 'hover:text-[#F5F5F7]'}`}
          >
            差
          </button>
        </div>
      )}

      {isUser && (
        <span className="px-0.5 text-[10px] text-[#48484A] opacity-0 transition-opacity group-hover:opacity-70">
          {formatTime(message.timestamp)}
        </span>
      )}

      {showRadar && message.meta?.multiDim && !message.streaming && (
        <div className="w-full max-w-xs">
          <ReflectionRadar multiDim={message.meta.multiDim} height={130} />
        </div>
      )}
    </div>
  );
}
