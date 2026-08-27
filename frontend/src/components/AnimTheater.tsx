/**
 * AnimTheater — 即時動態視圖（真實監控驅動）。
 *
 * 場景：管線 · 協作 · 匯報 · 預算 · OPC · 路由
 * 動畫只跟 feed／phase／事件增量同步；場景僅手動切換，不定時「自動下一步」。
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

const SCENES: Array<{ key: AnimScene; icon: string; label: string; hint: string }> = [
  { key: 'pipeline', icon: '⟶', label: '管線', hint: 'phase 點亮節點' },
  { key: 'company', icon: '🏢', label: '協作', hint: '忙碌角色扇出' },
  { key: 'report', icon: '🎙️', label: '匯報', hint: '最新角色事件' },
  { key: 'budget', icon: '💰', label: '預算', hint: 'API／雲占比' },
  { key: 'opc', icon: '🏭', label: 'OPC', hint: '邊緣快取／護欄' },
  { key: 'balancer', icon: '⚖️', label: '路由', hint: '環節→模型' },
];

const PIPELINE_NODES = [
  { id: 'sense', label: '感知', color: '#38bdf8' },
  { id: 'route', label: '路由', color: '#828fff' },
  { id: 'gen', label: '生成', color: '#a78bfa' },
  { id: 'eval', label: '評估', color: '#f59e0b' },
  { id: 'reflect', label: '反思', color: '#f472b6' },
  { id: 'out', label: '輸出', color: '#4cc38a' },
];

const ROLE_COLORS = ['#828fff', '#38bdf8', '#f59e0b', '#a78bfa', '#f472b6', '#4cc38a', '#22d3ee'];

function LiveBadge({ live, updatedAt }: { live: boolean; updatedAt?: string | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] ${
        live
          ? 'live-badge-pulse border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-gray-700 text-gray-500'
      }`}
      title={updatedAt ? `更新 ${updatedAt}` : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-gray-600'}`} />
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
      className={`anim-stage relative overflow-hidden rounded-lg border border-gray-800/80 bg-[#0a0a0b] ${STAGE_HEIGHT[variant]} ${
        page ? 'flex min-h-[280px] flex-col' : ''
      }`}
    >
      <div className="pointer-events-none absolute inset-0 anim-grid-bg opacity-40" />
      <div className={`relative z-[1] flex flex-col p-2.5 ${page ? 'min-h-0 flex-1' : 'h-full'}`}>
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[2] border-t border-gray-800/60 bg-black/50 px-2 py-1 text-center text-[10px] text-gray-400">
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

  const pathHint = feed?.resolvedPath
    ? `路徑 ${feed.resolvedPath}`
    : feed?.runningTasks
      ? `${feed.runningTasks} 任務進行中`
      : '等待任務 phase';
  const caption =
    liveIdx != null
      ? `${PIPELINE_NODES[liveIdx].label} · ${feed?.streamPhase || feed?.taskPhase} · ${pathHint}`
      : `待命 · ${pathHint}`;

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
                  className={`anim-link absolute left-[55%] top-[18px] h-0.5 ${
                    compact ? 'w-[70%]' : 'w-[80%]'
                  } ${done ? 'bg-emerald-400/60' : 'bg-gray-700'}`}
                />
              )}
              <div
                className={`relative z-[1] flex items-center justify-center rounded-lg border transition-all duration-300 ${
                  compact ? 'h-9 w-full max-w-[48px]' : 'h-11 w-full max-w-[72px]'
                } ${
                  active
                    ? 'anim-node-pulse border-white/30 scale-105'
                    : done
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-gray-700 bg-gray-900/80'
                }`}
                style={active ? { borderColor: n.color, background: `${n.color}22` } : undefined}
              >
                <span
                  className={`font-medium ${compact ? 'text-[9px]' : 'text-[11px]'}`}
                  style={{ color: n.color }}
                >
                  {n.label}
                </span>
              </div>
              {!compact && <span className="mt-1 text-[9px] text-gray-600">{n.id}</span>}
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
  const caption = hasActivity
    ? `${busy.length} 席活躍 · 開放工作 ${open} · 公司任務 ${companyRunning}`
    : '目前無忙碌角色 · 待命';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className="relative flex flex-1 flex-col pb-5">
        {!hasActivity ? (
          <div className="flex flex-1 items-center justify-center text-[11px] text-gray-600">
            公司任務啟動後顯示 Manager／角色扇出
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <div
                className={`rounded-lg border px-3 py-1.5 text-[11px] ${
                  manager || companyRunning > 0
                    ? 'anim-node-pulse border-[#828fff] bg-[#828fff]/15 text-[#828fff]'
                    : 'border-gray-700 text-gray-400'
                }`}
              >
                {manager?.name ?? 'Manager'}
                {manager ? ` · ${manager.executing || manager.queue || 0}` : ''}
              </div>
            </div>
            <div className={`mt-2 grid grid-cols-3 gap-1.5 ${compact ? 'px-1' : 'px-6'}`}>
              {(workers.length ? workers : busy.slice(0, 3)).map((r, i) => {
                const isHot = active.some((b) => b.id === r.id);
                const color = ROLE_COLORS[i % ROLE_COLORS.length];
                const pct =
                  Math.min(100, Math.round((r.capacity_used ?? 0) * 100) || (r.executing ? 55 : 12));
                return (
                  <div
                    key={r.id}
                    className={`rounded-md border px-1.5 py-2 text-center transition-all ${
                      isHot ? 'anim-node-pulse' : ''
                    }`}
                    style={{
                      borderColor: color,
                      background: `${color}18`,
                      color,
                    }}
                  >
                    <p className={`truncate ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{r.name}</p>
                    <div className="mx-auto mt-1 h-1 w-3/4 overflow-hidden rounded-full bg-gray-800">
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
                className={`rounded-md border px-2 py-1 text-[10px] ${
                  reviewers.length
                    ? 'anim-node-pulse border-pink-400/50 bg-pink-500/10 text-pink-300'
                    : 'border-gray-700 text-gray-500'
                }`}
              >
                Reviewer{reviewers.length ? ` · ${reviewers.length}` : ''}
              </div>
              <div
                className={`rounded-md border px-2 py-1 text-[10px] ${
                  synths.length
                    ? 'anim-node-pulse border-emerald-400/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-gray-700 text-gray-500'
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
  const lines = useMemo(() => buildReportLines(feed?.agents ?? [], 10), [feed?.agents]);
  const [idx, setIdx] = useState(0);
  const latestId = lines[0]?.id;

  useEffect(() => {
    setIdx(0);
  }, [latestId]);

  const speaker = lines[idx] ?? null;

  return (
    <StageShell
      variant={variant}
      caption={speaker ? `${speaker.role} · 最新事件` : '等待 Agent 事件'}
    >
      <div className="flex flex-1 flex-col pb-5">
        {lines.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[11px] text-gray-600">
            尚無角色事件 · 任務開始後顯示真實匯報
          </div>
        ) : (
          <>
            <div className={`flex flex-wrap justify-center gap-1 ${compact ? 'mb-2' : 'mb-3'}`}>
              {lines.slice(0, compact ? 4 : 8).map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={`max-w-[88px] truncate rounded-full border px-2 py-0.5 text-[9px] transition-all ${
                    i === idx
                      ? 'anim-speak-ring scale-105 border-white/40 text-white'
                      : 'border-gray-700 text-gray-500 hover:text-gray-300'
                  }`}
                  style={
                    i === idx ? { background: `${ROLE_COLORS[i % ROLE_COLORS.length]}33` } : undefined
                  }
                >
                  {s.role}
                </button>
              ))}
            </div>
            <div
              className={`mx-auto flex max-w-lg flex-1 items-center justify-center rounded-xl border border-gray-800 bg-gray-900/60 ${
                compact ? 'px-2' : 'px-4'
              }`}
            >
              <div className="anim-caption-in text-center" key={speaker?.id ?? 'idle'}>
                <p
                  className={`font-semibold ${compact ? 'text-[10px]' : 'text-xs'}`}
                  style={{ color: speaker?.accent ?? '#828fff' }}
                >
                  {speaker?.role ?? '系統'}
                </p>
                <p className={`mt-1 text-gray-300 ${compact ? 'text-[10px] leading-snug' : 'text-[12px]'}`}>
                  「{speaker?.line ?? '待命'}」
                </p>
              </div>
            </div>
          </>
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

  const today = feed?.billing?.today_total;
  const caption =
    b.totalUsd > 0
      ? `Agent 合計 $${b.totalUsd.toFixed(4)} · API $${b.apiUsd.toFixed(4)} · 雲 $${b.cloudUsd.toFixed(4)}${
          today != null ? ` · 雲今日 $${today.toFixed(3)}` : ''
        }`
      : '尚無用量 · 有 LLM／雲呼叫後顯示真實占比';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className={`grid flex-1 grid-cols-2 gap-2 pb-5 ${compact ? '' : 'gap-3 px-2'}`}>
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2">
          <p className="text-[10px] text-sky-300">API / Token</p>
          <p className={`font-mono ${compact ? 'text-lg' : 'text-2xl'} text-sky-200`}>
            {b.totalUsd > 0 ? `${b.apiPct}%` : '—'}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-300 transition-[width] duration-500 ${
                b.totalUsd > 0 && burst > 0 ? 'anim-budget-flow' : ''
              }`}
              style={{ width: `${b.apiPct}%` }}
            />
          </div>
          {!compact && (
            <p className="mt-1 font-mono text-[9px] text-gray-500">${b.apiUsd.toFixed(4)}</p>
          )}
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-[10px] text-amber-300">雲資源</p>
          <p className={`font-mono ${compact ? 'text-lg' : 'text-2xl'} text-amber-200`}>
            {b.totalUsd > 0 ? `${b.cloudPct}%` : '—'}
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300 transition-[width] duration-500 ${
                b.totalUsd > 0 && burst > 0 ? 'anim-budget-flow' : ''
              }`}
              style={{ width: `${b.cloudPct}%` }}
            />
          </div>
          {!compact && (
            <p className="mt-1 font-mono text-[9px] text-gray-500">${b.cloudUsd.toFixed(4)}</p>
          )}
        </div>
      </div>
      {motion &&
        burst > 0 &&
        b.totalUsd > 0 &&
        [0, 1].map((i) => (
          <Packet
            key={`${burst}-${i}`}
            color={i % 2 === 0 ? '#38bdf8' : '#f59e0b'}
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
    ? `邊緣快取新鮮 · TTL ${edge?.edge_ttl_sec ?? '—'}s · 讀取 ${readings}`
    : reachable
      ? `連線中 · 快取未命中／過期 · 攔截 ${blocked}`
      : opc?.guard?.sim_enabled
        ? '模擬 OPC · 等待真實讀取'
        : 'OPC 離線 · 無邊緣流量';

  return (
    <StageShell variant={variant} caption={caption}>
      <div className={`flex flex-1 items-center justify-around pb-5 ${compact ? 'px-1' : 'px-6'}`}>
        <div
          className={`rounded-xl border px-3 py-3 text-center ${
            reachable ? 'anim-node-pulse border-cyan-400/40 bg-cyan-500/10' : 'border-gray-700'
          }`}
        >
          <p className="text-[10px] text-cyan-300">感測器</p>
          <p className={`font-mono text-cyan-100 ${compact ? 'text-sm' : 'text-lg'}`}>
            {reachable ? 'ONLINE' : 'OFF'}
          </p>
        </div>
        <div className="relative flex flex-col items-center gap-1">
          <div
            className={`h-0.5 ${compact ? 'w-10' : 'w-16'} ${
              edgeHit ? 'bg-emerald-400/70' : 'bg-amber-400/40'
            }`}
          />
          <span
            className={`rounded-full px-1.5 py-0.5 text-[8px] text-white ${
              edgeHit ? 'bg-emerald-500' : reachable ? 'bg-amber-500' : 'bg-gray-600'
            }`}
          >
            {edgeHit ? 'edge hit' : reachable ? 'cloud miss' : 'idle'}
          </span>
          <div
            className={`h-0.5 ${compact ? 'w-10' : 'w-16'} ${
              edgeHit ? 'bg-emerald-400/40' : 'bg-amber-400/30'
            }`}
          />
        </div>
        <div
          className={`rounded-xl border px-3 py-3 text-center ${
            edgeHit
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : reachable
                ? 'anim-node-pulse border-amber-400/40 bg-amber-500/10'
                : 'border-gray-700'
          }`}
        >
          <p
            className={`text-[10px] ${
              edgeHit ? 'text-emerald-300' : reachable ? 'text-amber-300' : 'text-gray-500'
            }`}
          >
            {edgeHit ? '邊緣層' : '雲端層'}
          </p>
          <p className={`font-mono ${compact ? 'text-sm' : 'text-lg'} text-gray-100`}>
            {edgeHit ? `TTL ${edge?.edge_ttl_sec ?? '—'}` : '診斷決策'}
          </p>
        </div>
        {!edgeHit && blocked > 0 && (
          <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 px-2 py-3 text-center">
            <p className="text-[10px] text-violet-300">護欄</p>
            <p className={`font-mono text-violet-100 ${compact ? 'text-xs' : 'text-sm'}`}>
              攔截 {blocked}
            </p>
          </div>
        )}
      </div>
    </StageShell>
  );
}

export default function AnimTheater({
  variant = 'full',
  motion = true,
  autoPlay,
  initialScene = 'pipeline',
  className = '',
  scenes,
  feed,
  scene: controlledScene,
  onSceneChange,
  hideBrand = false,
}: {
  variant?: AnimVariant;
  /** 允許對資料增量做過渡動畫；關閉則凍結飛球／封包（場景仍手動切換） */
  motion?: boolean;
  /** @deprecated 改用 motion */
  autoPlay?: boolean;
  initialScene?: AnimScene;
  className?: string;
  scenes?: AnimScene[];
  feed?: AnimLiveFeed | null;
  scene?: AnimScene;
  onSceneChange?: (scene: AnimScene) => void;
  hideBrand?: boolean;
}) {
  const allowMotion = autoPlay ?? motion;

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

  const [motionOn, setMotionOn] = useState(allowMotion);
  const dense = variant === 'compact';
  const dock = variant === 'dock';
  const page = variant === 'page';
  const backends = useMemo(() => stageBackends(feed?.optimization), [feed?.optimization]);
  const activePhase = feed?.streamPhase || feed?.taskPhase || null;

  useEffect(() => {
    setMotionOn(allowMotion);
  }, [allowMotion]);

  const selectScene = useCallback(
    (key: AnimScene) => {
      setInnerScene(key);
      onSceneChange?.(key);
    },
    [onSceneChange],
  );

  const showBrandTitle = !hideBrand && !page && !dense && !dock;

  return (
    <div
      className={`anim-theater ${
        page ? 'flex min-h-0 flex-col' : 'rounded-xl border border-gray-800 bg-gray-950/70'
      } ${dense ? 'p-2' : dock ? 'p-2.5' : page ? '' : 'p-4'} ${className}`}
    >
      <div
        className={`flex items-center gap-2 ${
          dense || dock ? 'mb-1.5' : page ? 'mb-2 shrink-0' : 'mb-3'
        }`}
      >
        {showBrandTitle && (
          <p className="mr-1 shrink-0 text-sm font-semibold text-gray-200">即時動態</p>
        )}
        {dense && (
          <p className="shrink-0 text-[11px] font-medium text-gray-300">
            {allowed.find((s) => s.key === scene)?.icon}{' '}
            {allowed.find((s) => s.key === scene)?.label}
          </p>
        )}

        <div className={`flex min-w-0 flex-1 gap-1 overflow-x-auto ${dense ? 'pb-0.5' : ''}`}>
          {allowed.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => selectScene(s.key)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[10px] transition-colors ${
                scene === s.key
                  ? 'border-[#5e6ad2]/50 bg-[#5e6ad2]/15 text-[#828fff]'
                  : 'border-gray-800 text-gray-500 hover:text-gray-300'
              }`}
              title={s.hint}
            >
              <span className="mr-1">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <LiveBadge live={Boolean(feed?.live)} updatedAt={feed?.updatedAt} />
          <button
            type="button"
            onClick={() => setMotionOn((v) => !v)}
            className="rounded-md border border-[#5e6ad2]/40 bg-[#5e6ad2]/10 px-2 py-1 text-[10px] text-[#828fff]"
            title="僅影響過渡飛球；場景不會自動切換"
          >
            {motionOn ? '凍結過渡' : '允許過渡'}
          </button>
        </div>
      </div>

      <div className={page ? 'min-h-0 flex-1' : undefined}>
        {scene === 'pipeline' && (
          <PipelineScene variant={variant} motion={motionOn} feed={feed} />
        )}
        {scene === 'company' && <CompanyScene variant={variant} feed={feed} />}
        {scene === 'report' && <ReportScene variant={variant} feed={feed} />}
        {scene === 'budget' && (
          <BudgetScene variant={variant} motion={motionOn} feed={feed} />
        )}
        {scene === 'opc' && <OpcScene variant={variant} feed={feed} />}
        {scene === 'balancer' && (
          <StageRouterLive
            variant={dense ? 'compact' : page ? 'page' : 'full'}
            motion={motionOn}
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
