/**
 * LiveBoard — 大螢幕即時監控面板（Apple 控制中心 × Health 圖表風格）。
 *
 * - 全頁柵格一次呈現，無場景輪播／自動下一步
 * - 僅由 Agent／路由／OPC／帳單真實狀態驅動
 * - 無活動時畫面靜止
 */
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  type AnimLiveFeed,
  budgetPct,
  buildReportLines,
  mapPhaseToPipelineIndex,
  pickActiveAgents,
  pickBusyAgents,
  stageBackends,
} from '../lib/animLive';

const PIPELINE = [
  { id: 'sense', label: '感知' },
  { id: 'route', label: '路由' },
  { id: 'gen', label: '生成' },
  { id: 'eval', label: '評估' },
  { id: 'reflect', label: '反思' },
  { id: 'out', label: '輸出' },
];

const BLUE = '#007AFF';
const GREEN = '#30D158';
const ORANGE = '#FF9F0A';
const RED = '#FF453A';
const GRAY = '#8E8E93';

function statusTone(ok: boolean, warn = false): string {
  if (ok) return GREEN;
  if (warn) return ORANGE;
  return GRAY;
}

function FrostCard({
  title,
  accessory,
  className = '',
  children,
}: {
  title: string;
  accessory?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`lb-frost-card ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="lb-card-title">{title}</h2>
        {accessory}
      </header>
      {children}
    </section>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[#AEAEB2]">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
      {label}
    </span>
  );
}

function RingMetric({
  value,
  max = 100,
  label,
  color,
  sub,
}: {
  value: number;
  max?: number;
  label: string;
  color: string;
  sub?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[88px] w-[88px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold tracking-tight text-white">{pct}%</span>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] font-medium text-[#E5E5EA]">{label}</p>
      {sub && <p className="font-mono text-[10px] text-[#8E8E93]">{sub}</p>}
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="lb-frost-card !p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
        <p className="text-[11px] font-medium tracking-wide text-[#8E8E93]">{label}</p>
      </div>
      <p className="font-mono text-[26px] font-semibold leading-none tracking-tight text-white">{value}</p>
      <p className="mt-1.5 truncate text-[11px] text-[#AEAEB2]">{hint}</p>
    </div>
  );
}

function PipelineCard({ feed }: { feed: AnimLiveFeed }) {
  const liveIdx =
    mapPhaseToPipelineIndex(feed.streamPhase) ?? mapPhaseToPipelineIndex(feed.taskPhase);
  const phase = feed.streamPhase || feed.taskPhase;

  return (
    <FrostCard
      title="管線"
      accessory={
        <StatusDot
          color={liveIdx != null ? BLUE : GRAY}
          label={phase ? String(phase) : '待命'}
        />
      }
      className="min-h-[200px]"
    >
      <div className="flex flex-1 items-center gap-1 pt-2 sm:gap-2">
        {PIPELINE.map((n, i) => {
          const active = liveIdx != null && i === liveIdx;
          const done = liveIdx != null && i < liveIdx;
          return (
            <div key={n.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i < PIPELINE.length - 1 && (
                <div
                  className="absolute left-[52%] top-[14px] h-[2px] w-[96%]"
                  style={{
                    background: done ? GREEN : 'rgba(255,255,255,0.1)',
                  }}
                />
              )}
              <div
                className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300 sm:h-8 sm:w-8"
                style={{
                  background: active ? BLUE : done ? `${GREEN}33` : 'rgba(255,255,255,0.06)',
                  boxShadow: active ? `0 0 0 3px ${BLUE}33` : undefined,
                }}
              >
                <span
                  className="text-[9px] font-semibold sm:text-[10px]"
                  style={{ color: active ? '#fff' : done ? GREEN : GRAY }}
                >
                  {i + 1}
                </span>
              </div>
              <span
                className="mt-2 text-[10px] font-medium sm:text-[11px]"
                style={{ color: active ? '#fff' : '#8E8E93' }}
              >
                {n.label}
              </span>
            </div>
          );
        })}
      </div>
      {feed.resolvedPath && (
        <p className="mt-4 font-mono text-[10px] text-[#636366]">路徑 {feed.resolvedPath}</p>
      )}
    </FrostCard>
  );
}

function CompanyCard({ feed }: { feed: AnimLiveFeed }) {
  const busy = useMemo(() => pickBusyAgents(feed.agents, 6), [feed.agents]);
  const active = useMemo(() => pickActiveAgents(feed.agents, 6), [feed.agents]);
  const open = feed.summary?.work_items_open ?? 0;
  const company = feed.summary?.running_company_tasks ?? 0;

  return (
    <FrostCard
      title="協作"
      accessory={
        <StatusDot
          color={active.length ? GREEN : busy.length ? ORANGE : GRAY}
          label={active.length ? `${active.length} 執行中` : busy.length ? `${busy.length} 佇列` : '空閒'}
        />
      }
      className="min-h-[200px]"
    >
      {busy.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[12px] text-[#636366]">
          無忙碌角色
        </div>
      ) : (
        <div className="space-y-2">
          {busy.slice(0, 5).map((a) => {
            const hot = active.some((x) => x.id === a.id);
            const pct = Math.min(
              100,
              Math.round((a.capacity_used ?? 0) * 100) || (a.executing ? 55 : a.queue ? 20 : 8),
            );
            return (
              <div key={a.id} className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: hot ? GREEN : a.status === 'error' ? RED : ORANGE }}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-medium text-[#E5E5EA]">{a.name}</p>
                    <span className="shrink-0 font-mono text-[10px] text-[#8E8E93]">{pct}%</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${pct}%`,
                        background: hot ? GREEN : a.status === 'error' ? RED : BLUE,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <p className="pt-1 font-mono text-[10px] text-[#636366]">
            開放 {open} · 公司任務 {company}
          </p>
        </div>
      )}
    </FrostCard>
  );
}

function BudgetCard({ feed }: { feed: AnimLiveFeed }) {
  const b = budgetPct(feed.summary);
  const today = feed.billing?.today_total;

  return (
    <FrostCard
      title="預算"
      accessory={
        <StatusDot
          color={b.totalUsd > 0 ? BLUE : GRAY}
          label={b.totalUsd > 0 ? `$${b.totalUsd.toFixed(3)}` : '無用量'}
        />
      }
    >
      <div className="flex items-center justify-around gap-2 py-2">
        <RingMetric
          value={b.apiPct}
          label="API"
          color={BLUE}
          sub={b.totalUsd > 0 ? `$${b.apiUsd.toFixed(3)}` : '—'}
        />
        <RingMetric
          value={b.cloudPct}
          label="雲資源"
          color={ORANGE}
          sub={b.totalUsd > 0 ? `$${b.cloudUsd.toFixed(3)}` : '—'}
        />
      </div>
      {today != null && (
        <p className="mt-1 text-center font-mono text-[10px] text-[#636366]">
          雲今日 ${today.toFixed(3)}
        </p>
      )}
    </FrostCard>
  );
}

function OpcCard({ feed }: { feed: AnimLiveFeed }) {
  const edge = feed.optimization?.opc_edge;
  const opc = feed.opc;
  const fresh = edge?.cache_fresh ?? false;
  const reachable = Boolean(opc?.live?.reachable && opc?.live?.health?.opc_connected);
  const readings = edge?.reading_count ?? opc?.live?.readings?.length ?? 0;
  const blocked = opc?.audit?.summary?.blocked ?? 0;
  const tone = fresh ? GREEN : reachable ? ORANGE : GRAY;

  return (
    <FrostCard
      title="OPC"
      accessory={<StatusDot color={tone} label={fresh ? '邊緣命中' : reachable ? '連線' : '離線'} />}
    >
      <div className="grid grid-cols-3 gap-2 py-1">
        {[
          { label: '連線', value: reachable ? 'ON' : 'OFF', c: reachable ? GREEN : GRAY },
          { label: '讀取', value: String(readings), c: readings > 0 ? BLUE : GRAY },
          { label: '攔截', value: String(blocked), c: blocked > 0 ? RED : GRAY },
        ].map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl bg-white/[0.04] px-2 py-3 text-center"
          >
            <p className="text-[10px] text-[#8E8E93]">{cell.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold" style={{ color: cell.c }}>
              {cell.value}
            </p>
          </div>
        ))}
      </div>
      {edge?.edge_ttl_sec != null && (
        <p className="mt-2 font-mono text-[10px] text-[#636366]">TTL {edge.edge_ttl_sec}s</p>
      )}
    </FrostCard>
  );
}

function RouterCard({ feed }: { feed: AnimLiveFeed }) {
  const backends = useMemo(() => stageBackends(feed.optimization), [feed.optimization]);
  const routing = feed.optimization?.routing_feedback;
  const phase = (feed.streamPhase || feed.taskPhase || '').toLowerCase();
  const hotIdx = backends.findIndex(
    (b) => phase.includes(b.id.toLowerCase()) || phase.includes(b.label.toLowerCase()),
  );
  const maxW = Math.max(...backends.map((b) => b.weight), 1);

  return (
    <FrostCard
      title="任務 → 模型"
      accessory={
        <StatusDot
          color={hotIdx >= 0 ? BLUE : GRAY}
          label={routing?.total ? `路由 ${routing.total}` : `${backends.length} 環節`}
        />
      }
      className="min-h-[220px]"
    >
      <div className="flex h-[140px] items-end gap-2 sm:gap-3">
        {backends.map((b, i) => {
          const hot = i === hotIdx;
          const h = 28 + (b.weight / maxW) * 90;
          return (
            <div key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <p className="mb-1 max-w-full truncate px-0.5 text-center font-mono text-[9px] text-[#8E8E93]">
                {b.model === '—' ? b.tier : b.model}
              </p>
              <div
                className="relative w-full overflow-hidden rounded-t-lg transition-[height,background] duration-400"
                style={{
                  height: h,
                  background: hot
                    ? `linear-gradient(180deg, ${BLUE}, ${BLUE}88)`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: hot ? `0 0 16px ${BLUE}44` : undefined,
                }}
              />
              <p
                className="mt-1.5 truncate text-[10px] font-medium"
                style={{ color: hot ? BLUE : '#AEAEB2' }}
              >
                {b.label}
              </p>
            </div>
          );
        })}
      </div>
    </FrostCard>
  );
}

function EventsCard({ feed }: { feed: AnimLiveFeed }) {
  const lines = useMemo(() => buildReportLines(feed.agents, 8), [feed.agents]);

  return (
    <FrostCard
      title="事件"
      accessory={<StatusDot color={lines.length ? GREEN : GRAY} label={lines.length ? `${lines.length}` : '無'} />}
      className="min-h-[200px]"
    >
      {lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10 text-[12px] text-[#636366]">
          等待 Agent 事件
        </div>
      ) : (
        <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-0.5">
          {lines.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-2.5 py-2"
            >
              <span
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: s.accent ?? BLUE }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium" style={{ color: s.accent ?? BLUE }}>
                  {s.role}
                </p>
                <p className="text-[12px] leading-snug text-[#E5E5EA]">{s.line}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FrostCard>
  );
}

export default function LiveBoard({ feed }: { feed: AnimLiveFeed }) {
  const active = useMemo(() => pickActiveAgents(feed.agents, 99), [feed.agents]);
  const phase = feed.streamPhase || feed.taskPhase;
  const b = budgetPct(feed.summary);
  const opcOk = Boolean(
    feed.optimization?.opc_edge?.cache_fresh ||
      (feed.opc?.live?.reachable && feed.opc?.live?.health?.opc_connected),
  );
  const updated = feed.updatedAt
    ? new Date(feed.updatedAt).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div className="lb-board flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="lb-board-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <StatusDot
              color={feed.live ? GREEN : GRAY}
              label={feed.live ? 'LIVE' : 'IDLE'}
            />
            {updated && (
              <span className="font-mono text-[10px] text-[#636366]">{updated}</span>
            )}
          </div>
          <span className="text-[11px] text-[#636366]">5s 輪詢 · 真實狀態</span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="管線相位"
            value={phase ? String(phase).slice(0, 12) : '—'}
            hint={feed.resolvedPath || (feed.runningTasks ? `${feed.runningTasks} 任務` : '待命')}
            tone={phase ? BLUE : GRAY}
          />
          <KpiTile
            label="忙碌角色"
            value={String(active.length || feed.summary?.roles_busy || 0)}
            hint={`開放工作項 ${feed.summary?.work_items_open ?? 0}`}
            tone={active.length ? GREEN : GRAY}
          />
          <KpiTile
            label="累計費用"
            value={b.totalUsd > 0 ? `$${b.totalUsd.toFixed(3)}` : '—'}
            hint={
              feed.billing?.today_total != null
                ? `雲今日 $${feed.billing.today_total.toFixed(3)}`
                : 'API + 雲'
            }
            tone={b.totalUsd > 0 ? ORANGE : GRAY}
          />
          <KpiTile
            label="OPC"
            value={opcOk ? 'ONLINE' : 'OFF'}
            hint={
              feed.optimization?.opc_edge?.cache_fresh
                ? '邊緣快取新鮮'
                : feed.opc?.guard?.sim_enabled
                  ? '模擬'
                  : '等待連線'
            }
            tone={statusTone(opcOk, Boolean(feed.opc?.guard?.sim_enabled))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <PipelineCard feed={feed} />
          </div>
          <CompanyCard feed={feed} />
          <div className="xl:col-span-2">
            <RouterCard feed={feed} />
          </div>
          <BudgetCard feed={feed} />
          <OpcCard feed={feed} />
          <div className="lg:col-span-2 xl:col-span-2">
            <EventsCard feed={feed} />
          </div>
        </div>
      </div>
    </div>
  );
}
