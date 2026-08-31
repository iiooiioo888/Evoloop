/**
 * ChatView — 乾淨對話工作台（Apple 風格）。
 * 監控／LiveBoard／KPI 一律放到「監控」視圖，對話頁只保留訊息與輸入。
 */
import type { ChatMessage } from '../types';
import InputBar from './InputBar';
import type { SendOptions } from './InputBar';
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
  const streaming = messages.some((m) => m.streaming);
  const runningTasks = messages.filter(
    (m) => m.taskState?.status === 'running' || m.taskState?.status === 'pending',
  ).length;
  const phase = messages.find((m) => m.streaming)?.streamPhase;
  const busy = sending || streaming || runningTasks > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col apple-canvas">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-6 py-4">
        <span
          className={busy ? 'apple-dot apple-dot--ok' : 'apple-dot'}
          style={
            busy
              ? undefined
              : { background: '#8E8E93', boxShadow: '0 0 0 2px #8E8E9333' }
          }
        />
        <div className="min-w-0">
          <h1 className="apple-heading text-[17px]">EvoLoop</h1>
          <p className="mt-0.5 truncate text-[11px] font-normal text-[#8E8E93]">
            {sending || streaming
              ? phase
                ? `生成中 · ${phase}`
                : '生成中…'
              : runningTasks > 0
                ? `${runningTasks} 任務進行中`
                : '生成 → 評估 → 反思 → 優化'}
          </p>
        </div>
      </header>

      {error && (
        <div className="shrink-0 px-6 pt-4">
          <ErrorState
            kind={error.includes('OPC') || error.includes('護欄') ? 'opc_guard' : 'llm'}
            message={error}
            compact
            onRetry={lastQuery ? onRetry : undefined}
            onDismiss={onDismissError}
          />
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
      />
      <InputBar disabled={sending} onSend={onSend} />
    </div>
  );
}
