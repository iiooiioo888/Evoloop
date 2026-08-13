/**
 * EvoLoop 主应用 — IDE 风格单页布局。
 *
 * 使用 AppShell 作为根布局，整合会话管理、聊天视图、
 * 控制面版视图、OPC 右侧诊断面板。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatMessage, ChatSession, TaskProgress } from './types';
import { createTask, fetchConfig, fetchTask, sendChatStream, TaskWebSocket } from './api/client';
import type { TaskWsMessage } from './api/client';
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
import MonitorView from './components/MonitorView';
import SettingsModal from './components/SettingsModal';
import TraceView from './components/TraceView';

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
        executionStrategy: options.executionStrategy,
      };
      const assistantId = crypto.randomUUID();
      const placeholder: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
        executionStrategy: options.executionStrategy,
      };

      updateSession(sessionId, (s) => ({
        ...s,
        title: s.title || query.slice(0, 40),
        updatedAt: Date.now(),
        messages: [...s.messages, userMsg, placeholder],
      }));

      // ── 統一模式：簡單任務走 SSE 串流打字機效果 ──
      if (options.executionStrategy !== 'company') {
        setSending(false);

        // 構建對話歷史（最近 6 輪，排除當前佔位訊息）
        const currentMessages = activeSession.messages.filter(
          (m) => m.id !== assistantId && m.content.trim(),
        );
        const history = currentMessages.slice(-12).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        sendChatStream(query, sessionId, {
          onPhase: (phase) => {
            updateSession(sessionId, (s) => ({
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, streamPhase: phase } : m,
              ),
            }));
          },
          onToken: (token) => {
            updateSession(sessionId, (s) => ({
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m,
              ),
            }));
          },
          onEvaluation: (score, iteration, multiDim) => {
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, meta: { ...m.meta, score, iteration, multiDim } }
                  : m,
              ),
            }));
          },
          onDone: (answer, score, iteration) => {
            updateSession(sessionId, (s) => ({
              ...s,
              updatedAt: Date.now(),
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: answer || m.content,
                      streaming: false,
                      meta: { score, iteration },
                    }
                  : m,
              ),
            }));
          },
          onError: (errMsg) => {
            setError(errMsg);
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            }));
          },
        }, history);
        return;
      }

      // ── 統一模式：公司運行時路徑走任務 API + WebSocket ──
      try {
        const { task_id } = await createTask(
          query,
          options.executionStrategy,
          options.companyTemplate,
          options.taskOptions,
        );
        updateSession(sessionId, (s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, taskId: task_id } : m,
          ),
        }));

        setSending(false);

        // ── 任务进度监听：优先 WebSocket，降级轮询 ──
        let finished = false;
        let wsClient: TaskWebSocket | null = null;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let lastProgress: TaskProgress | null = null;

        const applyProgress = (progress: TaskProgress) => {
          lastProgress = progress;
          updateSession(sessionId, (s) => ({
            ...s,
            updatedAt: Date.now(),
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, taskState: progress } : m,
            ),
          }));

          // OPC 任务自动打开右侧面板
          if (progress.resolved_path === 'opc' && progress.opc_state) {
            setRightPanelTask(progress);
          }

          if (progress.status === 'completed' && !finished) {
            finished = true;
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
            if (progress.resolved_path === 'opc') {
              setRightPanelTask(progress);
            }
            wsClient?.close();
            if (pollTimer) clearTimeout(pollTimer);
          }
          if (progress.status === 'failed' && !finished) {
            finished = true;
            updateSession(sessionId, (s) => ({
              ...s,
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            }));
            setError(progress.error || '任务执行失败');
            wsClient?.close();
            if (pollTimer) clearTimeout(pollTimer);
          }
        };

        // 轮询降级方案
        const pollProgress = async () => {
          if (finished) return;
          try {
            const progress = await fetchTask(task_id);
            applyProgress(progress);
          } catch {
            // 忽略单次轮询失败
          }
          if (!finished) {
            pollTimer = setTimeout(pollProgress, 1500);
          }
        };

        // WebSocket 消息处理
        const handleWsMessage = (msg: TaskWsMessage) => {
          if (msg.event === 'snapshot') {
            // 初始快照
            applyProgress(msg.data as unknown as TaskProgress);
          } else if (msg.event === 'task_finished') {
            // 任务结束：获取最终状态
            fetchTask(task_id).then(applyProgress).catch(() => {
              // 降级：使用事件数据
              const data = msg.data;
              if (lastProgress) {
                const statusValue = data.status;
                const validStatus: TaskProgress['status'] =
                  statusValue === 'completed' || statusValue === 'failed' ||
                  statusValue === 'running' || statusValue === 'pending'
                    ? statusValue
                    : 'completed';
                applyProgress({
                  ...lastProgress,
                  status: validStatus,
                  score: (data.score as number) ?? null,
                  iteration: (data.iteration as number) ?? 0,
                  error: (data.error as string) ?? '',
                });
              }
            });
          } else if (msg.event === 'phase_change' || msg.event === 'evaluation') {
            // 增量更新：获取最新状态
            fetchTask(task_id).then(applyProgress).catch(() => {});
          }
        };

        // 尝试 WebSocket 连接
        try {
          wsClient = new TaskWebSocket(
            task_id,
            handleWsMessage,
            () => {
              // WebSocket 关闭且任务未完成 → 降级轮询
              if (!finished) {
                pollProgress();
              }
            },
          );
          wsClient.connect();

          // 3 秒后检查连接状态，未连接则启动轮询
          setTimeout(() => {
            if (!wsClient?.connected && !finished) {
              pollProgress();
            }
          }, 3000);
        } catch {
          // WebSocket 不可用，直接轮询
          pollProgress();
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
        executionStrategy: 'auto',
        companyTemplate: 'quick_task',
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
        executionStrategy: company ? 'company' : 'auto',
        companyTemplate: 'quick_task',
      });
    },
    [sendQuery],
  );

  // ── Dashboard 任务打开 ──
  const handleDashboardOpenTask = useCallback((task: TaskProgress) => {
    setRightPanelTask(task);
  }, []);

  // ── 打開執行軌跡視圖 ──
  const handleOpenTrace = useCallback((_taskId: string) => {
    setActiveView('traces');
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
            onOpenTrace={handleOpenTrace}
            onSuggest={handleSuggest}
          />
        )}
        {activeView === 'monitor' && (
          <MonitorView onOpenTask={handleDashboardOpenTask} />
        )}
        {activeView === 'traces' && <TraceView />}
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