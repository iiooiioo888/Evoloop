/**
 * SidePanel — 左側上下文面板。
 * Chat → 會話；Monitor → 精簡分頁 + 虛擬滾動名冊。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Virtuoso } from 'react-virtuoso';
import { AGENT_STATUS_META, agentOpenCount } from '../lib/agentUi';
import { AGENT_FALLBACK_ROSTER } from '../lib/monitorFallbacks';
import {
  isMonitorMoreTab,
  MONITOR_MORE_TABS,
  MONITOR_PRIMARY_TABS,
} from '../lib/monitorTabs';
import { LAB_TABS, type LabSubTab } from '../lib/labTabs';
import { useMonitorStore } from '../stores/monitorStore';
import type { ChatSession, RoleAgent, TaskSummary } from '../types';
import type { MonitorTab, ViewKey } from './AppShell';
import TraceRoster from './TraceRoster';

interface SidePanelProps {
  activeView: ViewKey;
  sessions: ChatSession[];
  activeSessionId: string;
  open: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
  monitorTab: MonitorTab;
  onMonitorTabChange: (tab: MonitorTab) => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
  focusTaskId: string | null;
  onFocusTask: (id: string | null) => void;
  traceTaskId: string | null;
  onTraceTaskChange: (id: string | null) => void;
  labSubTab: LabSubTab;
  onLabSubTabChange: (tab: LabSubTab) => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmingId) return;
    const timer = setTimeout(() => setConfirmingId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingId]);

  return (
    <>
      <div className="border-b border-white/[0.06] p-2.5">
        <button
          onClick={onNewSession}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-[#F5F5F7] transition-colors hover:bg-white/[0.06]"
        >
          新對話
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && (
          <p className="mt-8 px-3 text-center text-[11px] text-[#636366]">尚無對話紀錄</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
              session.id === activeSessionId
                ? 'bg-white/[0.06] text-[#F5F5F7]'
                : 'text-[#AEAEB2] hover:bg-white/[0.03] hover:text-[#F5F5F7]'
            }`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#F5F5F7]">
                {session.title || '新對話'}
              </p>
              <p className="text-[10px] text-[#8E8E93]">{formatRelative(session.updatedAt)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirmingId === session.id) {
                  onDeleteSession(session.id);
                  setConfirmingId(null);
                } else {
                  setConfirmingId(session.id);
                }
              }}
              className={`shrink-0 rounded-lg px-1.5 py-1 text-[10px] transition-all ${
                confirmingId === session.id
                  ? 'bg-[#FF3B30]/20 text-[#FF3B30] opacity-100'
                  : 'text-[#636366] opacity-0 hover:bg-[#FF3B30]/15 hover:text-[#FF3B30] group-hover:opacity-100'
              }`}
              aria-label="刪除會話"
            >
              {confirmingId === session.id ? '確認?' : '刪'}
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] text-[#48484A]">
        本機儲存
      </div>
    </>
  );
}

type RosterRow =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'agent'; key: string; agent: RoleAgent };

function AgentRoster({
  focusAgentId,
  onPick,
}: {
  focusAgentId: string | null;
  onPick: (id: string) => void;
}) {
  const storeAgents = useMonitorStore((s) => s.agents?.agents);
  const agents = storeAgents?.length ? storeAgents : AGENT_FALLBACK_ROSTER;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => {
      const hay = `${a.name} ${a.description ?? ''} ${(a.responsibilities ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [agents, query]);

  const rows: RosterRow[] = useMemo(() => {
    const levels = [
      { level: 0, label: '決策層' },
      { level: 1, label: '技術領導' },
      { level: 2, label: '領域領導' },
      { level: 3, label: '執行層' },
      { level: 4, label: '支援' },
    ];
    const out: RosterRow[] = [];
    for (const lv of levels) {
      const list = filtered.filter((a) => a.level === lv.level);
      if (!list.length) continue;
      out.push({ kind: 'header', key: `h-${lv.level}`, label: `L${lv.level} ${lv.label}`, count: list.length });
      for (const agent of list) {
        out.push({ kind: 'agent', key: agent.id, agent });
      }
    }
    return out;
  }, [filtered]);

  const busyCount = agents.filter((a) => a.status === 'busy' || a.status === 'waiting').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-white/[0.06] px-3 pb-3 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#636366]">
          {agents.length} 位 · {busyCount} 活躍
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋角色／職責"
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-[#F5F5F7] placeholder:text-[#636366] outline-none focus:border-[#007AFF]/50"
        />
      </div>
      <Virtuoso
        className="min-h-0 flex-1"
        data={rows}
        itemContent={(_i, row) => {
          if (row.kind === 'header') {
            return (
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#636366]">
                {row.label}
                <span className="ml-1 font-mono text-[#48484A]">{row.count}</span>
              </p>
            );
          }
          const agent = row.agent;
          const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
          const active = agent.id === focusAgentId;
          const count = agentOpenCount(agent);
          return (
            <button
              type="button"
              onClick={() => onPick(agent.id)}
              className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                active
                  ? 'bg-white/[0.06] text-[#F5F5F7]'
                  : 'text-[#AEAEB2] hover:bg-white/[0.03] hover:text-[#F5F5F7]'
              }`}
            >
              <span
                className={`apple-dot shrink-0 ${agent.status === 'busy' ? 'apple-dot--ok' : ''}`}
                style={
                  agent.status === 'busy'
                    ? undefined
                    : agent.status === 'error'
                      ? { background: '#FF3B30', boxShadow: '0 0 0 2px #FF3B3033, 0 0 10px #FF3B3055' }
                      : agent.status === 'waiting'
                        ? { background: '#FF9500', boxShadow: '0 0 0 2px #FF950033, 0 0 10px #FF950055' }
                        : { background: '#8E8E93', boxShadow: '0 0 0 2px #8E8E9333' }
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[#F5F5F7]">{agent.name}</span>
                <span className={`block truncate text-[10px] ${meta.text}`}>{meta.label}</span>
              </span>
              {count > 0 && <span className="apple-data text-[10px] text-[#8E8E93]">{count}</span>}
            </button>
          );
        }}
      />
    </div>
  );
}

const TASK_STATUS_DOT: Record<string, string> = {
  pending: 'bg-[#FF9500]',
  running: 'bg-[#007AFF] animate-pulse',
  completed: 'bg-[#34C759]',
  failed: 'bg-[#FF3B30]',
  cancelled: 'bg-[#8E8E93]',
  interrupted: 'bg-[#FF9500]',
};

const EMPTY_TASKS: TaskSummary[] = [];

const selectTaskRoster = (s: ReturnType<typeof useMonitorStore.getState>) =>
  s.dashboard?.tasks ?? EMPTY_TASKS;

function TaskRoster({
  focusTaskId,
  onPick,
}: {
  focusTaskId: string | null;
  onPick: (id: string) => void;
}) {
  const tasks = useMonitorStore(useShallow(selectTaskRoster));
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'pending').length;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? tasks.filter((t) => t.query.toLowerCase().includes(q) || t.task_id.includes(q))
      : tasks;
    return list.slice(0, 80);
  }, [tasks, query]);

  const renderItem = useCallback(
    (_i: number, task: TaskSummary) => {
      const active = task.task_id === focusTaskId;
      const dot = TASK_STATUS_DOT[task.status] ?? 'bg-[#8E8E93]';
      return (
        <button
          type="button"
          onClick={() => onPick(task.task_id)}
          className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
            active
              ? 'bg-white/[0.06] text-[#F5F5F7]'
              : 'text-[#AEAEB2] hover:bg-white/[0.03] hover:text-[#F5F5F7]'
          }`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-[#F5F5F7]">
              {task.query || task.task_id.slice(0, 8)}
            </span>
            <span className="block truncate text-[10px] text-[#636366]">
              {task.resolved_path || task.strategy} · {task.phase}
            </span>
          </span>
        </button>
      );
    },
    [focusTaskId, onPick],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-white/[0.06] px-3 pb-3 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#636366]">
          {tasks.length} 筆 · {running} 執行中
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋任務／ID"
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-[#F5F5F7] placeholder:text-[#636366] outline-none focus:border-[#007AFF]/50"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="px-3 py-8 text-center text-[11px] text-[#636366]">
          {tasks.length === 0 ? '尚無任務紀錄' : '無符合結果'}
        </p>
      ) : (
        <Virtuoso
          className="min-h-0 flex-1"
          data={filtered}
          computeItemKey={(_i, task) => task.task_id}
          itemContent={renderItem}
        />
      )}
    </div>
  );
}

function TabBtn({
  item,
  active,
  onClick,
}: {
  item: { key: string; icon: string; label: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ${
        active
          ? 'bg-white/[0.06] font-medium text-[#F5F5F7]'
          : 'text-[#98989D] hover:bg-white/[0.03] hover:text-[#F5F5F7]'
      }`}
    >
      <span className="w-4 shrink-0 text-center text-[12px] leading-none opacity-70">{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

function LabSidebar({
  labSubTab,
  onLabSubTabChange,
}: {
  labSubTab: LabSubTab;
  onLabSubTabChange: (tab: LabSubTab) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-3 pb-3 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#636366]">整合工具</p>
        <p className="mt-1 text-[10px] leading-relaxed text-[#48484A]">
          Firecrawl · Prompt Optimizer · Archify · Ponytail
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="實驗室工具">
        {LAB_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onLabSubTabChange(item.key)}
            className={`flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors ${
              labSubTab === item.key
                ? 'bg-white/[0.06] text-[#F5F5F7]'
                : 'text-[#98989D] hover:bg-white/[0.03] hover:text-[#F5F5F7]'
            }`}
          >
            <span className="text-[12px] font-medium">{item.label}</span>
            {item.upstream && (
              <span className="mt-0.5 truncate text-[10px] text-[#636366]">{item.upstream.name}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function MonitorSidebar({
  monitorTab,
  onClose,
  focusAgentId,
  onFocusAgent,
  focusTaskId,
  onFocusTask,
  onMonitorTabChange,
  labSubTab,
  onLabSubTabChange,
}: {
  monitorTab: MonitorTab;
  onClose: () => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
  focusTaskId: string | null;
  onFocusTask: (id: string | null) => void;
  onMonitorTabChange: (tab: MonitorTab) => void;
  labSubTab: LabSubTab;
  onLabSubTabChange: (tab: LabSubTab) => void;
}) {
  const onAgentsTab = monitorTab === 'agents';
  const onTasksTab = monitorTab === 'tasks';
  const onLabTab = monitorTab === 'lab';
  const [moreOpen, setMoreOpen] = useState(() => isMonitorMoreTab(monitorTab));

  useEffect(() => {
    if (isMonitorMoreTab(monitorTab)) setMoreOpen(true);
  }, [monitorTab]);

  const pick = (key: MonitorTab) => {
    onMonitorTabChange(key);
    if (key !== 'agents' && focusAgentId) onFocusAgent(null);
    if (key !== 'tasks' && focusTaskId) onFocusTask(null);
    if (key !== 'agents' && key !== 'tasks' && key !== 'lab') onClose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 py-2.5">
        <p className="text-[11px] font-medium text-[#636366]">監控</p>
      </div>

      <nav className="shrink-0 space-y-0.5 border-b border-white/[0.06] p-2" aria-label="監控分頁">
        {MONITOR_PRIMARY_TABS.map((item) => (
          <TabBtn
            key={item.key}
            item={item}
            active={monitorTab === item.key}
            onClick={() => pick(item.key)}
          />
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-[#636366] hover:bg-white/[0.04]"
        >
          <span>更多</span>
          <span className="font-mono text-[10px]">{moreOpen ? '−' : '+'}</span>
        </button>

        {moreOpen &&
          MONITOR_MORE_TABS.map((item) => (
            <TabBtn
              key={item.key}
              item={item}
              active={monitorTab === item.key}
              onClick={() => pick(item.key)}
            />
          ))}
      </nav>

      {onAgentsTab ? (
        <AgentRoster
          focusAgentId={focusAgentId}
          onPick={(id) => {
            onFocusAgent(id);
            onMonitorTabChange('agents');
            onClose();
          }}
        />
      ) : onTasksTab ? (
        <TaskRoster
          focusTaskId={focusTaskId}
          onPick={(id) => {
            onFocusTask(id);
            onMonitorTabChange('tasks');
          }}
        />
      ) : onLabTab ? (
        <LabSidebar labSubTab={labSubTab} onLabSubTabChange={onLabSubTabChange} />
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

export default function SidePanel({
  activeView,
  sessions,
  activeSessionId,
  open,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onClose,
  monitorTab,
  onMonitorTabChange,
  focusAgentId,
  onFocusAgent,
  focusTaskId,
  onFocusTask,
  traceTaskId,
  onTraceTaskChange,
  labSubTab,
  onLabSubTabChange,
}: SidePanelProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-10 left-11 z-30 flex w-52 flex-col overflow-hidden border-r border-white/[0.06] apple-chrome transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] p-2 md:hidden">
          <span className="text-[11px] font-bold text-[#AEAEB2]">導航</span>
          <button onClick={onClose} className="rounded-lg px-2 py-0.5 text-[#8E8E93] hover:bg-white/[0.06]">
            ✕
          </button>
        </div>

        {activeView === 'chat' && (
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
          />
        )}
        {activeView === 'monitor' && (
          <MonitorSidebar
            monitorTab={monitorTab}
            onMonitorTabChange={onMonitorTabChange}
            onClose={onClose}
            focusAgentId={focusAgentId}
            onFocusAgent={onFocusAgent}
            focusTaskId={focusTaskId}
            onFocusTask={onFocusTask}
            labSubTab={labSubTab}
            onLabSubTabChange={onLabSubTabChange}
          />
        )}

        {activeView === 'traces' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-3 py-2.5">
              <p className="text-[11px] font-medium text-[#636366]">執行軌跡</p>
            </div>
            <TraceRoster
              selectedTaskId={traceTaskId}
              onPick={(id) => {
                onTraceTaskChange(id);
                onClose();
              }}
            />
          </div>
        )}
      </aside>
    </>
  );
}
