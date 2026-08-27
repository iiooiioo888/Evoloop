/**
 * ChatLiveRail — 對話頁右側即時監控欄。
 * 呈現 Agent／雲端帳單／LLM／OPC／Docker 等多源卡片。
 * 即時動態停靠在對話欄上方；此處捷徑可切換真實場景。
 */
import { useMemo } from 'react';
import {
  AGENT_STATUS_META,
  agentOpenCount,
  fmtUsd,
  fmtWhen,
} from '../lib/agentUi';
import type { AnimScene } from '../lib/animLive';
import type { ChatLiveMonitorState } from '../hooks/useChatLiveMonitor';
import type { ChatMessage, RoleAgent } from '../types';
import { HealthPill, MiniKpi, MonitorSection, RoadmapTable } from './ChatMonitorCards';

const THEATER_SHORTCUTS: Array<{ key: AnimScene; icon: string; label: string }> = [
  { key: 'pipeline', icon: '⟶', label: '管線' },
  { key: 'company', icon: '🏢', label: '協作' },
  { key: 'report', icon: '🎙️', label: '匯報' },
  { key: 'budget', icon: '💰', label: '預算' },
  { key: 'opc', icon: '🏭', label: 'OPC' },
  { key: 'balancer', icon: '⚖️', label: '路由' },
];

interface ChatLiveRailProps {
  monitor: ChatLiveMonitorState;
  messages?: ChatMessage[];
  compact?: boolean;
  onOpenTheater?: () => void;
  onOpenTheaterScene?: (scene: AnimScene) => void;
}

function BusyAgentRow({ agent }: { agent: RoleAgent }) {
  const meta = AGENT_STATUS_META[agent.status] ?? AGENT_STATUS_META.idle;
  const open = agentOpenCount(agent);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-800/80 bg-gray-950/40 px-2 py-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-gray-200">{agent.name}</p>
        <p className={`truncate text-[10px] ${meta.text}`}>
          {meta.label}
          {open > 0 ? ` · ${open} 項` : ''}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[10px] text-amber-300/90">{fmtUsd(agent.cost_usd)}</span>
    </div>
  );
}

function CostBar({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-gray-400">{label}</span>
        <span className="shrink-0 font-mono text-[10px] text-gray-500">{fmtUsd(value)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ChatLiveRail({
  monitor,
  messages = [],
  compact,
  onOpenTheater,
  onOpenTheaterScene,
}: ChatLiveRailProps) {
  const { agents, billing, llmOps, opc, docker, optimization, cloudLatest, memoryCount, updatedAt, error, refresh } =
    monitor;
  const summary = agents?.summary;
  const liveAgents = useMemo(() => {
    const list = agents?.agents ?? [];
    return list
      .filter((a) => a.status === 'busy' || a.status === 'waiting' || a.status === 'error' || agentOpenCount(a) > 0)
      .sort((a, b) => agentOpenCount(b) - agentOpenCount(a))
      .slice(0, 8);
  }, [agents?.agents]);
  const topSpenders = useMemo(() => {
    return [...(agents?.agents ?? [])]
      .filter((a) => (a.cost_usd ?? 0) > 0)
      .sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0))
      .slice(0, 5);
  }, [agents?.agents]);
  const maxSpenderCost = topSpenders[0]?.cost_usd ?? 1;
  const alerts = useMemo(() => {
    const out: Array<{ role: string; level: string; message: string }> = [];
    for (const a of agents?.agents ?? []) {
      for (const al of a.alerts ?? []) {
        out.push({ role: a.name, level: al.level, message: al.message });
      }
      if (a.budget_over) {
        out.push({ role: a.name, level: 'warning', message: '日預算已超支' });
      }
    }
    return out.slice(0, 6);
  }, [agents?.agents]);
  const recentEvents = useMemo(() => {
    const rows: Array<{ ts: string; role: string; event: string; title?: string; cost: number }> = [];
    for (const a of agents?.agents ?? []) {
      for (const ev of a.events ?? []) {
        rows.push({
          ts: ev.ts ?? '',
          role: a.name,
          event: ev.event,
          title: ev.title,
          cost: ev.cost_usd ?? 0,
        });
      }
    }
    return rows.sort((x, y) => (y.ts || '').localeCompare(x.ts || '')).slice(0, 10);
  }, [agents?.agents]);
  const sessionTasks = useMemo(() => {
    return messages
      .filter((m) => m.taskState && (m.taskState.status === 'running' || m.taskState.status === 'pending'))
      .map((m) => m.taskState!)
      .slice(0, 3);
  }, [messages]);
  const apiTotal = summary?.total_api_cost_usd ?? 0;
  const dockerTotal = summary?.total_docker_cost_usd ?? 0;
  const aliyunTotal = summary?.total_aliyun_cost_usd ?? 0;
  const cloudTotal = summary?.total_cloud_cost_usd ?? dockerTotal + aliyunTotal;
  const agentTotal = summary?.total_cost_usd ?? apiTotal + cloudTotal;
  const dockerRunning = docker?.containers?.filter((c) => c.status?.toLowerCase().includes('running')).length ?? 0;
  const dockerTotal2 = docker?.containers?.length ?? 0;
  const opcOk = opc?.live?.reachable && opc?.live?.health?.opc_connected;
  const llmOk = llmOps?.configured && !llmOps?.ops?.stale && llmOps?.ops?.consecutive_fail === 0;
  const opcReadings = opc?.live?.readings?.slice(0, 4) ?? [];
  const cacheHitPct = Math.round((optimization?.llm_cache.hit_rate ?? 0) * 100);
  const routingThreshold = optimization?.routing_feedback.adaptive_length_threshold;
  const traceCount = optimization?.trace.trace_count ?? 0;
  const opcEdgeFresh = optimization?.opc_edge.cache_fresh;
  return (
    <aside
      className={`flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-gray-800 bg-gray-950/40 p-3 ${
        compact ? 'w-full' : 'w-[300px] shrink-0 sm:w-[340px] xl:w-[380px] 2xl:w-[420px]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">即時監控</p>
          <p className="text-[10px] text-gray-600">
            {updatedAt ? `更新 ${fmtWhen(updatedAt)}` : '連線中…'}
            {' · '}5s 輪詢
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border border-gray-800 px-2 py-1 text-[10px] text-gray-400 hover:border-blue-500/40 hover:text-blue-300"
        >
          刷新
        </button>
      </div>
      {error && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200">
          {error}
        </p>
      )}
      <MonitorSection title="動態場景" hint="切換上方劇場" badge="LIVE">
        <div className="grid grid-cols-3 gap-1.5">
          {THEATER_SHORTCUTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                onOpenTheaterScene?.(s.key);
                onOpenTheater?.();
              }}
              className="rounded-lg border border-gray-800 bg-gray-950/50 px-1.5 py-1.5 text-center text-[10px] text-gray-400 transition-colors hover:border-[#5e6ad2]/40 hover:text-[#828fff]"
            >
              <span className="mb-0.5 block text-sm leading-none">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </MonitorSection>
      <MonitorSection title="系統健康" badge="LIVE">
        <div className="grid grid-cols-1 gap-1.5">
          <HealthPill
            label="LLM 供應"
            ok={llmOk ? true : llmOps?.configured ? false : null}
            detail={
              llmOps?.configured
                ? `${llmOps.provider_label} · ${llmOps.model}${llmOps.ops?.last_latency_ms ? ` · ${llmOps.ops.last_latency_ms}ms` : ''}`
                : '未配置'
            }
          />
          <HealthPill
            label="OPC 工業"
            ok={opcOk ? true : opc?.live?.reachable === false ? false : null}
            detail={
              opcOk
                ? `${opc?.live?.readings?.length ?? 0} 標籤讀取中`
                : opc?.live?.error || (opc?.guard?.sim_enabled ? '模擬模式' : '未連線')
            }
          />
          <HealthPill
            label="Docker"
            ok={docker?.available ? dockerRunning > 0 : null}
            detail={docker?.available ? `${dockerRunning}/${dockerTotal2} 容器運行` : '不可用'}
          />
          <HealthPill
            label="阿里雲 BSS"
            ok={billing?.aliyun?.ok ?? (billing?.aliyun?.configured ? false : null)}
            detail={
              billing?.aliyun?.configured
                ? (billing.aliyun.error ?? billing.aliyun.currency ?? '已接入')
                : '未接入'
            }
          />
        </div>
      </MonitorSection>
      {(optimization?.roadmap?.length ?? 0) > 0 && (
        <MonitorSection title="性能優化路線圖" hint="P0–P3" badge={`${cacheHitPct}% 快取`}>
          <RoadmapTable items={optimization?.roadmap ?? []} compact />
          <div className="grid grid-cols-2 gap-2">
            <MiniKpi
              label="LLM 快取"
              value={`${cacheHitPct}%`}
              hint={`命中 ${optimization?.llm_cache.hits ?? 0}`}
              accent="green"
            />
            <MiniKpi
              label="路由門檻"
              value={routingThreshold != null ? String(routingThreshold) : '—'}
              hint={`simple ${optimization?.routing_feedback.simple_count ?? 0}`}
              accent="violet"
            />
            <MiniKpi
              label="反思早停"
              value={`Δ${optimization?.reflection.min_score_improvement ?? 0.5}`}
              hint={`最多 ${optimization?.reflection.max_iterations ?? 3} 輪`}
              accent="amber"
            />
            <MiniKpi
              label="Trace"
              value={String(traceCount)}
              hint={opcEdgeFresh ? 'OPC 邊緣有效' : 'OPC 雲端拉取'}
              accent="cyan"
            />
          </div>
        </MonitorSection>
      )}
      <div className="grid grid-cols-2 gap-2">
        <MiniKpi label="忙碌" value={String(summary?.roles_busy ?? 0)} hint={`待命 ${summary?.roles_idle ?? 0}`} accent="green" />
        <MiniKpi label="等待" value={String(summary?.roles_waiting ?? 0)} hint={`告警 ${summary?.alerts_open ?? 0}`} accent="amber" />
        <MiniKpi label="開放工作" value={String(summary?.work_items_open ?? 0)} hint={`完成 ${summary?.work_items_done ?? 0}`} accent="violet" />
        <MiniKpi
          label="公司任務"
          value={String(summary?.running_company_tasks ?? 0)}
          hint={`合計 ${summary?.company_tasks ?? 0}`}
          accent="blue"
        />
        <MiniKpi label="異常" value={String(summary?.roles_disabled ?? 0)} hint="停用角色" accent="red" />
        <MiniKpi label="記憶庫" value={String(memoryCount)} hint="向量條目" accent="cyan" />
      </div>
      {sessionTasks.length > 0 && (
        <MonitorSection title="本對話任務" hint={`${sessionTasks.length} 進行中`}>
          <div className="space-y-1.5">
            {sessionTasks.map((t) => (
              <div key={t.task_id} className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-2 py-1.5">
                <p className="truncate text-[11px] text-gray-200">{t.query.slice(0, 48)}</p>
                <p className="text-[10px] text-blue-300/80">
                  {t.status} · {t.phase || '—'}
                  {t.resolved_path ? ` · ${t.resolved_path}` : ''}
                </p>
              </div>
            ))}
          </div>
        </MonitorSection>
      )}
      <MonitorSection title="預算合計" hint="API＋雲資源">
        <div className="grid grid-cols-2 gap-2">
          <MiniKpi label="Agent 合計" value={fmtUsd(agentTotal)} accent="amber" />
          <MiniKpi label="API" value={fmtUsd(apiTotal)} accent="violet" />
          <MiniKpi label="Docker" value={fmtUsd(dockerTotal)} accent="blue" />
          <MiniKpi label="阿里雲" value={fmtUsd(aliyunTotal)} accent="orange" />
        </div>
      </MonitorSection>
      <MonitorSection title="雲端帳單" hint="Docker＋阿里雲 BSS">
        <div className="grid grid-cols-2 gap-2">
          <MiniKpi label="今日" value={billing ? fmtUsd(billing.today_total) : '—'} accent="green" />
          <MiniKpi label="本月" value={billing ? fmtUsd(billing.month_total) : '—'} accent="amber" />
          <MiniKpi label="即時" value={billing ? fmtUsd(billing.total_now) : '—'} />
          <MiniKpi
            label="月預估"
            value={billing ? fmtUsd(billing.month_projected) : '—'}
            accent="violet"
          />
        </div>
      </MonitorSection>
      {(cloudLatest.cpu > 0 || cloudLatest.memMb > 0) && (
        <MonitorSection title="雲端資源" hint={cloudLatest.ts ? fmtWhen(cloudLatest.ts) : '即時'}>
          <div className="grid grid-cols-2 gap-2">
            <MiniKpi label="平均 CPU" value={`${cloudLatest.cpu.toFixed(1)}%`} accent="blue" />
            <MiniKpi label="記憶體" value={`${cloudLatest.memMb.toFixed(0)} MB`} accent="violet" />
          </div>
        </MonitorSection>
      )}
      {opcReadings.length > 0 && (
        <MonitorSection title="OPC 感測" hint={`${opcReadings.length} 標籤`}>
          <div className="space-y-1">
            {opcReadings.map((r, i) => (
              <div key={`${r.tag_name}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-gray-400">{r.tag_name?.split('.').pop() ?? r.tag_name}</span>
                <span className="shrink-0 font-mono text-cyan-300/90">
                  {typeof r.value === 'number' ? r.value.toFixed(2) : String(r.value ?? '—')}
                </span>
              </div>
            ))}
          </div>
        </MonitorSection>
      )}
      {topSpenders.length > 0 && (
        <MonitorSection title="預算排行" hint="Top 5">
          <div className="space-y-2">
            {topSpenders.map((a) => (
              <CostBar
                key={a.id}
                label={a.name}
                value={a.cost_usd ?? 0}
                max={maxSpenderCost}
                accent="bg-amber-500/70"
              />
            ))}
          </div>
        </MonitorSection>
      )}
      <MonitorSection title="活躍 Agent" hint={`${liveAgents.length} 席`}>
        {liveAgents.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-gray-600">全部待命</p>
        ) : (
          <div className="space-y-1.5">
            {liveAgents.map((a) => (
              <BusyAgentRow key={a.id} agent={a} />
            ))}
          </div>
        )}
      </MonitorSection>
      <MonitorSection title="告警" badge={String(alerts.length)}>
        {alerts.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-gray-600">無告警</p>
        ) : (
          <div className="space-y-1.5">
            {alerts.map((al, i) => (
              <div
                key={`${al.role}-${al.message}-${i}`}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5"
              >
                <p className="text-[10px] text-amber-200/80">
                  {al.level} · {al.role}
                </p>
                <p className="text-[11px] text-gray-200">{al.message}</p>
              </div>
            ))}
          </div>
        )}
      </MonitorSection>
      <MonitorSection title="事件流" hint="最近">
        {recentEvents.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-gray-600">尚無事件</p>
        ) : (
          <div className="space-y-1">
            {recentEvents.map((ev, i) => (
              <div key={`${ev.ts}-${ev.event}-${i}`} className="border-b border-gray-800/80 py-1.5 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-gray-600">{fmtWhen(ev.ts)}</span>
                  {ev.cost > 0 && (
                    <span className="font-mono text-[10px] text-gray-500">{fmtUsd(ev.cost)}</span>
                  )}
                </div>
                <p className="truncate text-[11px] text-gray-300">
                  {ev.role} · {ev.event.replace(/_/g, ' ')}
                </p>
                {ev.title && <p className="truncate text-[10px] text-gray-600">{ev.title}</p>}
              </div>
            ))}
          </div>
        )}
      </MonitorSection>
    </aside>
  );
}
