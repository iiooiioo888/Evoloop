/**
 * MonitorOverview — 監控總覽（精簡版）。
 * 少數 KPI 入口 + 三欄即時摘要，避免資訊堆疊。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  fetchAgentMonitor,
  fetchCloudBilling,
  fetchDashboard,
  fetchHubMonitor,
  fetchLlmOps,
  fetchOptimizationMonitor,
} from '../api/client';
import { AGENT_FALLBACK_ROSTER, HUB_FALLBACK_MODELS } from '../lib/monitorFallbacks';
import { buildAnimLiveFeed } from '../lib/animLive';
import type {
  AgentMonitorData,
  CloudBilling,
  DashboardData,
  HubMonitorData,
  LlmOpsData,
  OptimizationMonitorData,
} from '../types';
import type { MonitorTab } from './AppShell';

interface MonitorOverviewProps {
  onOpenTab: (tab: MonitorTab, agentId?: string) => void;
}

function Kpi({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="apple-card apple-card--tight apple-card--pad text-left transition-colors hover:border-white/15"
    >
      <p className="apple-title">{label}</p>
      <p className="apple-data mt-3 text-[24px] leading-none text-[#F5F5F7]">{value}</p>
    </button>
  );
}

function Section({
  title,
  onAction,
  children,
}: {
  title: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <section className="apple-card">
      <div className="apple-card__head">
        <p className="apple-title">{title}</p>
        <button type="button" className="text-[11px] font-bold text-[#007AFF]" onClick={onAction}>
          開啟
        </button>
      </div>
      <div className="apple-card__body apple-card__body--static">{children}</div>
    </section>
  );
}

function Row({
  left,
  right,
  tone,
}: {
  left: string;
  right: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
      <span className="min-w-0 truncate text-[12px] font-normal text-[#F5F5F7]">{left}</span>
      <span className={`shrink-0 font-mono text-[11px] ${tone ?? 'text-[#8E8E93]'}`}>{right}</span>
    </div>
  );
}

export default function MonitorOverview({ onOpenTab }: MonitorOverviewProps) {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [hub, setHub] = useState<HubMonitorData | null>(null);
  const [agents, setAgents] = useState<AgentMonitorData | null>(null);
  const [billing, setBilling] = useState<CloudBilling | null>(null);
  const [llmOps, setLlmOps] = useState<LlmOpsData | null>(null);
  const [optimization, setOptimization] = useState<OptimizationMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, h, a, b, llm, opt] = await Promise.all([
        fetchDashboard().catch(() => null),
        fetchHubMonitor().catch(() => null),
        fetchAgentMonitor().catch(() => null),
        fetchCloudBilling().catch(() => null),
        fetchLlmOps().catch(() => null),
        fetchOptimizationMonitor().catch(() => null),
      ]);
      setDash(d);
      setHub(h);
      setAgents(a);
      setBilling(b);
      setLlmOps(llm);
      setOptimization(opt);
      const missing = [!d && '控制面版', !opt && '系統指標', !h && 'Hub', !a && 'Agent'].filter(Boolean);
      setError(missing.length ? `部分來源不可達：${missing.join('、')}` : null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  const hubModels = hub?.models && hub.models.length > 0 ? hub.models : HUB_FALLBACK_MODELS;
  const hitPct = Math.round((hub?.cache.hit_rate ?? 0) * 100);
  const optHitPct = Math.round((optimization?.llm_cache.hit_rate ?? 0) * 100);
  const sysSuccess = optimization?.system_stats?.success_rate ?? 0;
  const roster = agents?.agents?.length ? agents.agents : AGENT_FALLBACK_ROSTER;
  const busyCount =
    (agents?.summary.roles_busy ?? 0) + (agents?.summary.roles_waiting ?? 0);
  const liveFeed = buildAnimLiveFeed({
    agents,
    optimization,
    billing,
    llmOps,
  });
  const busyAgents = roster
    .filter((a) => a.status === 'busy' || a.status === 'waiting' || a.status === 'error')
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain apple-canvas p-6 text-[#F5F5F7] sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="apple-heading text-[17px]">總覽</h2>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-3 py-1.5 text-[11px] text-[#8E8E93] hover:text-[#F5F5F7]"
        >
          重新整理
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-3 py-2 text-[12px] text-[#FF3B30]">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="即時"
          value={liveFeed.live ? 'LIVE' : 'IDLE'}
          onClick={() => onOpenTab('live')}
        />
        <Kpi
          label="任務"
          value={`${dash?.stats.tasks_running ?? 0}/${dash?.stats.tasks_total ?? 0}`}
          onClick={() => onOpenTab('tasks')}
        />
        <Kpi
          label="成功率"
          value={`${dash?.stats.success_rate ?? 0}%`}
          onClick={() => onOpenTab('tasks')}
        />
        <Kpi
          label="Agent"
          value={`${busyCount}/${roster.length}`}
          onClick={() => onOpenTab('agents')}
        />
        <Kpi
          label="系統指標"
          value={`${optHitPct}%`}
          onClick={() => onOpenTab('metrics')}
        />
        <Kpi label="Hub" value={`${hitPct}%`} onClick={() => onOpenTab('ops')} />
        <Kpi
          label="今日費用"
          value={billing ? `$${billing.today_total.toFixed(2)}` : '—'}
          onClick={() => onOpenTab('ops')}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="角色" onAction={() => onOpenTab('agents')}>
          {busyAgents.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-[#636366]">全員待命</p>
          ) : (
            busyAgents.map((agent) => {
              const open =
                agent.queue + agent.executing + (agent.inbox.in_review ?? 0) + agent.blocked;
              const tone =
                agent.status === 'busy'
                  ? 'text-[#34C759]'
                  : agent.status === 'error'
                    ? 'text-[#FF3B30]'
                    : 'text-[#FF9500]';
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onOpenTab('agents', agent.id)}
                  className="flex w-full items-center justify-between gap-2 border-b border-white/[0.06] py-2.5 text-left last:border-0"
                >
                  <span className="truncate text-[12px] font-bold text-[#F5F5F7]">{agent.name}</span>
                  <span className={`font-mono text-[11px] ${tone}`}>
                    {open > 0 ? `${open}` : agent.status}
                  </span>
                </button>
              );
            })
          )}
        </Section>

        <Section title="Hub" onAction={() => onOpenTab('ops')}>
          {hubModels.slice(0, 6).map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2">
              <span className="w-28 truncate text-[12px] text-[#F5F5F7]">{m.id}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-[#007AFF]"
                  style={{
                    width: `${Math.min(100, ((Number(m.latency_ewma_ms) || 0) / 15000) * 100)}%`,
                  }}
                />
              </div>
              <span className="w-12 text-right font-mono text-[10px] text-[#8E8E93]">
                {Math.round(Number(m.latency_ewma_ms) || 0)}
              </span>
            </div>
          ))}
        </Section>

        <Section title="系統指標" onAction={() => onOpenTab('metrics')}>
          {[
            { left: 'LLM 快取命中', right: `${optHitPct}%` },
            { left: '任務成功率', right: `${sysSuccess}%` },
            { left: 'Trace 筆數', right: String(optimization?.trace.trace_count ?? 0) },
            { left: '路由門檻', right: String(optimization?.routing_feedback.adaptive_length_threshold ?? '—') },
            { left: '反思門檻', right: String(optimization?.reflection.pass_threshold ?? 8) },
            { left: '滿意度', right: `${Math.round((optimization?.user_feedback?.satisfaction_rate ?? 0) * 100)}%` },
          ].map((row) => (
            <Row key={row.left} left={row.left} right={row.right} />
          ))}
        </Section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="任務" onAction={() => onOpenTab('pipeline')}>
          {(dash?.tasks.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-[12px] text-[#636366]">尚無任務</p>
          ) : (
            (dash?.tasks ?? []).slice(0, 5).map((t) => (
              <Row
                key={t.task_id}
                left={t.query || t.task_id.slice(0, 8)}
                right={t.status}
                tone={
                  t.status === 'completed'
                    ? 'text-[#34C759]'
                    : t.status === 'failed'
                      ? 'text-[#FF3B30]'
                      : 'text-[#FF9500]'
                }
              />
            ))
          )}
        </Section>

        <Section title="優化路線圖" onAction={() => onOpenTab('metrics')}>
          {(optimization?.roadmap.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-[12px] text-[#636366]">尚無資料</p>
          ) : (
            (optimization?.roadmap ?? []).slice(0, 5).map((row) => (
              <Row
                key={row.id}
                left={`${row.priority} ${row.label}`}
                right={row.metric ?? row.status}
                tone={row.status === 'active' ? 'text-[#34C759]' : 'text-[#8E8E93]'}
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
