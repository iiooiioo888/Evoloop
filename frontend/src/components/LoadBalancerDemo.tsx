/**
 * StageRouterLive — 任務-模型匹配即時視圖（真實 stage_router）。
 *
 * 後端柱 = generate / evaluate / reflect… 真實環節
 * 權重 = tier（僅影響柱高顯示）
 * 光點 = 僅在 activePhase 真正切換時發射一次
 * 禁止：定時輪詢、加權序列自動下一步、閒置掃描
 *
 * embedded：由 AnimTheater 承載場景列；本元件只渲染舞台＋底部狀態列。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AnimStageBackend } from '../lib/animLive';
import { stageBackendsKey } from '../lib/animLive';

export type LbVariant = 'compact' | 'full' | 'page';

type FlyingOrb = {
  id: number;
  target: number;
  color: string;
};

const ORB_COLORS = ['#007AFF', '#34C759', '#FF9500', '#64D2FF', '#FF3B30', '#BF5AF2'];

function stageIndexFromPhase(
  backends: AnimStageBackend[],
  phase?: string | null,
): number | null {
  if (!phase) return null;
  const p = phase.toLowerCase();
  const idx = backends.findIndex(
    (b) => p.includes(b.id.toLowerCase()) || p.includes(b.label.toLowerCase()),
  );
  return idx >= 0 ? idx : null;
}

export default function StageRouterLive({
  variant = 'full',
  motion = true,
  className = '',
  backends: backendsProp,
  routing,
  live = false,
  embedded = false,
  activePhase,
}: {
  variant?: LbVariant;
  /** 為 false 時不發射飛球，仍顯示靜態映射 */
  motion?: boolean;
  className?: string;
  backends?: AnimStageBackend[];
  routing?: {
    total: number;
    simple_count: number;
    company_count: number;
    adaptive_length_threshold: number;
  } | null;
  live?: boolean;
  /** 嵌在劇場內時不重複標題／說明文 */
  embedded?: boolean;
  /** 當前 stream／task phase，用於點亮對應環節 */
  activePhase?: string | null;
}) {
  const backends = useMemo(
    () =>
      backendsProp?.length
        ? backendsProp
        : [
            { id: 'generate', label: 'generate', tier: '—', model: '—', weight: 2 },
            { id: 'evaluate', label: 'evaluate', tier: '—', model: '—', weight: 2 },
            { id: 'reflect', label: 'reflect', tier: '—', model: '—', weight: 2 },
            { id: 'improve', label: 'improve', tier: '—', model: '—', weight: 2 },
          ],
    [backendsProp],
  );

  const backendsKey = stageBackendsKey(backends);
  const [loads, setLoads] = useState<number[]>(() => backends.map(() => 0));
  const [flying, setFlying] = useState<FlyingOrb[]>([]);
  const prevPhaseIdx = useRef<number | null>(null);
  const orbSeq = useRef(0);
  const mappedKey = useRef(backendsKey);

  const phaseIdx = stageIndexFromPhase(backends, activePhase);

  useEffect(() => {
    if (mappedKey.current === backendsKey) return;
    mappedKey.current = backendsKey;
    setLoads(backends.map(() => 0));
    setFlying([]);
    prevPhaseIdx.current = null;
  }, [backendsKey, backends]);

  /** 僅 phase 真正切換時點亮並發一顆光點；不輪詢、不加權序列走位 */
  useEffect(() => {
    if (phaseIdx == null) {
      prevPhaseIdx.current = null;
      return;
    }
    if (prevPhaseIdx.current === phaseIdx) return;

    const isFirstAlign = prevPhaseIdx.current === null;
    prevPhaseIdx.current = phaseIdx;

    setLoads((prev) => {
      const next = [...prev];
      while (next.length < backends.length) next.push(0);
      if (!isFirstAlign) {
        next[phaseIdx] = (next[phaseIdx] ?? 0) + 1;
      }
      return next;
    });

    if (!motion || isFirstAlign) return;

    orbSeq.current += 1;
    const id = orbSeq.current;
    setFlying((prev) => [
      ...prev.filter((o) => o.id > id - 3),
      {
        id,
        target: phaseIdx,
        color: ORB_COLORS[phaseIdx % ORB_COLORS.length],
      },
    ]);
  }, [phaseIdx, motion, backends.length]);

  useEffect(() => {
    if (!flying.length) return;
    const t = window.setTimeout(() => {
      setFlying((prev) => prev.slice(-1));
    }, 700);
    return () => window.clearTimeout(t);
  }, [flying]);

  const isCompact = variant === 'compact';
  const isPage = variant === 'page';
  const totalRoutes = routing?.total ?? 0;
  const active = backends[phaseIdx ?? -1];
  const caption =
    active && phaseIdx != null
      ? `${active.label} · ${active.model} · ${active.tier}${
          totalRoutes > 0 ? ` · 累計路由 ${totalRoutes}` : ''
        }`
      : totalRoutes > 0
        ? `靜態映射 · 累計路由 ${totalRoutes}（simple ${routing?.simple_count ?? 0} / company ${
            routing?.company_count ?? 0
          }）`
        : `靜態映射 · ${backends.length} 環節 · 等待真實 phase`;

  const stageH = isCompact ? 'h-[132px]' : isPage ? 'min-h-[280px] h-full' : 'h-[200px]';
  const hotIdx = phaseIdx ?? -1;

  return (
    <div
      className={`lb-demo ${embedded ? '' : 'rounded-xl border border-gray-800 bg-gray-950/70'} ${
        isCompact ? (embedded ? '' : 'p-2') : embedded ? '' : 'p-3'
      } ${isPage ? 'flex h-full min-h-0 flex-col' : ''} ${className}`}
    >
      {!embedded && (
        <div className={`flex flex-wrap items-center justify-between gap-2 ${isCompact ? 'mb-1.5' : 'mb-2'}`}>
          <p className={`font-semibold text-gray-200 ${isCompact ? 'text-[11px]' : 'text-sm'}`}>
            任務-模型
            <span className="ml-2 font-normal text-gray-500">
              {backends.length} 環節 · {live && phaseIdx != null ? 'LIVE' : 'MAP'}
            </span>
          </p>
        </div>
      )}

      <div
        className={`lb-stage relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1c1c1e]/95 ${stageH} ${
          isPage ? 'flex-1' : ''
        }`}
      >
        <div className="pointer-events-none absolute inset-0 anim-grid-bg opacity-30" />

        <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
          {backends.map((b, i) => {
            const left = isCompact ? 48 : 64;
            const topPct = 36;
            const endLeftPct = 16 + ((i + 0.5) / backends.length) * 80;
            const endTopPct = 72;
            const dx = endLeftPct - (left / (isCompact ? 280 : 520)) * 100;
            const dy = endTopPct - topPct;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const thickness = 1.2 + b.weight * 1.1;
            return (
              <div
                key={b.id}
                className="absolute origin-left rounded-full"
                style={{
                  left,
                  top: `${topPct}%`,
                  width: `${len * 1.05}%`,
                  height: thickness,
                  transform: `rotate(${angle}deg)`,
                  background:
                    i === hotIdx ? 'rgba(0,122,255,0.55)' : 'rgba(0,122,255,0.18)',
                }}
              />
            );
          })}
        </div>

        <div className="absolute left-2 top-[36%] z-10 -translate-y-1/2">
          <div
            className={`lb-dispatcher relative flex flex-col items-center justify-center rounded-xl border border-[#007AFF]/50 bg-[#007AFF]/15 ${
              isCompact ? 'h-11 w-10' : 'h-14 w-12'
            } ${phaseIdx != null && live ? 'anim-node-pulse' : ''}`}
          >
            <span className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-[#64D2FF]`}>SR</span>
            <span className="font-mono text-[9px] text-gray-400">{totalRoutes || '—'}</span>
          </div>
        </div>

        {motion &&
          flying.map((orb) => (
            <span
              key={`${orb.id}-${orb.target}`}
              className="lb-orb pointer-events-none absolute left-14 top-[36%] z-20 flex h-2.5 w-2.5 -translate-y-1/2 items-center justify-center rounded-full"
              style={
                {
                  background: orb.color,
                  boxShadow: `0 0 8px ${orb.color}`,
                  '--lb-target': String(orb.target),
                  '--lb-count': String(backends.length),
                } as CSSProperties
              }
            />
          ))}

        <div
          className={`absolute bottom-7 right-2 top-3 z-[2] flex ${
            isCompact ? 'left-14 gap-1' : 'left-20 gap-2'
          }`}
        >
          {backends.map((b, i) => {
            const load = loads[i] ?? 0;
            const cap = Math.max(3, b.weight * 4);
            const pct = Math.min(100, (load / cap) * 100);
            const hot = i === hotIdx;
            return (
              <div key={b.id} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                {!isCompact && (
                  <p className="mb-1 max-w-full truncate px-0.5 text-center font-mono text-[9px] text-[#64D2FF]">
                    {b.model}
                  </p>
                )}
                <div
                  className={`lb-backend relative flex w-full flex-col justify-end overflow-hidden rounded-md border border-gray-700 bg-gray-900/80 ${
                    hot && live ? 'lb-backend-ok' : ''
                  }`}
                  style={{
                    height: `${24 + b.weight * (isCompact ? 14 : isPage ? 28 : 22)}px`,
                    borderColor: hot ? ORB_COLORS[i % ORB_COLORS.length] : undefined,
                  }}
                >
                  <div
                    className="lb-fill w-full bg-emerald-500/60 transition-[height] duration-200"
                    style={{ height: `${pct}%` }}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center">
                    <p className={`truncate px-0.5 font-mono text-gray-300 ${isCompact ? 'text-[7px]' : 'text-[9px]'}`}>
                      {b.label}
                    </p>
                    <p className="font-mono text-[8px] text-gray-500">
                      {load} · w{b.weight}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-[3] border-t border-gray-800/60 bg-black/50 px-2 py-1 text-center text-[10px] text-gray-400">
          {caption}
        </div>
      </div>
    </div>
  );
}
