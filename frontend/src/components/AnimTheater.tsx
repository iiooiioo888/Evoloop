/**
 * AnimTheater — 對話欄即時動態（真實監控驅動）。
 *
 * 硬規則：
 * - 場景分頁只手動點選，絕不定時自動下一步／輪播
 * - 飛球／封包只在 streamPhase／taskPhase／費用增量時出現一次
 * - 無活動時畫面靜止
 * - 全頁大螢幕請用 LiveBoard
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  type AnimLiveFeed,
  type AnimScene,
  budgetPct,
  buildReportLines,
  mapPhaseToPipelineIndex,
  pickActiveAgents,
  pickBusyAgents,
  stageBackends,
} from '../lib/animLive';
import StageRouterLive from './LoadBalancerDemo';

export type { AnimScene };
export type AnimVariant = 'compact' | 'dock' | 'full' | 'page';

const STAGE_HEIGHT: Record<AnimVariant, string> = {
  compact: 'h-[132px]',
  dock: 'h-[168px] sm:h-[176px]',
  full: 'h-[220px]',
  page: 'min-h-[280px] flex-1 h-auto',
};

const SCENES: Array<{ key: AnimScene; label: string }> = [
  { key: 'pipeline', label: '管線' },
  { key: 'company', label: '協作' },
  { key: 'report', label: '事件' },
  { key: 'budget', label: '預算' },
  { key: 'opc', label: 'OPC' },
  { key: 'balancer', label: '路由' },
];

const PIPELINE_NODES = [
  { id: 'sense', label: '感知', color: '#007AFF' },
  { id: 'route', label: '路由', color: '#64D2FF' },
  { id: 'gen', label: '生成', color: '#BF5AF2' },
  { id: 'eval', label: '評估', color: '#FF9500' },
  { id: 'reflect', label: '反思', color: '#FF3B30' },
  { id: 'out', label: '輸出', color: '#34C759' },
];

const ROLE_COLORS = ['#007AFF', '#64D2FF', '#FF9500', '#BF5AF2', '#FF3B30', '#34C759', '#5E5CE6'];

function LiveBadge({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] ${
        live ? 'bg-[#34C759]/15 text-[#34C759]' : 'bg-white/5 text-[#8E8E93]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-[#34C759]' : 'bg-[#636366]'}`} />
      {live ? 'LIVE' : 'IDLE'}
    </span>
  );
}

function StageShell({
  variant,
  caption,
  children,
}: {
  variant: AnimVariant;
  caption: string;
  children: ReactNode;
}) {
  const page = variant === 'page';
  return (
    <div
      className={`anim-stage relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1c1c1e]/90 ${STAGE_HEIGHT[variant]} ${
        page ? 'flex min-h-[280px] flex-col' : ''
      }`}
    >
      <div className={`relative z-[1] flex flex-col p-2.5 ${page ? 'min-h-0 flex-1' : 'h-full'}`}>
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[2] border-t border-white/[0.06] bg-black/40 px-2 py-1 text-center text-[10px] text-[#8E8E93]">
        {caption}
      </div>
    </div>
  );
}

function Packet({
  color,
  style,
  label,
}: {
  color: string;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <span
      className="anim-packet absolute z-10 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-medium text-white shadow-lg"
      style={{ background: color, boxShadow: `0 0 10px ${color}88`, ...style }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
      {label}
    </span>
  );
}

function PipelineScene({
  variant,
  motion,
  feed,
}: {
  variant: AnimVariant;
  motion: boolean;
  feed?: AnimLiveFeed | null;
}) {
  const compact = variant === 'compact';
  const liveIdx =
    mapPhaseToPipelineIndex(feed?.streamPhase) ?? mapPhaseToPipelineIndex(feed?.taskPhase);
  const [packets, setPackets] = useState<number[]>([]);
  const prevIdx = useRef<number | null>(null);

  useEffect(() => {
    if (!motion || liveIdx == null) return;
    if (prevIdx.current === null) {
      prevIdx.current = liveIdx;
      return;
    }
    if (prevIdx.current === liveIdx) return;
    prevIdx.current = liveIdx;
    setPackets((p) => [...p.slice(-2), Date.now()]);
  }, [motion, liveIdx]);

  useEffect(() => {
    if (!motion) {
      setPackets([]);
      prevIdx.current = null;
    }
  }, [motion]);

  const caption =
    liveIdx != null
      ? `${PIPELINE_NODES[liveIdx].label} · ${feed?.streamPhase || feed?.taskPhase}`
      : '待命';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className={`flex flex-1 items-center ${compact ? 'gap-1' : 'gap-2'} px-1 pb-5`}>
        {PIPELINE_NODES.map((n, i) => {
          const active = liveIdx != null && i === liveIdx;
          const done = liveIdx != null && i < liveIdx;
          return (
            <div key={n.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i < PIPELINE_NODES.length - 1 && (
                <div
                  className={`absolute left-[55%] top-[18px] h-0.5 ${compact ? 'w-[70%]' : 'w-[80%]'}`}
                  style={{ background: done ? '#34C75999' : 'rgba(255,255,255,0.1)' }}
                />
              )}
              <div
                className={`relative z-[1] flex items-center justify-center rounded-xl border transition-all duration-300 ${
                  compact ? 'h-9 w-full max-w-[48px]' : 'h-11 w-full max-w-[72px]'
                }`}
                style={{
                  borderColor: active ? n.color : done ? '#34C75966' : 'rgba(255,255,255,0.1)',
                  background: active ? `${n.color}22` : done ? '#34C75914' : 'rgba(255,255,255,0.04)',
                  boxShadow: active ? `0 0 0 2px ${n.color}33` : undefined,
                }}
              >
                <span
                  className={`font-medium ${compact ? 'text-[9px]' : 'text-[11px]'}`}
                  style={{ color: n.color }}
                >
                  {n.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {motion &&
        liveIdx != null &&
        packets.map((id, idx) => (
          <Packet
            key={id}
            color={PIPELINE_NODES[liveIdx].color}
            label={compact ? undefined : 'live'}
            style={{
              top: compact ? 26 : 32,
              left: `calc(${(liveIdx / Math.max(PIPELINE_NODES.length - 1, 1)) * 86 + 4}% )`,
              opacity: 1 - idx * 0.25,
              transition: 'left 0.55s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        ))}
    </StageShell>
  );
}

function CompanyScene({
  variant,
  feed,
}: {
  variant: AnimVariant;
  feed?: AnimLiveFeed | null;
}) {
  const compact = variant === 'compact';
  const busy = useMemo(() => pickBusyAgents(feed?.agents ?? [], 6), [feed?.agents]);
  const active = useMemo(() => pickActiveAgents(feed?.agents ?? [], 6), [feed?.agents]);
  const manager = busy.find((a) => a.id === 'manager' || a.name.toLowerCase().includes('manager'));
  const reviewers = busy.filter((a) =>
    a.work_items?.some((w) => w.kind === 'review' || a.id.includes('review')),
  );
  const synths = busy.filter((a) =>
    a.work_items?.some((w) => w.kind === 'synthesize' || a.id.includes('synth')),
  );
  const workers = busy
    .filter((a) => a !== manager && !reviewers.includes(a) && !synths.includes(a))
    .slice(0, 3);

  const open = feed?.summary?.work_items_open ?? 0;
  const companyRunning = feed?.summary?.running_company_tasks ?? 0;
  const hasActivity = busy.length > 0 || companyRunning > 0;
  const pulseOk = Boolean(feed?.live) && active.length > 0;
  const caption = hasActivity
    ? `${busy.length} 席 · 開放 ${open} · 執行 ${active.length}`
    : '無忙碌角色';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className="relative flex flex-1 flex-col pb-5">
        {!hasActivity ? (
          <div className="flex flex-1 items-center justify-center text-[11px] text-[#636366]">
            待命
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <div
                className={`rounded-xl border px-3 py-1.5 text-[11px] ${
                  manager || companyRunning > 0
                    ? `border-[#007AFF]/50 bg-[#007AFF]/15 text-[#64D2FF] ${pulseOk ? 'anim-node-pulse' : ''}`
                    : 'border-white/10 text-[#8E8E93]'
                }`}
              >
                {manager?.name ?? 'Manager'}
                {manager ? ` · ${manager.executing || manager.queue || 0}` : ''}
              </div>
            </div>
            <div className={`mt-2 grid grid-cols-3 gap-1.5 ${compact ? 'px-1' : 'px-6'}`}>
              {(workers.length ? workers : busy.slice(0, 3)).map((r, i) => {
                const isHot = pulseOk && active.some((b) => b.id === r.id);
                const color = ROLE_COLORS[i % ROLE_COLORS.length];
                const pct =
                  Math.min(100, Math.round((r.capacity_used ?? 0) * 100) || (r.executing ? 55 : 12));
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border px-1.5 py-2 text-center ${isHot ? 'anim-node-pulse' : ''}`}
                    style={{ borderColor: `${color}66`, background: `${color}18`, color }}
                  >
                    <p className={`truncate ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{r.name}</p>
                    <div className="mx-auto mt-1 h-1 w-3/4 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`mt-2 flex justify-center gap-2 ${compact ? '' : 'gap-4'}`}>
              <div
                className={`rounded-lg border px-2 py-1 text-[10px] ${
                  reviewers.length
                    ? `border-[#FF3B30]/40 bg-[#FF3B30]/10 text-[#FF3B30] ${pulseOk ? 'anim-node-pulse' : ''}`
                    : 'border-white/10 text-[#636366]'
                }`}
              >
                Reviewer{reviewers.length ? ` · ${reviewers.length}` : ''}
              </div>
              <div
                className={`rounded-lg border px-2 py-1 text-[10px] ${
                  synths.length
                    ? `border-[#34C759]/40 bg-[#34C759]/10 text-[#34C759] ${pulseOk ? 'anim-node-pulse' : ''}`
                    : 'border-white/10 text-[#636366]'
                }`}
              >
                Synthesizer{synths.length ? ` · ${synths.length}` : ''}
              </div>
            </div>
          </>
        )}
      </div>
    </StageShell>
  );
}

function ReportScene({
  variant,
  feed,
}: {
  variant: AnimVariant;
  feed?: AnimLiveFeed | null;
}) {
  const compact = variant === 'compact';
  const lines = useMemo(
    () => buildReportLines(feed?.agents ?? [], compact ? 4 : 8),
    [feed?.agents, compact],
  );

  return (
    <StageShell variant={variant} caption={lines.length ? `${lines.length} 則事件` : '無事件'}>
      <div className="flex min-h-0 flex-1 flex-col pb-5">
        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[11px] text-[#636366]">
            待命
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
            {lines.map((s, i) => (
              <li
                key={s.id}
                className="flex items-start gap-2 rounded-xl bg-white/[0.04] px-2 py-1.5"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: s.accent ?? ROLE_COLORS[i % ROLE_COLORS.length] }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-medium ${compact ? 'text-[10px]' : 'text-[11px]'}`}
                    style={{ color: s.accent ?? '#007AFF' }}
                  >
                    {s.role}
                  </p>
                  <p className={`text-[#E5E5EA] ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    {s.line}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StageShell>
  );
}

function BudgetScene({
  variant,
  motion,
  feed,
}: {
  variant: AnimVariant;
  motion: boolean;
  feed?: AnimLiveFeed | null;
}) {
  const compact = variant === 'compact';
  const b = budgetPct(feed?.summary);
  const [burst, setBurst] = useState(0);
  const prevTotal = useRef(b.totalUsd);

  useEffect(() => {
    if (!motion) return;
    if (b.totalUsd > prevTotal.current + 0.00001) {
      setBurst((n) => n + 1);
    }
    prevTotal.current = b.totalUsd;
  }, [motion, b.totalUsd]);

  const caption =
    b.totalUsd > 0
      ? `$${b.totalUsd.toFixed(4)} · API ${b.apiPct}% · 雲 ${b.cloudPct}%`
      : '無用量';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className={`grid flex-1 grid-cols-2 gap-2 pb-5 ${compact ? '' : 'gap-3 px-2'}`}>
        <div className="rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/08 p-2">
          <p className="text-[10px] text-[#64D2FF]">API</p>
          <p className={`font-mono ${compact ? 'text-lg' : 'text-2xl'} text-white`}>
            {b.totalUsd > 0 ? `${b.apiPct}%` : '—'}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#007AFF] transition-[width] duration-500"
              style={{ width: `${b.apiPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-[#FF9500]/25 bg-[#FF9500]/08 p-2">
          <p className="text-[10px] text-[#FF9500]">雲資源</p>
          <p className={`font-mono ${compact ? 'text-lg' : 'text-2xl'} text-white`}>
            {b.totalUsd > 0 ? `${b.cloudPct}%` : '—'}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#FF9500] transition-[width] duration-500"
              style={{ width: `${b.cloudPct}%` }}
            />
          </div>
        </div>
      </div>
      {motion &&
        burst > 0 &&
        b.totalUsd > 0 &&
        [0, 1].map((i) => (
          <Packet
            key={`${burst}-${i}`}
            color={i % 2 === 0 ? '#007AFF' : '#FF9500'}
            label={i % 2 === 0 ? '$api' : '$云'}
            style={{
              bottom: 28 + i * 12,
              left: `${18 + i * 28}%`,
              transition: 'left 0.45s linear',
            }}
          />
        ))}
    </StageShell>
  );
}

function OpcScene({
  variant,
  feed,
}: {
  variant: AnimVariant;
  feed?: AnimLiveFeed | null;
}) {
  const compact = variant === 'compact';
  const edge = feed?.optimization?.opc_edge;
  const opc = feed?.opc;
  const fresh = edge?.cache_fresh ?? false;
  const reachable = Boolean(opc?.live?.reachable && opc?.live?.health?.opc_connected);
  const readings = edge?.reading_count ?? opc?.live?.readings?.length ?? 0;
  const blocked = opc?.audit?.summary?.blocked ?? 0;
  const edgeHit = fresh || (reachable && readings > 0);

  const caption = fresh
    ? `邊緣 · TTL ${edge?.edge_ttl_sec ?? '—'}s · ${readings}`
    : reachable
      ? `連線 · 攔截 ${blocked}`
      : '離線';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className={`flex flex-1 items-center justify-around pb-5 ${compact ? 'px-1' : 'px-6'}`}>
        <div
          className={`rounded-2xl border px-3 py-3 text-center ${
            reachable ? 'border-[#64D2FF]/40 bg-[#64D2FF]/10' : 'border-white/10'
          }`}
        >
          <p className="text-[10px] text-[#64D2FF]">感測</p>
          <p className={`font-mono ${compact ? 'text-sm' : 'text-lg'} text-white`}>
            {reachable ? 'ON' : 'OFF'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div
            className={`h-0.5 ${compact ? 'w-10' : 'w-16'}`}
            style={{ background: edgeHit ? '#34C759' : reachable ? '#FF9500' : '#636366' }}
          />
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] text-white"
            style={{ background: edgeHit ? '#34C759' : reachable ? '#FF9500' : '#636366' }}
          >
            {edgeHit ? 'edge' : reachable ? 'miss' : 'idle'}
          </span>
        </div>
        <div
          className={`rounded-2xl border px-3 py-3 text-center ${
            edgeHit
              ? 'border-[#34C759]/40 bg-[#34C759]/10'
              : reachable
                ? 'border-[#FF9500]/40 bg-[#FF9500]/10'
                : 'border-white/10'
          }`}
        >
          <p
            className="text-[10px]"
            style={{ color: edgeHit ? '#34C759' : reachable ? '#FF9500' : '#8E8E93' }}
          >
            {edgeHit ? '邊緣' : '雲端'}
          </p>
          <p className={`font-mono ${compact ? 'text-sm' : 'text-lg'} text-white`}>
            {edgeHit ? `TTL ${edge?.edge_ttl_sec ?? '—'}` : '—'}
          </p>
        </div>
      </div>
    </StageShell>
  );
}

export default function AnimTheater({
  variant = 'full',
  motion = true,
  initialScene = 'pipeline',
  className = '',
  scenes,
  feed,
  scene: controlledScene,
  onSceneChange,
  hideBrand = false,
}: {
  variant?: AnimVariant;
  motion?: boolean;
  initialScene?: AnimScene;
  className?: string;
  scenes?: AnimScene[];
  feed?: AnimLiveFeed | null;
  scene?: AnimScene;
  onSceneChange?: (scene: AnimScene) => void;
  hideBrand?: boolean;
}) {
  const allowed = useMemo(() => {
    const keys = scenes?.length ? scenes : SCENES.map((s) => s.key);
    return SCENES.filter((s) => keys.includes(s.key));
  }, [scenes]);

  const [innerScene, setInnerScene] = useState<AnimScene>(
    allowed.some((s) => s.key === initialScene) ? initialScene : allowed[0]?.key ?? 'pipeline',
  );
  const scene =
    controlledScene && allowed.some((s) => s.key === controlledScene)
      ? controlledScene
      : innerScene;

  const dense = variant === 'compact';
  const dock = variant === 'dock';
  const page = variant === 'page';
  const backends = useMemo(() => stageBackends(feed?.optimization), [feed?.optimization]);
  const activePhase = feed?.streamPhase || feed?.taskPhase || null;
  const motionActive = Boolean(motion && (feed?.live || activePhase));

  const selectScene = useCallback(
    (key: AnimScene) => {
      setInnerScene(key);
      onSceneChange?.(key);
    },
    [onSceneChange],
  );

  return (
    <div
      className={`anim-theater ${
        page ? 'flex min-h-0 flex-col' : 'rounded-2xl border border-white/[0.08] bg-[#1c1c1e]/80'
      } ${dense ? 'p-2' : dock ? 'p-2.5' : page ? '' : 'p-3'} ${className}`}
      data-manual-scenes="true"
    >
      <div
        className={`flex items-center gap-2 ${
          dense || dock ? 'mb-1.5' : page ? 'mb-2 shrink-0' : 'mb-2'
        }`}
      >
        {!hideBrand && !page && !dense && !dock && (
          <p className="mr-1 shrink-0 text-sm font-semibold text-[#E5E5EA]">即時動態</p>
        )}

        <div
          className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-xl bg-white/[0.06] p-0.5"
          role="tablist"
          aria-label="即時動態場景"
        >
          {allowed.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={scene === s.key}
              onClick={() => selectScene(s.key)}
              className={`shrink-0 rounded-[10px] px-2.5 py-1 text-[10px] font-medium transition-colors ${
                scene === s.key
                  ? 'bg-[#007AFF] text-white shadow-sm'
                  : 'text-[#8E8E93] hover:text-[#E5E5EA]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <LiveBadge live={Boolean(feed?.live)} />
      </div>

      <div className={page ? 'min-h-0 flex-1' : undefined}>
        {scene === 'pipeline' && (
          <PipelineScene variant={variant} motion={motionActive} feed={feed} />
        )}
        {scene === 'company' && <CompanyScene variant={variant} feed={feed} />}
        {scene === 'report' && <ReportScene variant={variant} feed={feed} />}
        {scene === 'budget' && (
          <BudgetScene variant={variant} motion={motionActive} feed={feed} />
        )}
        {scene === 'opc' && <OpcScene variant={variant} feed={feed} />}
        {scene === 'balancer' && (
          <StageRouterLive
            variant={dense ? 'compact' : page ? 'page' : 'full'}
            motion={motionActive}
            backends={backends}
            routing={feed?.optimization?.routing_feedback}
            live={Boolean(feed?.live)}
            activePhase={activePhase}
            embedded
            className="!border-0 !bg-transparent !p-0 h-full"
          />
        )}
      </div>
    </div>
  );
}
