/**
 * EvoLoop 主应用 — IDE 风格单页布局。
 *
 * 使用 AppShell 作为根布局，整合会话管理、聊天视图、
 * 控制面版视图、OPC 右侧诊断面板。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatMessage, ChatSession, TaskProgress } from './types';
import { createTask, fetchConfig, fetchTask } from './api/client';
import {
  loadActiveSessionId,
  loadSessions,
  newSessionId,
  saveActiveSessionId,
  saveSessions,
} from './lib/storage';
import AppShell from './components/AppShell';
import type { ViewKey } from './components/AppShell';
import ChatView from './components/ChatView';
import type { SendOptions } from './components/InputBar';
import DashboardView from './components/DashboardView';
import SettingsModal from './components/SettingsModal';

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
  // ── 会话管理 ──
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

  // ── 发送状态 ──
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  // ── IDE 布局状态 ──
  const [activeView, setActiveView] = useState<ViewKey>('chat');
  const [rightPanelTask, setRightPanelTask] = useState<TaskProgress | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── LLM 配置 ──
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  const refreshConfigStatus = useCallback(() => {
    fetchConfig()
      .then((cfg) => setLlmConfigured(cfg.configured))
      .catch(() => setLlmConfigured(null));
  }, []);

  useEffect(() => {
    refreshConfigStatus();
  }, [refreshConfigStatus]);

  // 初次加载时若无有效 activeId，使用第一个会话
  useEffect(() => {
    if (!activeId && sessions.length > 0) {
      setActiveId(sessions[0].id);
    }
  }, [activeId, sessions]);

  // 持久化
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);
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
    setRightPanelTask(null);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
    setRightPanelTask(null);
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

  // ── 发送消息 ──
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
        title: s.title || query.slice(0, 40),
        updatedAt: Date.now(),
        messages: [...s.messages, userMsg, placeholder],
      }));

      try {
        const { task_id } = await createTask(
          query,
          options.companyMode,
          options.companyTemplate,
          options.opcMode,
        );
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, taskId: task_id } : m,
          ),
        }));

        setSending(false);

        // 轮询任务进度
        while (true) {
          await new Promise((r) => setTimeout(r, 1500));
          let progress: TaskProgress;
          try {
            progress = await fetchTask(task_id);
          } catch {
            continue;
          }
          updateSession(sessionId, (s) => ({
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, taskState: progress } : m,
            ),
          }));

          // OPC 任务自动打开右侧面板
          if (options.opcMode && progress.opc_state) {
            setRightPanelTask(progress);
          }

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
            // 更新右侧面板最终数据
            if (options.opcMode) {
              setRightPanelTask(progress);
            }
            break;
          }
          if (progress.status === 'failed') {
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            }));
            setError(progress.error || '任务执行失败');
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
    if (lastQuery)
      void sendQuery(lastQuery, {
        companyMode: false,
        companyTemplate: 'quick_task',
        opcMode: false,
      });
  }, [lastQuery, sendQuery]);

  // ── 从消息打开任务详情 ──
  const handleOpenTask = useCallback(
    (messageId: string) => {
      const msg = activeSession?.messages.find((m) => m.id === messageId);
      if (msg?.taskState) {
        setRightPanelTask(msg.taskState);
      }
    },
    [activeSession],
  );

  // ── 快捷建议 ──
  const handleSuggest = useCallback(
    (text: string, company: boolean) => {
      void sendQuery(text, {
        companyMode: company,
        companyTemplate: 'quick_task',
        opcMode: false,
      });
    },
    [sendQuery],
  );

  // ── Dashboard 任务打开 ──
  const handleDashboardOpenTask = useCallback((task: TaskProgress) => {
    setRightPanelTask(task);
  }, []);

  // ── 状态栏信息 ──
  const statusInfo = useMemo(
    () => ({
      taskCount: sessions.reduce((sum, s) => sum + s.messages.filter((m) => m.taskId).length, 0),
      memoryCount: 0, // 后续可从 dashboard API 获取
    }),
    [sessions],
  );

  return (
    <>
      <AppShell
        activeView={activeView}
        onViewChange={setActiveView}
        rightPanelTask={rightPanelTask}
        onRightPanelClose={() => setRightPanelTask(null)}
        sessions={sessions}
        activeSessionId={activeSession?.id ?? ''}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        llmConfigured={llmConfigured}
        onOpenSettings={() => setSettingsOpen(true)}
        statusInfo={statusInfo}
      >
        {activeView === 'chat' && (
          <ChatView
            messages={activeSession?.messages ?? []}
            sessionId={activeSession?.id ?? ''}
            loading={false}
            sending={sending}
            error={error}
            lastQuery={lastQuery}
            onSend={sendQuery}
            onRetry={handleRetry}
            onDismissError={() => setError(null)}
            onOpenTask={handleOpenTask}
            onSuggest={handleSuggest}
          />
        )}
        {activeView === 'dashboard' && (
          <DashboardView
            onBack={() => setActiveView('chat')}
            onOpenTask={handleDashboardOpenTask}
          />
        )}
        {activeView === 'opc' && (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 text-5xl">🏭</span>
            <h2 className="mb-2 text-lg font-semibold text-gray-200">OPC 监控</h2>
            <p className="max-w-md text-sm text-gray-500">
              在对话视图中开启 OPC 模式，发送工业制程检查请求，
              即可在右侧面板查看 6 级闭环诊断数据。
            </p>
            <button
              onClick={() => setActiveView('chat')}
              className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              前往对话
            </button>
          </div>
        )}
      </AppShell>

      {/* LLM 设置弹窗 */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshConfigStatus}
      />
    </>
  );
}