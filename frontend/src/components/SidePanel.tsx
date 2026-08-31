/**
 * SidePanel — 左側上下文面板。
 * Chat → 會話；Monitor → 精簡分頁 + 虛擬滾動名冊。
 */
import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { AGENT_STATUS_META, agentOpenCount } from '../lib/agentUi';
import { AGENT_FALLBACK_ROSTER } from '../lib/monitorFallbacks';
import {
  isMonitorMoreTab,
  MONITOR_MORE_TABS,
  MONITOR_PRIMARY_TABS,
} from '../lib/monitorTabs';
import { useMonitorStore } from '../stores/monitorStore';
import type { ChatSession, RoleAgent } from '../types';
import type { MonitorTab, ViewKey } from './AppShell';

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
      <div className="border-b border-white/[0.06] p-3">
        <button
          onClick={onNewSession}
          className="w-full rounded-full bg-[#007AFF] px-3 py-2 text-[12px] font-bold text-white"
        >
          新對話
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <p className="mt-8 px-3 text-center text-[11px] text-[#636366]">尚無對話紀錄</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
              session.id === activeSessionId
                ? 'bg-[#007AFF]/15 ring-1 ring-[#007AFF]/35'
                : 'hover:bg-white/[0.04]'
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
      <div className="border-t border-white/[0.06] p-3 text-[10px] text-[#636366]">
        對話紀錄僅存於本機瀏覽器
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
              className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors ${
                active
                  ? 'bg-[#007AFF]/15 ring-1 ring-[#007AFF]/35'
                  : 'hover:bg-white/[0.04]'
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
      className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] transition-colors ${
        active
          ? 'bg-[#007AFF]/15 font-bold text-[#F5F5F7] ring-1 ring-[#007AFF]/30'
          : 'font-medium text-[#AEAEB2] hover:bg-white/[0.04] hover:text-[#F5F5F7]'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-[#007AFF]" />
      )}
      <span className="w-4 shrink-0 text-center text-[13px] leading-none opacity-80">{item.icon}</span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

function MonitorSidebar({
  monitorTab,
  onClose,
  focusAgentId,
  onFocusAgent,
  onMonitorTabChange,
}: {
  monitorTab: MonitorTab;
  onClose: () => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
  onMonitorTabChange: (tab: MonitorTab) => void;
}) {
  const onAgentsTab = monitorTab === 'agents';
  const [moreOpen, setMoreOpen] = useState(() => isMonitorMoreTab(monitorTab));

  useEffect(() => {
    if (isMonitorMoreTab(monitorTab)) setMoreOpen(true);
  }, [monitorTab]);

  const pick = (key: MonitorTab) => {
    onMonitorTabChange(key);
    if (key !== 'agents') {
      onFocusAgent(null);
      onClose();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-3">
        <p className="apple-title">監控</p>
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
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[11px] leading-relaxed text-[#636366]">
            主區只留即時／角色／管線。OPC、實驗室、運維與記憶收在「更多」。
          </p>
        </div>
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
}: SidePanelProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed inset-y-10 left-12 z-30 flex w-56 flex-col overflow-hidden border-r border-white/[0.06] apple-chrome transition-transform md:static md:translate-x-0 ${
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
          />
        )}

        {activeView === 'traces' && (
          <div className="space-y-2 p-3">
            <p className="apple-title mb-2">執行軌跡</p>
            {['LLM 調用鏈', '評估 · 反思 · 改進', '工具呼叫'].map((t) => (
              <div key={t} className="apple-inset px-3 py-2.5">
                <p className="text-[12px] font-bold text-[#F5F5F7]">{t}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  );
}
