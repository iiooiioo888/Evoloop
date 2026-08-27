/**
 * SidePanel — 左侧上下文面板（220px）。
 *
 * 根据 activeView 显示不同内容：
 * - Chat → 会话列表
 * - Monitor → 分頁導航（總覽／角色 Agent／控制面版…）皆在左側外圍；
 *            選「◈ 角色 Agent」時於同欄展開 85 位角色名冊（不進主區卡片）
 * - Traces → 說明
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchAgentMonitor } from '../api/client';
import { AGENT_STATUS_META, agentOpenCount } from '../lib/agentUi';
import { AGENT_FALLBACK_ROSTER } from '../lib/monitorFallbacks';
import { MONITOR_TABS } from '../lib/monitorTabs';
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
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

/** 会话列表 */
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
      <div className="border-b border-gray-800 p-2">
        <button
          onClick={onNewSession}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:border-blue-500 hover:bg-gray-700"
        >
          ＋ 新对话
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && (
          <p className="mt-8 px-3 text-center text-xs text-gray-500">尚無对话纪录</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
              session.id === activeSessionId
                ? 'bg-blue-600/15 ring-1 ring-blue-500/30'
                : 'hover:bg-gray-800'
            }`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{session.title || '新对话'}</p>
              <p className="text-[11px] text-gray-500">{formatRelative(session.updatedAt)}</p>
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
              className={`shrink-0 rounded px-1.5 py-1 text-xs transition-all ${
                confirmingId === session.id
                  ? 'bg-red-900/50 text-red-300 opacity-100'
                  : 'text-gray-500 opacity-0 hover:bg-red-900/40 hover:text-red-300 group-hover:opacity-100'
              }`}
              aria-label="删除会话"
            >
              {confirmingId === session.id ? '确认?' : '🗑'}
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-800 p-2 text-[11px] text-gray-500">
        对话纪录仅存于本机浏览器
      </div>
    </>
  );
}

/** 監控側欄：全部分頁（含角色 Agent）同層列於左側外圍；名冊不進主區卡片。 */
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-gray-800 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">监控中心</p>
        <p className="mt-1 text-[10px] text-gray-600">分頁與角色名冊皆在左側外圍</p>
      </div>

      <nav className="shrink-0 space-y-0.5 border-b border-gray-800 p-2" aria-label="監控分頁">
        {MONITOR_TABS.map((item) => {
          const active = monitorTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onMonitorTabChange(item.key);
                if (item.key !== 'agents') {
                  onFocusAgent(null);
                  onClose();
                }
                // 角色 Agent：留在左側外圍展開名冊，不關閉側欄
              }}
              className={`relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-all duration-150 ${
                active
                  ? 'bg-blue-600/15 text-gray-100 ring-1 ring-blue-500/30'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {active && (
                <span className="activity-indicator absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
              )}
              <span className="w-4 shrink-0 text-center text-sm leading-none">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              {item.key === 'agents' && (
                <span className="shrink-0 font-mono text-[9px] text-gray-600">名冊</span>
              )}
            </button>
          );
        })}
      </nav>

      {onAgentsTab ? (
        <>
          <div className="shrink-0 border-b border-gray-800 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                ◈ 角色名冊
              </p>
              <button
                type="button"
                onClick={() => {
                  onFocusAgent(null);
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-300"
              >
                目錄總覽
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-gray-600">
              與上方分頁同層 · 點選角色進入右側工作台
            </p>
          </div>
          <AgentRoster
            focusAgentId={focusAgentId}
            onPick={(id) => {
              onFocusAgent(id);
              onMonitorTabChange('agents');
              // 行動端選完角色後收起側欄，露出工作台
              onClose();
            }}
          />
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-[11px] leading-relaxed text-gray-600">
            點選上方分頁切換主區域。需要 85 位角色名冊時，選「◈ 角色 Agent」——名冊會展開於本欄（左側外圍），不會藏進主區卡片。
          </p>
        </div>
      )}
    </div>
  );
}

function AgentRoster({
  focusAgentId,
  onPick,
}: {
  focusAgentId: string | null;
  onPick: (id: string) => void;
}) {
  const [agents, setAgents] = useState<RoleAgent[]>(AGENT_FALLBACK_ROSTER);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchAgentMonitor();
        if (!cancelled && data.agents?.length) setAgents(data.agents);
      } catch {
        if (!cancelled) setAgents(AGENT_FALLBACK_ROSTER);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => {
      const hay = `${a.name} ${a.description ?? ''} ${(a.responsibilities ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [agents, query]);

  const grouped = useMemo(() => {
    const levels = [
      { level: 0, label: '決策層' },
      { level: 1, label: '技術領導' },
      { level: 2, label: '領域領導' },
      { level: 3, label: '執行層' },
      { level: 4, label: '支援' },
    ];
    return levels
      .map((lv) => ({ ...lv, agents: filtered.filter((a) => a.level === lv.level) }))
      .filter((g) => g.agents.length > 0);
  }, [filtered]);

  const customCount = agents.filter((a) => a.is_custom).length;
  const busyCount = agents.filter((a) => a.status === 'busy' || a.status === 'waiting').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-gray-800 px-2 pb-2 pt-2">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
          {agents.length} 位角色
          {busyCount > 0 ? ` · ${busyCount} 活躍` : ''}
          {customCount > 0 ? ` · ${customCount} 自定義` : ''}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋角色／職責"
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 placeholder:text-gray-600"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {grouped.length === 0 && (
          <p className="px-2 pt-4 text-center text-[11px] text-gray-600">無符合的角色</p>
        )}
        {grouped.map((group) => (
          <div key={group.level} className="mb-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              L{group.level} {group.label}
              <span className="ml-1 font-mono text-gray-700">{group.agents.length}</span>
            </p>
            <div className="space-y-0.5">
              {group.agents.map((agent) => {
                const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
                const active = agent.id === focusAgentId;
                const count = agentOpenCount(agent);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onPick(agent.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 ${
                      active
                        ? 'border border-blue-500/40 bg-blue-500/10'
                        : 'border border-transparent hover:bg-gray-800'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot} ${
                        agent.status === 'busy' ? 'animate-pulse' : ''
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-200">{agent.name}</span>
                      <span className={`block truncate text-[10px] ${meta.text}`}>{meta.label}</span>
                    </span>
                    {count > 0 && (
                      <span className="font-mono text-[10px] text-gray-500">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-10 left-12 z-30 flex w-56 flex-col overflow-hidden border-r border-gray-800 bg-gray-900 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-800 p-2 md:hidden">
          <span className="text-xs font-medium text-gray-400">导航</span>
          <button
            onClick={onClose}
            className="rounded px-2 py-0.5 text-gray-400 hover:bg-gray-800"
          >
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
          <div className="p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              執行軌跡
            </p>
            <div className="space-y-2">
              <div className="rounded-lg border border-white/5 bg-gray-800/40 px-3 py-2">
                <p className="text-xs font-medium text-gray-300">LLM 調用鏈</p>
                <p className="mt-0.5 text-[11px] text-gray-500">prompt / response 可展開</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-gray-800/40 px-3 py-2">
                <p className="text-xs font-medium text-gray-300">評估 · 反思 · 改進</p>
                <p className="mt-0.5 text-[11px] text-gray-500">反思閉環每一輪都入檔</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-gray-800/40 px-3 py-2">
                <p className="text-xs font-medium text-gray-300">工具呼叫</p>
                <p className="mt-0.5 text-[11px] text-gray-500">公司工作項與 OPC 護欄</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
