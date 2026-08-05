/**
 * EvoLoop 聊天主視窗。
 *
 * 功能：
 * - 多會話管理（側邊欄 + localStorage 持久化）
 * - 公司模式（多代理人組織模板）
 * - Markdown 渲染、複製、回饋、錯誤重試
 * - 響應式：手機版側邊欄可收合
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InputBar from './components/InputBar';
import type { SendOptions } from './components/InputBar';
import MessageList from './components/MessageList';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import TaskPage from './components/TaskPage';
import { createTask, fetchConfig, fetchTask } from './api/client';
import {
  loadActiveSessionId,
  loadSessions,
  newSessionId,
  saveActiveSessionId,
  saveSessions,
} from './lib/storage';
import type { ChatMessage, ChatSession } from './types';

function createSession(): ChatSession {
  const now = Date.now();
  return {
    id: newSessionId(),
    title: '',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions();
    return loaded.length > 0 ? loaded : [createSession()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = loadActiveSessionId();
    const loaded = loadSessions();
    if (saved && loaded.some((s) => s.id === saved)) return saved;
    return loaded[0]?.id ?? '';
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  // 整頁任務視圖：目前打開的訊息 ID（存 sessionStorage，重新整理後可恢復）
  const [openTaskMsgId, setOpenTaskMsgIdState] = useState<string | null>(
    () => sessionStorage.getItem('evoloop_open_task'),
  );
  const setOpenTaskMsgId = useCallback((id: string | null) => {
    setOpenTaskMsgIdState(id);
    if (id) sessionStorage.setItem('evoloop_open_task', id);
    else sessionStorage.removeItem('evoloop_open_task');
  }, []);

  // 檢查 LLM 配置狀態
  const refreshConfigStatus = useCallback(() => {
    fetchConfig()
      .then((cfg) => setLlmConfigured(cfg.configured))
      .catch(() => setLlmConfigured(null));
  }, []);

  useEffect(() => {
    refreshConfigStatus();
  }, [refreshConfigStatus]);

  // 初次載入時若無有效 activeId，使用第一個會話
  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  // 持久化（2 秒防抖：輪詢期間避免每 1.5s 全量序列化寫 localStorage）
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  useEffect(() => {
    const timer = setTimeout(() => saveSessions(sessionsRef.current), 2000);
    return () => clearTimeout(timer);
  }, [sessions]);
  // 關閉頁面 / 元件卸載時 flush 一次
  useEffect(() => {
    const flush = () => saveSessions(sessionsRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);
  useEffect(() => {
    if (activeId) saveActiveSessionId(activeId);
  }, [activeId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0],
    [sessions, activeId],
  );

  const updateSession = useCallback(
    (id: string, updater: (s: ChatSession) => ChatSession) => {
      setSessions((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
    },
    [],
  );

  const handleNewSession = useCallback(() => {
    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
    setError(null);
    setSidebarOpen(false);
    setOpenTaskMsgId(null);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
    setSidebarOpen(false);
    setOpenTaskMsgId(null);
  }, []);

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (id === activeId) {
          const next = remaining.length > 0 ? remaining[0] : createSession();
          if (remaining.length === 0) remaining.push(next);
          setActiveId(next.id);
        }
        return remaining;
      });
    },
    [activeId],
  );

  const sendQuery = useCallback(
    async (query: string, options: SendOptions) => {
      if (!activeSession) return;
      const sessionId = activeSession.id;
      setError(null);
      setLastQuery(query);
      setSending(true);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: query,
        timestamp: Date.now(),
        companyMode: options.companyMode,
      };
      const assistantId = crypto.randomUUID();
      const placeholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
        companyMode: options.companyMode,
      };

      updateSession(sessionId, (s) => ({
        ...s,
        // 首則使用者訊息作為會話標題
        title: s.title || query.slice(0, 40),
        updatedAt: Date.now(),
        messages: [...s.messages, userMsg, placeholder],
      }));

      try {
        // 建立後台任務
        const { task_id } = await createTask(
          query,
          options.companyMode,
          options.companyTemplate,
        );
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, taskId: task_id } : m,
          ),
        }));
        // 公司任務自動開啟整頁任務視圖
        if (options.companyMode) {
          setOpenTaskMsgId(assistantId);
        }
        // 任務執行期間不鎖住輸入框（可繼續提問）
        setSending(false);

        // 輪詢任務進度直到完成
        while (true) {
          await new Promise((r) => setTimeout(r, 1500));
          let progress;
          try {
            progress = await fetchTask(task_id);
          } catch {
            continue; // 單次輪詢失敗不中斷
          }
          updateSession(sessionId, (s) => ({
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, taskState: progress } : m,
            ),
          }));

          if (progress.status === 'completed') {
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: progress.answer || '（未取得回答）',
                      streaming: false,
                      meta: { score: progress.score, iteration: progress.iteration },
                    }
                  : m,
              ),
            }));
            break;
          }
          if (progress.status === 'failed') {
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            }));
            setError(progress.error || '任務執行失敗');
            break;
          }
        }
      } catch (err) {
        setError((err as Error).message);
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.filter((m) => m.id !== assistantId),
        }));
        setSending(false);
      }
    },
    [activeSession, updateSession],
  );

  const handleRetry = useCallback(() => {
    if (lastQuery) void sendQuery(lastQuery, { companyMode: false, companyTemplate: 'quick_task' });
  }, [lastQuery, sendQuery]);

  // ── 整頁任務視圖 ──
  const openTaskMessage = openTaskMsgId
    ? activeSession?.messages.find((m) => m.id === openTaskMsgId)
    : undefined;

  if (openTaskMessage?.taskState) {
    return (
      <TaskPage
        task={openTaskMessage.taskState}
        onBack={() => setOpenTaskMsgId(null)}
      />
    );
  }

  return (
    <div className="flex h-dvh bg-gray-950 text-gray-100">
      {/* 側邊欄 */}
      <Sidebar
        sessions={sessions}
        activeId={activeSession?.id ?? ''}
        open={sidebarOpen}
        onSelect={handleSelectSession}
        onNew={handleNewSession}
        onDelete={handleDeleteSession}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 主區域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 標題列 */}
        <header className="flex items-center border-b border-gray-800 px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-800 md:hidden"
              aria-label="開啟側邊欄"
            >
              ☰
            </button>
            <span className="text-xl">🔄</span>
            <h1 className="text-base font-semibold">EvoLoop 助手</h1>
            <span className="hidden text-xs text-gray-500 sm:inline">
              反思閉環 · 多代理人公司模式
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* LLM 配置狀態指示 */}
              <span
                className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] sm:flex ${
                  llmConfigured === null
                    ? 'bg-gray-700/40 text-gray-400'
                    : llmConfigured
                      ? 'bg-green-500/15 text-green-300'
                      : 'bg-yellow-500/15 text-yellow-300'
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    llmConfigured === null
                      ? 'bg-gray-400'
                      : llmConfigured
                        ? 'bg-green-400'
                        : 'bg-yellow-400'
                  }`}
                />
                {llmConfigured === null
                  ? '配置未知'
                  : llmConfigured
                    ? 'API 已配置'
                    : '未配置 API'}
              </span>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-blue-500 hover:bg-gray-800"
                title="LLM API 設定"
              >
                🔑 API 設定
              </button>
            </div>
          </div>
        </header>

        {/* 錯誤橫幅 */}
        {error && (
          <div className="border-b border-red-800 bg-red-900/40 px-4 py-2">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 text-sm">
              <span className="text-red-200">⚠️ {error}</span>
              <div className="flex shrink-0 gap-2">
                {lastQuery && (
                  <button
                    onClick={handleRetry}
                    className="rounded-md bg-red-700 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                  >
                    重試
                  </button>
                )}
                <button
                  onClick={() => setError(null)}
                  className="rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-800/50"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 訊息列表 */}
        <MessageList
          messages={activeSession?.messages ?? []}
          sessionId={activeSession?.id ?? ''}
          loading={false}
          onOpenTask={(messageId) => setOpenTaskMsgId(messageId)}
          onSuggest={(text, company) =>
            void sendQuery(text, { companyMode: company, companyTemplate: 'quick_task' })
          }
        />

        {/* 輸入列 */}
        <InputBar
          disabled={sending}
          onSend={(text, options) => void sendQuery(text, options)}
        />
      </div>

      {/* LLM 設定彈窗 */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshConfigStatus}
      />
    </div>
  );
}
