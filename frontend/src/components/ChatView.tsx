/**
 * ChatView — 乾淨對話工作台。
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
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
