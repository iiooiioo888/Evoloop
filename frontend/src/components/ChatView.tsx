/**
 * ChatView — 聊天视图，整合 MessageList + InputBar + 错误横幅。
 */
import type { ChatMessage } from '../types';
import InputBar from './InputBar';
import type { SendOptions } from './InputBar';
import MessageList from './MessageList';

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
  return (
    <>
      {/* 错误横幅 */}
      {error && (
        <div className="border-b border-red-800 bg-red-900/40 px-4 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-red-200">⚠️ {error}</span>
            <div className="flex shrink-0 gap-2">
              {lastQuery && (
                <button
                  onClick={onRetry}
                  className="rounded-md bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                >
                  重试
                </button>
              )}
              <button
                onClick={onDismissError}
                className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-800/50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <MessageList
        messages={messages}
        sessionId={sessionId}
        loading={loading}
        onOpenTask={onOpenTask}
        onOpenTrace={onOpenTrace}
        onSuggest={onSuggest}
      />

      {/* 输入列 */}
      <InputBar
        disabled={sending}
        onSend={onSend}
      />
    </>
  );
}