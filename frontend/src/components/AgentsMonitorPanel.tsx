/**
 * AgentsMonitorPanel — 每位公司角色一張獨立 Agent 工作台。
 *
 * 預設進入選中角色的完整介面：任務列表 + 看板 + 事件 + 組織監控。
 * 樓層總覽改為次要視圖。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCustomAgent,
  deleteCustomAgent,
  fetchAgentMonitor,
  resetAgentSettings,
  updateAgentMonitorPrefs,
  updateAgentSettings,
} from '../api/client';
import {
  AGENT_STATUS_META,
  CATEGORY_LABEL,
  ROUTING_LABEL,
  TIER_LABEL,
  agentOpenCount,
  blankMetrics,
  fmtUsd,
  fmtWhen,
  pickDefaultAgentId,
} from '../lib/agentUi';
import { AGENT_FALLBACK_ROSTER } from '../lib/monitorFallbacks';
import type { AgentEvent, AgentMonitorData, AgentWorkItem, RoleAgent } from '../types';
import RoleSettingsPanel, { CreateRoleModal, draftToPayload, type RoleSettingsDraft } from './RoleSettingsPanel';
import { EVENT_LABELS, ITEM_STATUS_META, roleLabel } from './TaskPanel';

const KIND_META: Record<string, { label: string; cls: string }> = {
  assigned: { label: '指派', cls: 'bg-[#5e6ad2]/15 text-[#828fff]' },
  review: { label: '審查', cls: 'bg-purple-500/15 text-purple-300' },
  coordinate: { label: '協調', cls: 'bg-amber-500/15 text-amber-300' },
  synthesize: { label: '整合', cls: 'bg-cyan-500/15 text-cyan-300' },
};

const KANBAN: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'queue', label: '佇列', statuses: ['planning', 'ready'] },
  { key: 'executing', label: '執行中', statuses: ['executing'] },
  { key: 'review', label: '審查 / 返工', statuses: ['in_review', 'rework'] },
  { key: 'closed', label: '完成 / 阻塞', statuses: ['done', 'blocked'] },
];

const LIST_FILTERS: Array<{ key: string; label: string; statuses?: string[] }> = [
  { key: 'open', label: '進行中', statuses: ['planning', 'ready', 'executing', 'in_review', 'rework', 'blocked'] },
  { key: 'all', label: '全部' },
  { key: 'assigned', label: '指派' },
  { key: 'review', label: '審查' },
  { key: 'done', label: '完成', statuses: ['done'] },
];

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event.replace(/_/g, ' ');
}

function itemStatus(status: string): { label: string; cls: string } {
  return ITEM_STATUS_META[status] ?? { label: status, cls: 'bg-gray-700/60 text-gray-300' };
}

function currentItem(agent: RoleAgent): AgentWorkItem | null {
  const executing = agent.work_items.find((i) => i.status === 'executing');
  if (executing) return executing;
  if (
    agent.current_item &&
    ['executing', 'planning', 'ready', 'in_review', 'rework'].includes(agent.current_item.status)
  ) {
    return agent.current_item;
  }
  return null;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[#62666d]">{label}</p>
      <p className="mt-1 font-mono text-lg text-[#f7f8f8]">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[#8a8f98]">{hint}</p>}
    </div>
  );
}

function WorkItemCard({
  item,
  expanded,
  onToggle,
  compact,
}: {
  item: AgentWorkItem;
  expanded?: boolean;
  onToggle?: () => void;
  compact?: boolean;
}) {
  const st = itemStatus(item.status);
  const kind = KIND_META[item.kind] ?? KIND_META.assigned;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2 text-left ${
        onToggle ? 'hover:border-[#34343a]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`min-w-0 font-medium text-[#f7f8f8] ${compact ? 'truncate text-[12px]' : 'text-[13px]'}`}>
          {item.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {!compact && <span className={`rounded px-1.5 py-0.5 text-[10px] ${kind.cls}`}>{kind.label}</span>}
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
        </div>
      </div>
      {!compact && (
        <p className="mt-0.5 truncate text-[11px] text-[#8a8f98]">
          {item.task_query || item.task_id}
          {item.assignee && item.kind !== 'assigned' ? ` · 原指派 ${roleLabel(item.assignee)}` : ''}
        </p>
      )}
      {expanded && (
        <div className="mt-2 space-y-1.5 border-t border-[#23252a] pt-2">
          {item.description && <p className="text-[11px] leading-relaxed text-[#d0d6e0]">{item.description}</p>}
          {item.output_preview && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-[#141516] px-2 py-1 font-mono text-[10px] text-[#d0d6e0]">
              {item.output_preview}
            </pre>
          )}
          {(item.depends_on?.length ?? 0) > 0 && (
            <p className="text-[10px] text-[#8a8f98]">依賴 {item.depends_on!.join(', ')}</p>
          )}
          <div className="flex justify-between text-[10px] text-[#62666d]">
            <span>
              {fmtUsd(item.cost_usd)} · {item.source === 'live' ? '即時' : '歷史'}
              {item.tier ? ` · ${TIER_LABEL[item.tier] ?? item.tier}` : ''}
            </span>
            <span>{fmtWhen(item.updated_at)}</span>
          </div>
        </div>
      )}
      {!expanded && compact && (
        <p className="mt-1 text-[10px] text-[#62666d]">{fmtWhen(item.updated_at)}</p>
      )}
    </button>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  return (
    <div className="flex gap-2 border-b border-[#23252a] py-1.5 last:border-0">
      <span className="w-24 shrink-0 font-mono text-[10px] text-[#62666d]">{fmtWhen(event.ts)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-[#d0d6e0]">{eventLabel(event.event)}</p>
        {event.title && <p className="truncate text-[10px] text-[#8a8f98]">{event.title}</p>}
      </div>
      {event.cost_usd > 0 && (
        <span className="shrink-0 font-mono text-[10px] text-[#8a8f98]">{fmtUsd(event.cost_usd)}</span>
      )}
    </div>
  );
}

function RoleChips({
  ids,
  onOpen,
}: {
  ids: string[];
  onOpen: (id: string) => void;
}) {
  if (ids.length === 0) return <span className="text-[11px] text-[#62666d]">無</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98] hover:border-[#5e6ad2]/40 hover:text-[#828fff]"
        >
          {roleLabel(id)}
        </button>
      ))}
    </div>
  );
}

function RoleMonitorExtras({ agent }: { agent: RoleAgent }) {
  const m = agent.metrics ?? blankMetrics();
  if (agent.id === 'reviewer') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="通過" value={String(m.review_pass)} />
        <Kpi label="退回" value={String(m.review_rework)} />
        <Kpi label="強制完成" value={String(m.review_force)} />
      </div>
    );
  }
  if (agent.id === 'manager') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="協調任務" value={String(agent.company_tasks.length)} hint="本角色經手" />
        <Kpi label="預算告警" value={String(m.budget_alerts)} />
        <Kpi label="錯誤" value={String(m.errors)} />
      </div>
    );
  }
  if (agent.id === 'synthesizer') {
    const outputs = agent.work_items.filter((i) => i.kind === 'synthesize' && i.output_preview);
    return (
      <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-[#62666d]">最近整合產出</p>
        {outputs.length === 0 ? (
          <p className="mt-1 text-[11px] text-[#62666d]">尚無整合結果</p>
        ) : (
          outputs.slice(0, 2).map((item) => (
            <p key={`${item.task_id}-${item.id}`} className="mt-1 line-clamp-3 text-[11px] text-[#d0d6e0]">
              {item.output_preview}
            </p>
          ))
        )}
      </div>
    );
  }
  if (agent.id === 'coordinator') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="阻塞項" value={String(agent.blocked)} hint="待解除" />
        <Kpi label="工具呼叫" value={String(m.tool_calls)} />
      </div>
    );
  }
  if (agent.category === 'finance' || agent.id.includes('quant')) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="研究項" value={String(agent.work_items.length)} />
        <Kpi label="花費" value={fmtUsd(agent.cost_usd)} />
        <Kpi label="模型" value={m.last_model || agent.preferred_model || '預設'} />
      </div>
    );
  }
  if (agent.category === 'industrial' || agent.id.includes('opc')) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="診斷項" value={String(agent.work_items.length)} />
        <Kpi label="錯誤" value={String(m.errors)} />
        <Kpi label="SLA 逾時" value={String(m.sla_breaches ?? 0)} />
      </div>
    );
  }
  if (agent.category === 'creative' || agent.id.includes('story')) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="章節／文案" value={String(agent.work_items.length)} />
        <Kpi label="完成" value={String(agent.done)} />
      </div>
    );
  }
  if (agent.category === 'crawler') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="採集任務" value={String(agent.work_items.length)} />
        <Kpi label="重試" value={String(m.retries ?? 0)} />
        <Kpi label="錯誤" value={String(m.errors)} />
      </div>
    );
  }
  if (agent.category === 'platform' || agent.id.includes('github') || agent.id.includes('release')) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="倉庫工作" value={String(agent.work_items.length)} />
        <Kpi label="工具呼叫" value={String(m.tool_calls)} />
        <Kpi label="錯誤" value={String(m.errors)} />
      </div>
    );
  }
  if (agent.category === 'hub' || agent.id.includes('hub')) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="預算告警" value={String(m.budget_alerts)} />
        <Kpi label="今日花費" value={fmtUsd(m.daily_spent_usd ?? agent.cost_usd)} />
        <Kpi label="熔斷／錯誤" value={String(m.errors)} />
      </div>
    );
  }
  if (agent.category === 'memory' || agent.id.includes('memory') || agent.id.includes('knowledge')) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="策展項" value={String(agent.work_items.length)} />
        <Kpi label="完成" value={String(agent.done)} />
        <Kpi label="重試" value={String(m.retries ?? 0)} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <Kpi label="工具呼叫" value={String(m.tool_calls)} />
      <Kpi label="錯誤" value={String(m.errors)} />
      <Kpi
        label="容量"
        value={`${agent.capacity_used ?? agent.executing}/${agent.max_parallel_work}`}
        hint="執行中 / 並行上限"
      />
    </div>
  );
}

function RoleDeepMonitor({ agent }: { agent: RoleAgent }) {
  const m = agent.metrics ?? blankMetrics();
  const budget = agent.daily_budget_usd ?? 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi label="成功率" value={`${m.success_rate ?? 0}%`} hint={`${m.items_total ?? 0} 項`} />
        <Kpi label="平均成本" value={fmtUsd(m.avg_cost_usd ?? 0)} />
        <Kpi label="容量使用" value={`${m.capacity_pct ?? 0}%`} />
        <Kpi label="今日花費" value={fmtUsd(m.daily_spent_usd ?? agent.cost_usd)} />
        <Kpi
          label="日預算"
          value={budget > 0 ? fmtUsd(budget) : '不限'}
          hint={
            agent.budget_over
              ? '已超支'
              : agent.budget_remaining_usd != null
                ? `剩餘 ${fmtUsd(agent.budget_remaining_usd)}`
                : undefined
          }
        />
        <Kpi label="指定模型" value={agent.preferred_model || (TIER_LABEL[agent.default_tier] ?? agent.default_tier)} />
        <Kpi label="路由" value={ROUTING_LABEL[agent.routing_strategy || ''] ?? (agent.routing_strategy || '品質')} />
        <Kpi label="平均延遲" value={`${Math.round(m.avg_latency_ms ?? 0)} ms`} hint={`重試 ${m.retries ?? 0}`} />
        <Kpi label="Token" value={`${m.tokens_in ?? 0} / ${m.tokens_out ?? 0}`} hint="in / out" />
        <Kpi label="SLA 逾時" value={String(m.sla_breaches ?? 0)} hint={agent.sla_latency_ms ? `${agent.sla_latency_ms}ms` : '未設'} />
        <Kpi label="告警" value={agent.alert_on_error === false ? '錯誤關' : '錯誤開'} hint={agent.alert_on_budget === false ? '預算關' : '預算開'} />
        <Kpi label="狀態" value={agent.enabled === false ? '停用' : '啟用'} hint={agent.is_custom ? '自定義' : '內建'} />
        <Kpi label="分類" value={CATEGORY_LABEL[agent.category] ?? agent.category} hint={`L${agent.level} · P${agent.priority ?? 3}`} />
        <Kpi label="語言" value={agent.language || 'zh-TW'} hint={agent.always_require_review ? '一律審查' : '審查可選'} />
        <Kpi label="故障轉移" value={String(agent.failover_models?.length ?? 0)} hint={(agent.failover_models ?? []).slice(0, 2).join(' → ') || '未設'} />
        <Kpi label="允許工具" value={String(agent.tools_allowed?.length ?? 0)} hint={(agent.tools_allowed ?? []).slice(0, 2).join(' · ') || '未限'} />
      </div>
      {(agent.alerts?.length ?? 0) > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-amber-200/80">角色告警</p>
          {agent.alerts!.map((al, i) => (
            <p key={`${al.message}-${i}`} className="text-[11px] text-amber-100">
              {al.level} · {al.message}
            </p>
          ))}
        </div>
      )}
      {agent.system_prompt && (
        <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-[#62666d]">角色設定摘要</p>
          <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-[11px] leading-relaxed text-[#d0d6e0]">{agent.system_prompt}</p>
        </div>
      )}
    </div>
  );
}

function AgentDeskCard({
  agent,
  onOpen,
  showPrompt,
}: {
  agent: RoleAgent;
  onOpen: () => void;
  showPrompt?: boolean;
}) {
  const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
  const open = agentOpenCount(agent);
  const now = currentItem(agent);
  const preview = agent.work_items.slice(0, 4);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-full min-h-[220px] flex-col rounded-xl border bg-[#0f1011] p-3 text-left transition-colors hover:border-[#34343a] ${
        agent.status === 'busy'
          ? 'border-[#4cc38a]/30'
          : agent.status === 'error'
            ? 'border-red-500/30'
            : 'border-[#23252a]'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#141516] text-[11px] font-medium text-[#d0d6e0]">
            {agent.name.slice(0, 1)}
            <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${meta.dot}`} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-[#f7f8f8]">{agent.name} Agent</span>
            <span className={`block text-[10px] ${meta.text}`}>
              {meta.label}
              {agent.is_custom ? ' · 自定' : ''}
              {open > 0 ? ` · ${open} 項開放` : ''}
            </span>
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-[#62666d]">{fmtUsd(agent.cost_usd)}</span>
      </div>

      {showPrompt && (agent.description || agent.system_prompt) && (
        <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-[#8a8f98]">
          {agent.description || agent.system_prompt}
        </p>
      )}

      {now && (
        <p className="mb-2 truncate rounded bg-[#141516] px-2 py-1 text-[11px] text-[#d0d6e0]">
          正在處理 · {now.title}
        </p>
      )}

      <div className="mb-2 grid grid-cols-4 gap-1 text-center">
        {[
          ['佇列', agent.queue],
          ['執行', agent.executing],
          ['審查', agent.inbox.in_review ?? 0],
          ['完成', agent.done],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded bg-[#141516] px-1 py-1">
            <p className="font-mono text-[12px] text-[#f7f8f8]">{value}</p>
            <p className="text-[9px] text-[#62666d]">{label}</p>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1">
        {preview.length === 0 ? (
          <p className="rounded border border-dashed border-[#23252a] px-2 py-4 text-center text-[11px] text-[#62666d]">
            待命 · 尚無工作項
          </p>
        ) : (
          preview.map((item) => {
            const st = itemStatus(item.status);
            return (
              <div
                key={`${item.task_id}-${item.id}-${item.kind}`}
                className="flex items-center justify-between gap-2 rounded bg-[#141516] px-2 py-1"
              >
                <span className="min-w-0 truncate text-[11px] text-[#d0d6e0]">{item.title}</span>
                <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] ${st.cls}`}>{st.label}</span>
              </div>
            );
          })
        )}
        {agent.work_items.length > 4 && (
          <p className="text-[10px] text-[#62666d]">還有 {agent.work_items.length - 4} 項…</p>
        )}
      </div>
    </button>
  );
}

interface AgentsMonitorPanelProps {
  focusAgentId?: string | null;
  onFocusAgent?: (id: string | null) => void;
}

export default function AgentsMonitorPanel({ focusAgentId, onFocusAgent }: AgentsMonitorPanelProps) {
  const [data, setData] = useState<AgentMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(focusAgentId || 'manager');
  const [layout, setLayout] = useState<'desk' | 'floor' | 'catalog'>('catalog');
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemFilter, setItemFilter] = useState<string>('open');
  const [boardMode, setBoardMode] = useState<'list' | 'kanban'>('list');
  const [deskTab, setDeskTab] = useState<'tasks' | 'monitor' | 'settings' | 'org'>('tasks');
  const [query, setQuery] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'custom' | 'disabled'>('all');
  const [creating, setCreating] = useState(false);
  const [cloneFrom, setCloneFrom] = useState<RoleAgent | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  const [appliedDefaultTab, setAppliedDefaultTab] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAgentMonitor();
      setData(next);
      setError(null);
      setSelectedId((current) => pickDefaultAgentId(next.agents, focusAgentId || current));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [focusAgentId]);

  const pollMs = data?.monitor_prefs?.poll_interval_ms ?? 5000;

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), Math.max(2000, pollMs));
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  useEffect(() => {
    if (focusAgentId) {
      setSelectedId(focusAgentId);
      setLayout('desk');
    }
  }, [focusAgentId]);

  useEffect(() => {
    if (didAutoOpen || !data?.monitor_prefs?.auto_open_busy || focusAgentId) return;
    const busy = data.agents.find((a) => a.status === 'busy');
    if (busy) {
      setSelectedId(busy.id);
      setLayout('desk');
      setDidAutoOpen(true);
    }
  }, [data?.monitor_prefs?.auto_open_busy, data?.agents, focusAgentId, didAutoOpen]);

  useEffect(() => {
    if (appliedDefaultTab) return;
    const tab = data?.monitor_prefs?.default_desk_tab;
    if (tab === 'tasks' || tab === 'monitor' || tab === 'settings' || tab === 'org') {
      setDeskTab(tab);
      setAppliedDefaultTab(true);
    }
  }, [appliedDefaultTab, data?.monitor_prefs?.default_desk_tab]);

  const agents = data?.agents?.length ? data.agents : AGENT_FALLBACK_ROSTER;
  const summary = data?.summary;
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  const grouped = useMemo(() => {
    const matches = (a: RoleAgent) => {
      if (filter === 'active' && a.status === 'idle' && a.work_items.length === 0) return false;
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (rosterFilter === 'custom' && !a.is_custom) return false;
      if (rosterFilter === 'disabled' && a.enabled !== false) return false;
      if (data?.monitor_prefs?.show_disabled === false && a.enabled === false) return false;
      if (data?.monitor_prefs?.show_idle === false && a.status === 'idle') return false;
      if (data?.monitor_prefs?.show_custom_only && !a.is_custom) return false;
      const q = query.trim().toLowerCase();
      if (q) {
        const hay = `${a.name} ${a.id} ${a.category} ${a.responsibilities.join(' ')} ${a.system_prompt ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    };
    const rank = (list: RoleAgent[]) => {
      const key = data?.monitor_prefs?.sort_by || 'level';
      return [...list].sort((a, b) => {
        if (key === 'name') return a.name.localeCompare(b.name, 'zh-Hant');
        if (key === 'status') {
          const order: Record<string, number> = { busy: 0, error: 1, waiting: 2, idle: 3, disabled: 4 };
          return (order[a.status] ?? 9) - (order[b.status] ?? 9);
        }
        if (key === 'cost') return (b.cost_usd || 0) - (a.cost_usd || 0);
        if (key === 'queue') return agentOpenCount(b) - agentOpenCount(a);
        return a.id.localeCompare(b.id);
      });
    };
    if (data?.monitor_prefs?.group_by === 'category') {
      const cats = data?.catalog_meta?.categories?.length
        ? data.catalog_meta.categories
        : Object.entries(CATEGORY_LABEL).map(([id, label]) => ({ id, label }));
      return cats
        .map((c, idx) => ({
          level: idx,
          label: c.label,
          agents: rank(agents.filter((a) => a.category === c.id && matches(a))),
        }))
        .filter((g) => g.agents.length > 0);
    }
    const levels = data?.levels?.length
      ? data.levels
      : [
          { level: 0, label: '最高決策層' },
          { level: 1, label: '技術領導層' },
          { level: 2, label: '領域領導層' },
          { level: 3, label: '執行層' },
          { level: 4, label: '支援角色' },
        ];
    return levels
      .map((lv) => ({
        ...lv,
        agents: rank(agents.filter((a) => a.level === lv.level && matches(a))),
      }))
      .filter((g) => g.agents.length > 0);
  }, [agents, categoryFilter, data?.catalog_meta, data?.levels, data?.monitor_prefs, filter, query, rosterFilter]);

  const openDesk = (id: string) => {
    setSelectedId(id);
    onFocusAgent?.(id);
    setExpandedId(null);
    setLayout('desk');
  };

  const visibleItems = useMemo(() => {
    if (!selected) return [];
    const filterDef = LIST_FILTERS.find((f) => f.key === itemFilter);
    let items = selected.work_items;
    if (filterDef?.statuses) {
      items = items.filter((i) => filterDef.statuses!.includes(i.status));
    } else if (itemFilter === 'assigned') {
      items = items.filter((i) => i.kind === 'assigned');
    } else if (itemFilter === 'review') {
      items = items.filter((i) => i.kind === 'review' || i.status === 'in_review');
    }
    return items;
  }, [itemFilter, selected]);

  const inboxReview = selected?.inbox.in_review ?? 0;
  const now = selected ? currentItem(selected) : null;
  const reports = selected?.direct_reports ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#010102] text-[#f7f8f8]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#23252a] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">
            {layout === 'desk' && selected
              ? `${selected.name} Agent`
              : layout === 'catalog'
                ? `角色目錄 · ${agents.length}`
                : '角色 Agent 樓層'}
          </h2>
          <p className="mt-0.5 text-[11px] text-[#8a8f98]">
            {layout === 'desk' && selected
              ? `L${selected.level} ${selected.level_label} · 本角色獨立任務列表、角色設定與監控`
              : layout === 'catalog'
                ? '全部內建／自定義角色 · 點擊進入工作台或直接編輯角色設定'
                : '每位角色一張工作台 · 點擊進入該 Agent 介面'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[#23252a] bg-[#0f1011] p-0.5">
            <button
              type="button"
              onClick={() => setLayout('catalog')}
              className={`rounded px-2 py-1 text-[11px] ${
                layout === 'catalog' ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
              }`}
            >
              目錄
            </button>
            <button
              type="button"
              onClick={() => setLayout('desk')}
              className={`rounded px-2 py-1 text-[11px] ${
                layout === 'desk' ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
              }`}
            >
              工作台
            </button>
            <button
              type="button"
              onClick={() => setLayout('floor')}
              className={`rounded px-2 py-1 text-[11px] ${
                layout === 'floor' ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
              }`}
            >
              樓層
            </button>
          </div>
          {layout !== 'desk' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋角色／職責／提示詞"
                className="w-40 rounded-md border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#f7f8f8]"
              />
              <button
                type="button"
                onClick={() => setFilter((v) => (v === 'all' ? 'active' : 'all'))}
                className={`rounded-md border px-2 py-1 text-[11px] ${
                  filter === 'active'
                    ? 'border-[#5e6ad2]/40 bg-[#5e6ad2]/15 text-[#828fff]'
                    : 'border-[#23252a] bg-[#0f1011] text-[#8a8f98]'
                }`}
              >
                {filter === 'active' ? '僅顯示有工作' : '顯示全部角色'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setCloneFrom(null);
              setCreating(true);
            }}
            className="rounded-md border border-[#5e6ad2]/40 bg-[#5e6ad2]/15 px-2 py-1 text-[11px] text-[#828fff]"
          >
            新增角色
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
          >
            重新整理
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error} · 已顯示角色目錄，後端恢復後會自動帶入任務
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2 px-4 py-3 lg:grid-cols-7">
        <Kpi label="角色" value={String(summary?.roles_total ?? agents.length)} hint={`啟用 ${summary?.roles_enabled ?? agents.length}`} />
        <Kpi label="執行中" value={String(summary?.roles_busy ?? 0)} hint="busy Agent" />
        <Kpi label="等待" value={String(summary?.roles_waiting ?? 0)} hint="佇列 / 審查" />
        <Kpi label="自定義" value={String(summary?.roles_custom ?? 0)} hint={`停用 ${summary?.roles_disabled ?? 0}`} />
        <Kpi label="告警" value={String(summary?.alerts_open ?? 0)} hint="角色告警數" />
        <Kpi label="開放工作項" value={String(summary?.work_items_open ?? 0)} hint="未完成" />
        <Kpi
          label="花費"
          value={fmtUsd(summary?.total_cost_usd ?? 0)}
          hint={`完成 ${summary?.work_items_done ?? 0}`}
        />
      </div>

      {layout === 'floor' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {grouped.map((group) => (
            <section key={group.level} className="mb-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#62666d]">
                {data?.monitor_prefs?.group_by === 'category' ? group.label : `L${group.level} ${group.label}`}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {group.agents.map((agent) => (
                  <AgentDeskCard
                    key={agent.id}
                    agent={agent}
                    showPrompt={data?.monitor_prefs?.show_prompt_preview !== false}
                    onOpen={() => openDesk(agent.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {layout === 'catalog' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#d0d6e0]"
            >
              <option value="all">全部分類</option>
              {(data?.catalog_meta?.categories ?? Object.entries(CATEGORY_LABEL).map(([id, label]) => ({ id, label }))).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {(['all', 'custom', 'disabled'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRosterFilter(key)}
                className={`rounded px-2 py-1 text-[11px] ${
                  rosterFilter === key ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
                }`}
              >
                {key === 'all' ? '全部' : key === 'custom' ? '自定義' : '停用'}
              </button>
            ))}
            <select
              value={data?.monitor_prefs?.sort_by || 'level'}
              onChange={(e) => void updateAgentMonitorPrefs({ sort_by: e.target.value }).then(() => refresh())}
              className="rounded border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#d0d6e0]"
            >
              <option value="level">依層級</option>
              <option value="name">依名稱</option>
              <option value="status">依狀態</option>
              <option value="cost">依花費</option>
              <option value="queue">依佇列</option>
            </select>
          </div>
          {grouped.map((group) => (
            <section key={`${group.level}-${group.label}`} className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#62666d]">
                {data?.monitor_prefs?.group_by === 'category' ? group.label : `L${group.level} ${group.label}`}
                <span className="ml-2 font-mono">{group.agents.length}</span>
              </p>
              <div className="overflow-hidden rounded-lg border border-[#23252a]">
                {group.agents.map((agent) => {
                  const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
                  const open = agentOpenCount(agent);
                  return (
                    <div
                      key={agent.id}
                      className={`flex flex-wrap items-start gap-3 border-b border-[#23252a] px-3 py-2 last:border-0 ${
                        data?.monitor_prefs?.highlight_alerts !== false && (agent.alerts?.length ?? 0) > 0
                          ? 'bg-amber-500/5'
                          : 'bg-[#0f1011]'
                      }`}
                    >
                      <button type="button" className="min-w-[180px] flex-1 text-left" onClick={() => openDesk(agent.id)}>
                        <p className="flex items-center gap-2 text-[13px] text-[#f7f8f8]">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {agent.name}
                          {agent.is_custom ? <span className="text-[10px] text-[#828fff]">自定</span> : null}
                          {agent.enabled === false ? <span className="text-[10px] text-red-300">停用</span> : null}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-[#8a8f98]">
                          {agent.description || agent.responsibilities[0] || agent.system_prompt || '尚無角色設定摘要'}
                        </p>
                      </button>
                      <div className="w-28 shrink-0 text-[10px] text-[#8a8f98]">
                        <p>{CATEGORY_LABEL[agent.category] ?? agent.category}</p>
                        <p className="font-mono">{agent.preferred_model || (TIER_LABEL[agent.default_tier] ?? agent.default_tier)}</p>
                      </div>
                      <div className="w-24 shrink-0 text-right font-mono text-[11px] text-[#d0d6e0]">
                        <p>{open} 開放</p>
                        <p className="text-[10px] text-[#8a8f98]">{fmtUsd(agent.cost_usd)}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="rounded border border-[#23252a] px-2 py-1 text-[10px] text-[#8a8f98]"
                          onClick={() => {
                            openDesk(agent.id);
                            setDeskTab('settings');
                          }}
                        >
                          角色設定
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#23252a] px-2 py-1 text-[10px] text-[#8a8f98]"
                          onClick={() => {
                            openDesk(agent.id);
                            setDeskTab('monitor');
                          }}
                        >
                          監控
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#23252a] px-2 py-1 text-[10px] text-[#8a8f98]"
                          onClick={() => void updateAgentSettings(agent.id, { enabled: agent.enabled === false }).then(() => refresh())}
                        >
                          {agent.enabled === false ? '啟用' : '停用'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {layout === 'desk' && selected && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="hidden w-56 shrink-0 flex-col overflow-hidden border-r border-[#23252a] xl:flex">
            <div className="shrink-0 space-y-1 border-b border-[#23252a] p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋角色 / 職責 / 提示詞"
                className="w-full rounded-md border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#f7f8f8]"
              />
              <div className="flex flex-wrap gap-1">
                {(['all', 'custom', 'disabled'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRosterFilter(key)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      rosterFilter === key ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98]'
                    }`}
                  >
                    {key === 'all' ? '全部' : key === 'custom' ? '自定義' : '停用'}
                  </button>
                ))}
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded border border-[#23252a] bg-[#0f1011] px-1.5 py-1 text-[10px] text-[#d0d6e0]"
              >
                <option value="all">全部分類</option>
                {(data?.catalog_meta?.categories ?? Object.entries(CATEGORY_LABEL).map(([id, label]) => ({ id, label }))).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {grouped.map((group) => (
              <div key={group.level} className="mb-3">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#62666d]">
                  {data?.monitor_prefs?.group_by === 'category' ? group.label : `L${group.level} ${group.label}`}
                </p>
                <div className="space-y-0.5">
                  {group.agents.map((agent) => {
                    const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
                    const active = agent.id === selected.id;
                    const count = agentOpenCount(agent);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => openDesk(agent.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                          active
                            ? 'border border-[#5e6ad2]/40 bg-[#5e6ad2]/10'
                            : 'border border-transparent hover:bg-[#141516]'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#f7f8f8]">
                          {agent.name}
                          {agent.is_custom ? ' ·自定' : ''}
                        </span>
                        {count > 0 && (
                          <span className="font-mono text-[10px] text-[#8a8f98]">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-[#23252a] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{selected.name} Agent</h3>
                    <span className={`text-[11px] ${(AGENT_STATUS_META[selected.status] ?? AGENT_STATUS_META.idle).text}`}>
                      {(AGENT_STATUS_META[selected.status] ?? AGENT_STATUS_META.idle).label}
                    </span>
                    <select
                      value={selected.id}
                      onChange={(e) => openDesk(e.target.value)}
                      className="rounded border border-[#23252a] bg-[#0f1011] px-2 py-0.5 text-[11px] text-[#d0d6e0] xl:hidden"
                    >
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-[11px] text-[#8a8f98]">
                    L{selected.level} {selected.level_label}
                    {selected.is_custom ? ' · 自定義' : ' · 內建'}
                    {selected.enabled === false ? ' · 停用' : ''}
                    {selected.reporting_to ? ` · 匯報 ${roleLabel(selected.reporting_to)}` : ' · 無上級'}
                    {reports.length > 0 ? ` · 直屬 ${reports.length}` : ''}
                    {' · '}並行 {selected.capacity_used ?? selected.executing}/{selected.max_parallel_work}
                    {' · '}
                    {selected.preferred_model || (TIER_LABEL[selected.default_tier] ?? selected.default_tier)}
                  </p>
                  {selected.templates.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selected.templates.map((tpl) => (
                        <span
                          key={tpl}
                          className="rounded border border-[#23252a] px-1.5 py-0.5 text-[10px] text-[#8a8f98]"
                        >
                          {tpl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="font-mono text-[11px] text-[#62666d]">
                  最近活動 {fmtWhen(selected.last_activity_at)}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="佇列" value={String(selected.queue)} hint="planning + ready" />
                <Kpi label="執行中" value={String(selected.executing)} />
                <Kpi label="審查中" value={String(inboxReview)} />
                <Kpi label="完成" value={String(selected.done)} />
                <Kpi label="花費" value={fmtUsd(selected.cost_usd)} hint={`阻塞 ${selected.blocked}`} />
                <Kpi
                  label="成功率"
                  value={`${selected.metrics?.success_rate ?? 0}%`}
                  hint={`容量 ${selected.capacity_used ?? selected.executing}/${selected.max_parallel_work}`}
                />
              </div>
              <div className="mt-3 flex gap-1">
                {([
                  ['tasks', '任務'],
                  ['monitor', '監控'],
                  ['settings', '角色設定'],
                  ['org', '組織'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDeskTab(key)}
                    className={`rounded px-2 py-1 text-[11px] ${
                      deskTab === key ? 'bg-[#5e6ad2]/20 text-[#828fff]' : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {deskTab === 'settings' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <RoleSettingsPanel
                  agent={selected}
                  catalog={data?.catalog_meta}
                  agents={agents}
                  saving={saving}
                  error={saveError}
                  onClone={() => {
                    setCloneFrom(selected);
                    setCreating(true);
                  }}
                  onSave={async (draft: RoleSettingsDraft) => {
                    setSaving(true);
                    setSaveError(null);
                    try {
                      await updateAgentSettings(selected.id, draftToPayload(draft));
                      await refresh();
                    } catch (err) {
                      setSaveError((err as Error).message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  onReset={
                    selected.is_custom
                      ? undefined
                      : async () => {
                          setSaving(true);
                          setSaveError(null);
                          try {
                            await resetAgentSettings(selected.id);
                            await refresh();
                          } catch (err) {
                            setSaveError((err as Error).message);
                          } finally {
                            setSaving(false);
                          }
                        }
                  }
                  onDelete={
                    selected.is_custom
                      ? async () => {
                          if (!window.confirm(`確定刪除「${selected.name}」？`)) return;
                          setSaving(true);
                          setSaveError(null);
                          try {
                            await deleteCustomAgent(selected.id);
                            setSelectedId('manager');
                            await refresh();
                          } catch (err) {
                            setSaveError((err as Error).message);
                          } finally {
                            setSaving(false);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            )}
            {deskTab === 'org' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#62666d]">匯報對象</p>
                    {selected.reporting_to ? (
                      <RoleChips ids={[selected.reporting_to]} onOpen={openDesk} />
                    ) : (
                      <p className="text-[11px] text-[#8a8f98]">無上級（決策層）</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#62666d]">直屬下級 · {reports.length}</p>
                    <RoleChips ids={reports} onOpen={openDesk} />
                  </div>
                  <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#62666d]">可委派 · {selected.can_delegate_to.length}</p>
                    <RoleChips ids={selected.can_delegate_to} onOpen={openDesk} />
                  </div>
                  <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-[#62666d]">組織模板</p>
                    {(data?.catalog_meta?.org_templates ?? []).map((tpl) => (
                      <p key={tpl.id} className="text-[11px] text-[#d0d6e0]">
                        {tpl.name} · {tpl.role_count} 角色 · {tpl.description}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {deskTab === 'monitor' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <RoleDeepMonitor agent={selected} />
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">角色監控</p>
                  <RoleMonitorExtras agent={selected} />
                </div>
                <div className="mt-4 rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#62666d]">監控偏好</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() => void updateAgentMonitorPrefs({ poll_interval_ms: pollMs === 5000 ? 8000 : 5000 }).then(() => refresh())}
                    >
                      輪詢 {pollMs / 1000}s
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({ show_idle: !(data?.monitor_prefs?.show_idle ?? true) }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.show_idle === false ? '顯示待命' : '隱藏待命'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({ show_disabled: !(data?.monitor_prefs?.show_disabled ?? true) }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.show_disabled === false ? '顯示停用' : '隱藏停用'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({
                          show_custom_only: !(data?.monitor_prefs?.show_custom_only ?? false),
                        }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.show_custom_only ? '顯示全部角色' : '僅自定義'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({
                          group_by: data?.monitor_prefs?.group_by === 'category' ? 'level' : 'category',
                        }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.group_by === 'category' ? '依層級分組' : '依分類分組'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({ compact_cards: !(data?.monitor_prefs?.compact_cards ?? false) }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.compact_cards ? '一般卡片' : '緊湊卡片'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({
                          show_prompt_preview: !(data?.monitor_prefs?.show_prompt_preview ?? true),
                        }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.show_prompt_preview === false ? '顯示角色設定摘要' : '隱藏角色設定摘要'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({
                          highlight_alerts: !(data?.monitor_prefs?.highlight_alerts ?? true),
                        }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.highlight_alerts === false ? '突顯告警' : '取消突顯告警'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-[#23252a] px-2 py-1 text-[11px] text-[#8a8f98]"
                      onClick={() =>
                        void updateAgentMonitorPrefs({
                          auto_open_busy: !(data?.monitor_prefs?.auto_open_busy ?? false),
                        }).then(() => refresh())
                      }
                    >
                      {data?.monitor_prefs?.auto_open_busy ? '關閉自動切入忙碌' : '忙碌時自動切入'}
                    </button>
                    <select
                      value={data?.monitor_prefs?.sort_by || 'level'}
                      onChange={(e) => void updateAgentMonitorPrefs({ sort_by: e.target.value }).then(() => refresh())}
                      className="rounded border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#d0d6e0]"
                    >
                      <option value="level">排序：層級</option>
                      <option value="name">排序：名稱</option>
                      <option value="status">排序：狀態</option>
                      <option value="cost">排序：花費</option>
                      <option value="queue">排序：佇列</option>
                    </select>
                    <select
                      value={data?.monitor_prefs?.default_desk_tab || 'tasks'}
                      onChange={(e) => void updateAgentMonitorPrefs({ default_desk_tab: e.target.value }).then(() => refresh())}
                      className="rounded border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#d0d6e0]"
                    >
                      <option value="tasks">預設分頁：任務</option>
                      <option value="monitor">預設分頁：監控</option>
                      <option value="settings">預設分頁：角色設定</option>
                      <option value="org">預設分頁：組織</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {deskTab === 'tasks' && (
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
              <div className="flex min-h-0 flex-col overflow-hidden border-b border-[#23252a] xl:border-b-0 xl:border-r">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
                    任務列表 · {visibleItems.length}/{selected.work_items.length}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {LIST_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setItemFilter(f.key)}
                        className={`rounded px-2 py-0.5 text-[10px] ${
                          itemFilter === f.key
                            ? 'bg-[#5e6ad2]/20 text-[#828fff]'
                            : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBoardMode((v) => (v === 'list' ? 'kanban' : 'list'))}
                      className="ml-1 rounded border border-[#23252a] px-2 py-0.5 text-[10px] text-[#8a8f98]"
                    >
                      {boardMode === 'list' ? '看板' : '列表'}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {boardMode === 'list' ? (
                    visibleItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#23252a] px-4 py-10 text-center">
                        <p className="text-[13px] text-[#d0d6e0]">尚無{itemFilter === 'all' ? '' : '符合條件的'}工作項</p>
                        <p className="mt-1 text-[11px] text-[#62666d]">
                          此 Agent 待命。公司任務分解後，指派給「{selected.name}」的工作會出現在此列表。
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {visibleItems.map((item) => (
                          <WorkItemCard
                            key={`${item.task_id}-${item.id}-${item.kind}`}
                            item={item}
                            expanded={expandedId === `${item.task_id}-${item.id}-${item.kind}`}
                            onToggle={() =>
                              setExpandedId((cur) => {
                                const key = `${item.task_id}-${item.id}-${item.kind}`;
                                return cur === key ? null : key;
                              })
                            }
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="grid min-h-[220px] grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-4">
                      {KANBAN.map((col) => {
                        const list = visibleItems.filter((i) => col.statuses.includes(i.status));
                        return (
                          <div key={col.key} className="flex min-h-0 flex-col rounded-lg border border-[#23252a] bg-[#0a0b0c] p-2">
                            <p className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#62666d]">
                              {col.label}
                              <span className="font-mono">{list.length}</span>
                            </p>
                            <div className="space-y-1.5">
                              {list.length === 0 ? (
                                <p className="py-6 text-center text-[11px] text-[#62666d]">空</p>
                              ) : (
                                list.map((item) => (
                                  <WorkItemCard
                                    key={`${item.task_id}-${item.id}-${item.kind}`}
                                    item={item}
                                    compact
                                    expanded={expandedId === `${item.task_id}-${item.id}-${item.kind}`}
                                    onToggle={() =>
                                      setExpandedId((cur) => {
                                        const key = `${item.task_id}-${item.id}-${item.kind}`;
                                        return cur === key ? null : key;
                                      })
                                    }
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-0 space-y-4 overflow-y-auto p-4">
                {now && (
                  <div className="rounded-lg border border-[#5e6ad2]/30 bg-[#5e6ad2]/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#828fff]">目前任務</p>
                    <p className="mt-0.5 text-[13px] text-[#f7f8f8]">{now.title}</p>
                    <p className="text-[11px] text-[#8a8f98]">{now.task_query || now.task_id}</p>
                    {now.description && (
                      <p className="mt-1 text-[11px] leading-relaxed text-[#d0d6e0]">{now.description}</p>
                    )}
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
                    角色監控
                  </p>
                  <RoleMonitorExtras agent={selected} />
                </div>

                {(selected.company_tasks?.length ?? 0) > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
                      經手公司任務
                    </p>
                    <div className="space-y-1 rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                      {(selected.company_tasks ?? []).map((t) => (
                        <div key={t.task_id} className="flex items-center justify-between gap-2 py-1">
                          <span className="min-w-0 truncate text-[11px] text-[#d0d6e0]">{t.query}</span>
                          <span className="shrink-0 font-mono text-[10px] text-[#8a8f98]">{t.status || t.phase}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
                    事件時間軸 · {selected.events.length}
                  </p>
                  <div className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-1">
                    {selected.events.length === 0 ? (
                      <p className="py-4 text-center text-[11px] text-[#62666d]">尚無此角色事件</p>
                    ) : (
                      selected.events.map((ev, i) => (
                        <EventRow key={`${ev.ts}-${ev.event}-${i}`} event={ev} />
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">組織</p>
                  <div className="space-y-2 rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    <div>
                      <p className="text-[10px] text-[#62666d]">匯報對象</p>
                      {selected.reporting_to ? (
                        <RoleChips ids={[selected.reporting_to]} onOpen={openDesk} />
                      ) : (
                        <p className="text-[11px] text-[#8a8f98]">無上級（決策層）</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[#62666d]">直屬下級</p>
                      <RoleChips ids={reports} onOpen={openDesk} />
                    </div>
                    {selected.can_delegate_to.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#62666d]">可委派</p>
                        <RoleChips ids={selected.can_delegate_to} onOpen={openDesk} />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">職責 / 角色設定</p>
                  <ul className="space-y-1.5 rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-2">
                    {selected.responsibilities.map((line) => (
                      <li key={line} className="text-[11px] leading-relaxed text-[#d0d6e0]">
                        {line}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-2 text-[11px] text-[#828fff]"
                    onClick={() => setDeskTab('settings')}
                  >
                    編輯完整角色設定
                  </button>
                </div>
              </div>
            </div>
            )}
          </section>
        </div>
      )}
      {creating && (
        <CreateRoleModal
          catalog={data?.catalog_meta}
          agents={agents}
          cloneFrom={cloneFrom}
          onClose={() => {
            setCreating(false);
            setCloneFrom(null);
          }}
          onCreate={async (payload) => {
            const created = await createCustomAgent(payload);
            await refresh();
            openDesk(created.id);
            setDeskTab('settings');
          }}
        />
      )}
    </div>
  );
}
