/**
 * LiveBoard — 大螢幕即時監控面板（Apple 控制中心 × Health 圖表風格）。
 *
 * - 全頁柵格一次呈現，無場景輪播／自動下一步
 * - 僅由 Agent／路由／OPC／帳單真實狀態驅動
 * - 無活動時畫面靜止（無 idle 掃描、無定時走位）
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
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const RED = '#FF3B30';
const GRAY = '#8E8E93';

export type LiveBoardDensity = 'page' | 'dock';

function statusTone(ok: boolean, warn = false): string {
  if (ok) return GREEN;
  if (warn) return ORANGE;
  return GRAY;
}

function FrostCard({
  title,
  accessory,
  className = '',
  bodyClassName = '',
  scroll = false,
  children,
}: {
  title: string;
  accessory?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** true：內容區獨立捲動；false：隨頁面一起排版 */
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`lb-frost-card ${className}`}>
      <header className="lb-card-head">
        <h2 className="lb-card-title">{title}</h2>
        {accessory}
      </header>
      <div className={`lb-card-body ${scroll ? '' : 'lb-card-body--static'} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  const tone =
    color === GREEN
      ? 'apple-dot apple-dot--ok'
      : color === ORANGE
        ? 'apple-dot apple-dot--warn'
        : color === RED
          ? 'apple-dot apple-dot--err'
          : color === BLUE
            ? 'apple-dot apple-dot--info'
            : 'apple-dot';
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-normal text-[#AEAEB2]">
      <span className={tone} style={tone === 'apple-dot' ? { background: color, boxShadow: `0 0 0 2px ${color}33, 0 0 12px ${color}66` } : undefined} />
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
  size = 88,
}: {
  value: number;
  max?: number;
  label: string;
  color: string;
  sub?: string;
  size?: number;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ height: size, width: size }}>
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
          <span className="apple-data text-[17px] text-white">{pct}%</span>
        </div>
      </div>
      <p className="mt-2 text-[12px] font-bold text-[#F5F5F7]">{label}</p>
      {sub && <p className="apple-data mt-0.5 text-[10px] text-[#8E8E93]">{sub}</p>}
    </div>
  );
}

/** 靜態折線：依真實權重／負載繪製，不隨時間自動推進 */
function Sparkline({
  values,
  color = BLUE,
  height = 48,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) {
    return <div className="flex h-12 items-center justify-center text-[11px] text-[#636366]">—</div>;
  }
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 0.001);
  const w = 240;
  const h = height;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
        opacity={0.95}
      />
    </svg>
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
    <div className="lb-frost-card">
      <div className="lb-card-head !pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="apple-dot"
            style={{ background: tone, boxShadow: `0 0 0 2px ${tone}33, 0 0 12px ${tone}66` }}
          />
          <p className="apple-title">{label}</p>
        </div>
      </div>
      <div className="lb-card-body lb-card-body--static !pt-0">
        <p className="apple-data text-[24px] leading-none text-white sm:text-[28px]">{value}</p>
        <p className="mt-2 truncate text-[11px] font-normal text-[#AEAEB2]">{hint}</p>
      </div>
    </div>
  );
}

function PipelineCard({ feed, dock }: { feed: AnimLiveFeed; dock?: boolean }) {
  const liveIdx =
    mapPhaseToPipelineIndex(feed.streamPhase) ?? mapPhaseToPipelineIndex(feed.taskPhase);
  const phase = feed.streamPhase || feed.taskPhase;

  return (
    <FrostCard
      title="管線"
      accessory={
        <StatusDot color={liveIdx != null ? BLUE : GRAY} label={phase ? String(phase) : '待命'} />
      }
      className={dock ? 'min-h-0' : 'min-h-[168px]'}
    >
      <div className={`flex flex-1 items-center gap-1 ${dock ? 'pt-1 pb-1' : 'pt-2 pb-1'} sm:gap-2`}>
        {PIPELINE.map((n, i) => {
          const active = liveIdx != null && i === liveIdx;
          const done = liveIdx != null && i < liveIdx;
          return (
            <div key={n.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i < PIPELINE.length - 1 && (
                <div
                  className={`absolute left-[52%] ${dock ? 'top-[12px]' : 'top-[14px]'} h-[2px] w-[96%]`}
                  style={{ background: done ? GREEN : 'rgba(255,255,255,0.1)' }}
                />
              )}
              <div
                className={`relative z-[1] flex items-center justify-center rounded-full transition-colors duration-300 ${
                  dock ? 'h-6 w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
                }`}
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
                className={`mt-1.5 font-medium ${dock ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'}`}
                style={{ color: active ? '#fff' : '#8E8E93' }}
              >
                {n.label}
              </span>
            </div>
          );
        })}
      </div>
      {!dock && feed.resolvedPath && (
        <p className="mt-3 font-mono text-[10px] text-[#636366]">路徑 {feed.resolvedPath}</p>
      )}
    </FrostCard>
  );
}

function CompanyCard({ feed, dock }: { feed: AnimLiveFeed; dock?: boolean }) {
  const busy = useMemo(() => pickBusyAgents(feed.agents, dock ? 4 : 6), [feed.agents, dock]);
  const active = useMemo(() => pickActiveAgents(feed.agents, 6), [feed.agents]);
  const open = feed.summary?.work_items_open ?? 0;
  const company = feed.summary?.running_company_tasks ?? 0;

  return (
    <FrostCard
      title="協作"
      accessory={
        <StatusDot
          color={active.length ? GREEN : busy.length ? ORANGE : GRAY}
          label={active.length ? `${active.length} 執行` : busy.length ? `${busy.length} 佇列` : '空閒'}
        />
      }
      className={dock ? 'min-h-0 max-h-[200px]' : 'min-h-[168px] max-h-[280px]'}
      scroll
    >
      {busy.length === 0 ? (
        <div className="flex h-full min-h-[72px] items-center justify-center text-[12px] text-[#636366]">
          無忙碌角色
        </div>
      ) : (
        <div className="space-y-3">
          {busy.slice(0, dock ? 4 : 8).map((a) => {
            const hot = active.some((x) => x.id === a.id);
            const pct = Math.min(
              100,
              Math.round((a.capacity_used ?? 0) * 100) || (a.executing ? 55 : a.queue ? 20 : 8),
            );
            return (
              <div key={a.id} className="flex items-center gap-3">
                <span
                  className="apple-dot shrink-0"
                  style={{
                    background: hot ? GREEN : a.status === 'error' ? RED : ORANGE,
                    boxShadow: hot
                      ? `0 0 0 2px ${GREEN}33, 0 0 12px ${GREEN}66`
                      : undefined,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-bold text-[#F5F5F7]">{a.name}</p>
                    <span className="apple-data shrink-0 text-[10px] text-[#8E8E93]">{pct}%</span>
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
          {!dock && (
            <p className="apple-data pt-1 text-[10px] text-[#636366]">
              開放 {open} · 公司任務 {company}
            </p>
          )}
        </div>
      )}
    </FrostCard>
  );
}

function BudgetCard({ feed, dock }: { feed: AnimLiveFeed; dock?: boolean }) {
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
      <div className={`flex items-center justify-around gap-2 ${dock ? 'py-0' : 'py-1'}`}>
        <RingMetric
          value={b.apiPct}
          label="API"
          color={BLUE}
          size={dock ? 64 : 88}
          sub={b.totalUsd > 0 ? `$${b.apiUsd.toFixed(3)}` : '—'}
        />
        <RingMetric
          value={b.cloudPct}
          label="雲資源"
          color={ORANGE}
          size={dock ? 64 : 88}
          sub={b.totalUsd > 0 ? `$${b.cloudUsd.toFixed(3)}` : '—'}
        />
      </div>
      {!dock && today != null && (
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
          <div key={cell.label} className="apple-inset px-2 py-3.5 text-center">
            <p className="apple-title !normal-case !tracking-normal">{cell.label}</p>
            <p className="apple-data mt-1.5 text-lg" style={{ color: cell.c }}>
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

function RouterCard({ feed, dock }: { feed: AnimLiveFeed; dock?: boolean }) {
  const backends = useMemo(() => stageBackends(feed.optimization), [feed.optimization]);
  const routing = feed.optimization?.routing_feedback;
  const phase = (feed.streamPhase || feed.taskPhase || '').toLowerCase();
  const hotIdx = backends.findIndex(
    (b) => phase.includes(b.id.toLowerCase()) || phase.includes(b.label.toLowerCase()),
  );
  const maxW = Math.max(...backends.map((b) => b.weight), 1);
  const spark = backends.map((b) => b.weight);

  return (
    <FrostCard
      title="任務 → 模型"
      accessory={
        <StatusDot
          color={hotIdx >= 0 ? BLUE : GRAY}
          label={routing?.total ? `路由 ${routing.total}` : `${backends.length} 環節`}
        />
      }
      className={dock ? 'min-h-0' : 'min-h-[220px]'}
      bodyClassName="apple-chart"
    >
      {!dock && (
        <div className="mb-3 rounded-xl bg-white/[0.03] px-3 py-2">
          <Sparkline values={spark} color={BLUE} height={40} />
        </div>
      )}
      <div className={`flex items-end gap-3 sm:gap-4 ${dock ? 'h-[96px]' : 'h-[128px]'}`}>
        {backends.map((b, i) => {
          const hot = i === hotIdx;
          const h = (dock ? 20 : 28) + (b.weight / maxW) * (dock ? 56 : 80);
          return (
            <div key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              {!dock && (
                <p className="mb-1 max-w-full truncate px-0.5 text-center font-mono text-[9px] text-[#8E8E93]">
                  {b.model === '—' ? b.tier : b.model}
                </p>
              )}
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
                className="mt-1 truncate text-[10px] font-medium"
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

function EventsCard({ feed, dock }: { feed: AnimLiveFeed; dock?: boolean }) {
  const lines = useMemo(() => buildReportLines(feed.agents, dock ? 4 : 8), [feed.agents, dock]);

  return (
    <FrostCard
      title="事件"
      accessory={
        <StatusDot color={lines.length ? GREEN : GRAY} label={lines.length ? `${lines.length}` : '無'} />
      }
      className={dock ? 'min-h-0 max-h-[220px]' : 'min-h-[200px] max-h-[320px]'}
      scroll
    >
      {lines.length === 0 ? (
        <div className="flex h-full min-h-[88px] items-center justify-center text-[12px] text-[#636366]">
          等待 Agent 事件
        </div>
      ) : (
        <ul className="space-y-2.5">
          {lines.map((s) => (
            <li key={s.id} className="apple-inset flex items-start gap-2.5 px-3 py-2.5">
              <span
                className="apple-dot mt-1 shrink-0"
                style={{
                  background: s.accent ?? BLUE,
                  boxShadow: `0 0 0 2px ${(s.accent ?? BLUE)}33, 0 0 10px ${(s.accent ?? BLUE)}55`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[11px] font-bold"
                  style={{ color: s.accent ?? BLUE }}
                >
                  {s.role}
                </p>
                <p className="mt-0.5 text-[12px] font-normal leading-relaxed text-[#F5F5F7]">
                  {s.line}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FrostCard>
  );
}

export default function LiveBoard({
  feed,
  density = 'page',
}: {
  feed: AnimLiveFeed;
  density?: LiveBoardDensity;
}) {
  const dock = density === 'dock';
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
    <div
      className={`lb-board flex min-h-0 flex-col overflow-hidden ${
        dock ? 'rounded-2xl border border-white/[0.08]' : 'flex-1'
      }`}
    >
      <div
        className={`lb-board-scroll min-h-0 flex-1 overflow-y-auto ${
          dock ? 'px-3 py-3' : 'px-5 py-5 sm:px-7 sm:py-6'
        }`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 ${dock ? 'mb-3' : 'mb-5'}`}>
          <div className="flex items-center gap-3">
            <StatusDot color={feed.live ? GREEN : GRAY} label={feed.live ? 'LIVE' : 'IDLE'} />
            {updated && <span className="font-mono text-[10px] text-[#636366]">{updated}</span>}
          </div>
          {!dock && <span className="text-[11px] text-[#636366]">5s 輪詢</span>}
        </div>

        {!dock && (
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        )}

        {dock ? (
          <div className="lb-dock-grid">
            <div className="lb-span-2">
              <PipelineCard feed={feed} dock />
            </div>
            <CompanyCard feed={feed} dock />
            <BudgetCard feed={feed} dock />
            <div className="lb-span-2">
              <RouterCard feed={feed} dock />
            </div>
            <div className="lb-span-2">
              <EventsCard feed={feed} dock />
            </div>
          </div>
        ) : (
          <div className="lb-board-grid">
            <div className="lb-span-2">
              <PipelineCard feed={feed} />
            </div>
            <CompanyCard feed={feed} />
            <div className="lb-span-2">
              <RouterCard feed={feed} />
            </div>
            <BudgetCard feed={feed} />
            <OpcCard feed={feed} />
            <div className="lb-span-2">
              <EventsCard feed={feed} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
