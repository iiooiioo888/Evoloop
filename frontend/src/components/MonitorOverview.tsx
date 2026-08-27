/**
 * MonitorOverview — 監控中心總覽。
 *
 * 把控制面版、OPC、Hub、雲端、記憶、檢查點攤在同一頁，避免空殼分頁。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  fetchAgentMonitor,
  fetchCheckpoints,
  fetchCloudBilling,
  fetchCloudEvents,
  fetchCloudMonitoringLatest,
  fetchDashboard,
  fetchDockerStatus,
  fetchHubMonitor,
  fetchLlmOps,
  fetchMemories,
  fetchOpcMonitor,
  fetchOptimizationMonitor,
} from '../api/client';
import { AGENT_FALLBACK_ROSTER, HUB_FALLBACK_MODELS, OPC_FALLBACK_CATALOG } from '../lib/monitorFallbacks';
import { buildAnimLiveFeed } from '../lib/animLive';
import type {
  AgentMonitorData,
  CheckpointSummary,
  CloudBilling,
  CloudEvent,
  DashboardData,
  DockerStatus,
  HubMonitorData,
  LlmOpsData,
  OpcMonitorData,
  OptimizationMonitorData,
} from '../types';
import type { MonitorTab } from './AppShell';
import { RoadmapTable } from './ChatMonitorCards';
import AnimTheater from './AnimTheater';

interface MonitorOverviewProps {
  onOpenTab: (tab: MonitorTab, agentId?: string) => void;
}

function Kpi({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[#23252a] bg-[#0f1011] px-3 py-3 text-left transition-colors hover:border-[#34343a]"
    >
      <p className="text-[10px] uppercase tracking-wider text-[#62666d]">{label}</p>
      <p className="mt-1 font-mono text-xl text-[#f7f8f8]">{value}</p>
      <p className="mt-1 text-[11px] text-[#8a8f98]">{hint}</p>
    </button>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#23252a] bg-[#0f1011] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">{title}</p>
        <button className="text-[11px] text-[#828fff]" onClick={onAction}>
          {action}
        </button>
      </div>
      {children}
    </section>
  );
}

export default function MonitorOverview({ onOpenTab }: MonitorOverviewProps) {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [opc, setOpc] = useState<OpcMonitorData | null>(null);
  const [hub, setHub] = useState<HubMonitorData | null>(null);
  const [agents, setAgents] = useState<AgentMonitorData | null>(null);
  const [billing, setBilling] = useState<CloudBilling | null>(null);
  const [docker, setDocker] = useState<DockerStatus | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [cloudLatest, setCloudLatest] = useState<string>('');
  const [llmOps, setLlmOps] = useState<LlmOpsData | null>(null);
  const [optimization, setOptimization] = useState<OptimizationMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, o, h, a, b, latest, dock, ev, cp, mem, llm, opt] = await Promise.all([
        fetchDashboard().catch(() => null),
        fetchOpcMonitor().catch(() => null),
        fetchHubMonitor().catch(() => null),
        fetchAgentMonitor().catch(() => null),
        fetchCloudBilling().catch(() => null),
        fetchCloudMonitoringLatest().catch(() => null),
        fetchDockerStatus().catch(() => null),
        fetchCloudEvents(12).catch(() => ({ events: [] as CloudEvent[] })),
        fetchCheckpoints().catch(() => ({ checkpoints: [] as CheckpointSummary[] })),
        fetchMemories(1, 0).catch(() => ({ total: 0 })),
        fetchLlmOps().catch(() => null),
        fetchOptimizationMonitor().catch(() => null),
      ]);
      setDash(d);
      setOpc(o);
      setHub(h);
      setAgents(a);
      setBilling(b);
      setDocker(dock);
      setEvents(ev?.events ?? []);
      setCheckpoints(cp?.checkpoints ?? []);
      setMemoryCount(mem?.total ?? 0);
      setLlmOps(llm);
      setOptimization(opt);
      const services = latest?.services ? Object.keys(latest.services) : [];
      setCloudLatest(services.length ? `${services.length} 個服務採樣` : '尚無資源採樣');
      const missing = [
        !d && '控制面版',
        !o && 'OPC',
        !h && 'Hub',
        !a && '角色 Agent',
      ].filter(Boolean);
      setError(missing.length ? `部分監控來源不可達：${missing.join('、')}（請確認後端已重啟並含 /monitor 路由）` : null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  const opcOk = Boolean(opc?.live.reachable && opc.live.health?.opc_connected);
  const hubModels = hub?.models && hub.models.length > 0 ? hub.models : HUB_FALLBACK_MODELS;
  const opcCatalog =
    opc?.catalog && opc.catalog.length > 0 ? opc.catalog : OPC_FALLBACK_CATALOG;
  const hitPct = Math.round((hub?.cache.hit_rate ?? 0) * 100);
  const llmCachePct = Math.round((optimization?.llm_cache.hit_rate ?? 0) * 100);
  const openCircuits = hubModels.filter((m) => m.circuit.state === 'OPEN').length;
  const dockerHealthy = docker?.health
    ? Object.values(docker.health.services || {}).filter((s) => s.healthy).length
    : 0;
  const dockerTotal = docker?.health ? Object.keys(docker.health.services || {}).length : 0;
  const roster = agents?.agents?.length ? agents.agents : AGENT_FALLBACK_ROSTER;
  const busyAgents = roster.filter((a) => a.status === 'busy' || a.status === 'waiting' || a.status === 'error');
  const overviewRoster = [...busyAgents, ...roster.filter((a) => !busyAgents.includes(a))];
  const liveFeed = useMemo(
    () =>
      buildAnimLiveFeed({
        agents,
        optimization,
        opc,
        billing,
        llmOps,
      }),
    [agents, optimization, opc, billing, llmOps],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#010102] p-4 text-[#f7f8f8]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">監控總覽</h2>
          <p className="mt-0.5 text-[11px] text-[#8a8f98]">
            任務閉環 · 角色 Agent · OPC 護欄 · Hub 九模型 · 雲端 · 記憶 · 檢查點
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-md border border-[#23252a] bg-[#0f1011] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
        >
          重新整理
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <Kpi
          label="任務成功率"
          value={`${dash?.stats.success_rate ?? 0}%`}
          hint={`${dash?.stats.tasks_completed ?? 0} 完成 / ${dash?.stats.tasks_failed ?? 0} 失敗`}
          onClick={() => onOpenTab('dashboard')}
        />
        <Kpi
          label="角色 Agent"
          value={`${(agents?.summary.roles_busy ?? 0) + (agents?.summary.roles_waiting ?? 0)}/${roster.length}`}
          hint={`自定 ${agents?.summary.roles_custom ?? 0} · 值班 ${agents?.summary.roles_on_call ?? 0} · 告警 ${agents?.summary.alerts_open ?? 0}`}
          onClick={() => onOpenTab('agents')}
        />
        <Kpi
          label="OPC 連線"
          value={opcOk ? '在線' : '離線'}
          hint={`${opcCatalog.length} 標籤 · 攔截 ${opc?.audit.summary.blocked ?? 0}`}
          onClick={() => onOpenTab('opc')}
        />
        <Kpi
          label="Hub 快取"
          value={`${hitPct}%`}
          hint={`熔斷 Open ${openCircuits} · 日誌 ${hub?.call_log_count ?? 0}`}
          onClick={() => onOpenTab('hub')}
        />
        <Kpi
          label="LLM 模型池"
          value={String(llmOps?.allowed_models.length ?? 0)}
          hint={llmOps?.ops.stale ? '目錄過期' : (llmOps?.provider_label ?? '尚未鎖定')}
          onClick={() => onOpenTab('llm')}
        />
        <Kpi
          label="LLM 快取"
          value={`${llmCachePct}%`}
          hint={`路由門檻 ${optimization?.routing_feedback.adaptive_length_threshold ?? '—'} · trace ${optimization?.trace.trace_count ?? 0}`}
          onClick={() => onOpenTab('llm')}
        />
        <Kpi
          label="即時動態"
          value={liveFeed.live ? 'LIVE' : 'IDLE'}
          hint="管線 · 協作 · 匯報 · 路由"
          onClick={() => onOpenTab('balancer')}
        />
        <Kpi
          label="雲端今日費用"
          value={billing ? `$${billing.today_total.toFixed(3)}` : '—'}
          hint={cloudLatest}
          onClick={() => onOpenTab('cloud')}
        />
        <Kpi
          label="Docker"
          value={docker?.available ? `${dockerHealthy}/${dockerTotal}` : '離線'}
          hint={docker?.available ? '健康容器' : 'docker.sock 未掛載'}
          onClick={() => onOpenTab('cloud')}
        />
        <Kpi
          label="記憶庫"
          value={String(memoryCount)}
          hint={`存檔 ${dash?.stats.archives_count ?? 0}`}
          onClick={() => onOpenTab('memory')}
        />
        <Kpi
          label="檢查點"
          value={String(checkpoints.length)}
          hint={checkpoints[0]?.phase || '尚無可續跑'}
          onClick={() => onOpenTab('checkpoints')}
        />
        <Kpi
          label="花費"
          value={`$${dash?.stats.total_spent ?? 0}`}
          hint={`迭代 ${dash?.stats.total_iterations ?? 0} 輪`}
          onClick={() => onOpenTab('dashboard')}
        />
      </div>

      <div className="mb-4">
        <Section title="即時動態" action="完整視圖" onAction={() => onOpenTab('balancer')}>
          <AnimTheater
            variant="full"
            autoPlay
            initialScene="pipeline"
            feed={liveFeed}
            hideBrand
            scenes={['pipeline', 'company', 'report', 'budget']}
            className="!border-gray-800/60"
          />
        </Section>
      </div>

      {(optimization?.roadmap?.length ?? 0) > 0 && (
        <div className="mb-4">
          <Section title="性能優化路線圖" action="LLM 運維" onAction={() => onOpenTab('llm')}>
            <p className="mb-2 text-[11px] text-[#8a8f98]">
              P0 任務-模型匹配 · 反思早停 · P1 合併審查 · 分層快取 · P2 路由反饋 · OPC 邊緣 · P3 Trace
            </p>
            <RoadmapTable items={optimization!.roadmap} />
          </Section>
        </div>
      )}

      <div className="mb-4">
        <Section title="角色 Agent 工作台" action="左側名冊" onAction={() => onOpenTab('agents')}>
          <p className="mb-2 text-[11px] text-[#8a8f98]">
            共 {roster.length} 個角色 · 完整名冊與「▣ 總覽」等同層，在左側外圍「◈ 角色 Agent」· 此處僅預覽忙碌優先
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {overviewRoster.map((agent) => {
              const tone =
                agent.status === 'busy'
                  ? 'text-[#4cc38a]'
                  : agent.status === 'waiting'
                    ? 'text-amber-300'
                    : agent.status === 'error'
                      ? 'text-red-300'
                      : 'text-[#62666d]';
              const open =
                agent.queue + agent.executing + (agent.inbox.in_review ?? 0) + agent.blocked;
              const current =
                agent.work_items.find((i) => i.status === 'executing') ??
                (agent.current_item &&
                ['planning', 'ready', 'executing', 'in_review', 'rework'].includes(agent.current_item.status)
                  ? agent.current_item
                  : undefined);
              const preview = agent.work_items
                .filter((i) => i.id !== current?.id)
                .slice(0, 2);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onOpenTab('agents', agent.id)}
                  className="rounded-md border border-[#23252a] px-2.5 py-2 text-left hover:border-[#34343a]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] text-[#d0d6e0]">
                      {agent.name} Agent
                      {agent.is_custom ? ' ·自定' : ''}
                      {agent.on_call ? ' ·值班' : ''}
                    </span>
                    <span className={`shrink-0 font-mono text-[10px] ${tone}`}>
                      {open > 0 ? `${open} 項` : agent.status === 'idle' ? '待命' : agent.status}
                    </span>
                  </div>
                  {current ? (
                    <p className="mt-1 truncate text-[11px] text-[#8a8f98]">正在處理 · {current.title}</p>
                  ) : preview.length === 0 ? (
                    <p className="mt-1 text-[11px] text-[#62666d]">尚無工作項</p>
                  ) : null}
                  {preview.map((item) => (
                    <p key={`${item.task_id}-${item.id}`} className="mt-0.5 truncate text-[11px] text-[#8a8f98]">
                      · {item.title}
                    </p>
                  ))}
                </button>
              );
            })}
          </div>
          {busyAgents.length === 0 && (
            <p className="mt-2 text-[11px] text-[#62666d]">
              全員待命。公司任務啟動後，各角色會在此顯示佇列與執行數。
            </p>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="九模型延遲" action="打開 Hub" onAction={() => onOpenTab('hub')}>
          <div className="space-y-1.5">
            {hubModels.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-36 truncate text-[#d0d6e0]">{m.id}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#141516]">
                  <div
                    className="h-full bg-[#5e6ad2]"
                    style={{
                      width: `${Math.min(100, ((Number(m.latency_ewma_ms) || 0) / 15000) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-16 text-right font-mono text-[#8a8f98]">
                  {Math.round(Number(m.latency_ewma_ms) || 0)} ms
                </span>
                <span className={m.circuit.state === 'CLOSED' ? 'text-[#4cc38a]' : 'text-red-300'}>
                  {m.circuit.state}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="OPC 標籤" action="打開 OPC" onAction={() => onOpenTab('opc')}>
          <div className="space-y-1.5">
            {opcCatalog.map((tag) => {
              const reading = opc?.live.readings.find(
                (r) => r.tag_name === tag.name || String(r.tag_name).includes(tag.name),
              );
              return (
                <div key={tag.name} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#d0d6e0]">{tag.name}</span>
                  <span className="font-mono text-[#8a8f98]">
                    {reading?.value == null ? '—' : String(reading.value)}
                    {tag.unit ? ` ${tag.unit}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="最近任務" action="控制面版" onAction={() => onOpenTab('dashboard')}>
          {(dash?.tasks.length ?? 0) === 0 ? (
            <p className="text-[11px] text-[#62666d]">尚無任務。從對話頁或控制面版送出第一個指令。</p>
          ) : (
            (dash?.tasks ?? []).slice(0, 8).map((t) => (
              <div
                key={t.task_id}
                className="flex justify-between border-b border-[#23252a] py-1.5 text-[11px] last:border-0"
              >
                <span className="min-w-0 truncate text-[#d0d6e0]">{t.query || t.task_id.slice(0, 8)}</span>
                <span
                  className={
                    t.status === 'completed'
                      ? 'text-[#4cc38a]'
                      : t.status === 'failed'
                        ? 'text-red-300'
                        : 'text-amber-300'
                  }
                >
                  {t.status}
                </span>
              </div>
            ))
          )}
        </Section>

        <Section title="最近 Hub 呼叫" action="打開 Hub" onAction={() => onOpenTab('hub')}>
          {(hub?.call_logs.length ?? 0) === 0 ? (
            <p className="text-[11px] text-[#62666d]">尚無 call_logs。可在 AI Hub 送出推論產生紀錄。</p>
          ) : (
            hub!.call_logs.slice(0, 8).map((log, i) => (
              <div
                key={`${log.id ?? i}`}
                className="flex justify-between border-b border-[#23252a] py-1.5 text-[11px] last:border-0"
              >
                <span className="text-[#d0d6e0]">{log.model_name}</span>
                <span className="text-[#8a8f98]">{log.status}</span>
              </div>
            ))
          )}
        </Section>

        <Section title="最近 OPC 審計" action="打開 OPC" onAction={() => onOpenTab('opc')}>
          {(opc?.audit.recent.length ?? 0) === 0 ? (
            <p className="text-[11px] text-[#62666d]">尚無審計。寫入仍受白名單與邊界約束。</p>
          ) : (
            opc!.audit.recent.slice(0, 8).map((row, i) => (
              <div
                key={`${row.timestamp}-${i}`}
                className="flex justify-between border-b border-[#23252a] py-1.5 text-[11px] last:border-0"
              >
                <span className="text-[#d0d6e0]">
                  {row.operation} {row.tag_name}
                </span>
                <span className={row.result === 'blocked' ? 'text-red-300' : 'text-[#4cc38a]'}>
                  {row.result}
                </span>
              </div>
            ))
          )}
        </Section>

        <Section title="容器事件" action="雲控制台" onAction={() => onOpenTab('cloud')}>
          {events.length === 0 ? (
            <p className="text-[11px] text-[#62666d]">尚無 start/stop/restart 事件。</p>
          ) : (
            events.slice(0, 8).map((e, i) => (
              <div
                key={`${e.ts}-${i}`}
                className="flex justify-between border-b border-[#23252a] py-1.5 text-[11px] last:border-0"
              >
                <span className="text-[#d0d6e0]">
                  {e.type} · {e.service}
                </span>
                <span className="text-[#62666d]">{e.ts.slice(11, 19)}</span>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
