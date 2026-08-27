/**
 * ChatMonitorCards — 對話頁監控卡片共用元件。
 */
import type { ReactNode } from 'react';

export function TopKpi({
  label,
  value,
  hint,
  accent,
  pulse,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={`anim-card-rise min-w-0 rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2.5 transition-shadow duration-300 ${
        pulse ? 'ring-1 ring-emerald-500/30 live-kpi-pulse' : ''
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-lg ${accent || 'text-gray-100'}`}>{value}</p>
      {hint && <p className="truncate text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

export function MiniKpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'green' | 'amber' | 'blue' | 'orange' | 'violet' | 'red' | 'cyan';
}) {
  const valueCls =
    accent === 'green'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-300'
        : accent === 'blue'
          ? 'text-sky-300'
          : accent === 'orange'
            ? 'text-orange-300'
            : accent === 'violet'
              ? 'text-[#828fff]'
              : accent === 'red'
                ? 'text-red-300'
                : accent === 'cyan'
                  ? 'text-cyan-300'
                  : 'text-gray-100';
  return (
    <div className="anim-card-rise rounded-lg border border-gray-800 bg-gray-950/60 px-2.5 py-2 transition-colors duration-200 hover:border-gray-700">
      <p className="text-[9px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${valueCls}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

export function MonitorSection({
  title,
  hint,
  badge,
  children,
}: {
  title: string;
  hint?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="anim-card-rise rounded-xl border border-gray-800 bg-gray-900/70 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h4>
          {badge && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                badge === 'LIVE'
                  ? 'live-badge bg-emerald-500/15 text-emerald-300'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function HealthPill({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean | null;
  detail?: string;
}) {
  const dot =
    ok === null ? 'bg-gray-500' : ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400';
  const text = ok === null ? 'text-gray-400' : ok ? 'text-emerald-300' : 'text-red-300';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-800/80 bg-gray-950/40 px-2 py-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-gray-300">{label}</p>
        {detail && <p className={`truncate text-[10px] ${text}`}>{detail}</p>}
      </div>
    </div>
  );
}

export function LiveTicker({
  items,
}: {
  items: Array<{ key: string; text: string; ts?: string; accent?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="shrink-0 overflow-hidden border-t border-gray-800/80 bg-gray-950/60">
      <div className="flex items-center gap-3 px-3 py-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80">
          LIVE
        </span>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex gap-4 whitespace-nowrap">
            {items.map((it) => (
              <span key={it.key} className={`text-[11px] ${it.accent || 'text-gray-400'}`}>
                {it.ts && <span className="mr-1 font-mono text-gray-600">{it.ts}</span>}
                {it.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const ROADMAP_TONE: Record<string, string> = {
  P0: 'border-[#5e6ad2]/40 bg-[#5e6ad2]/10',
  P1: 'border-emerald-500/30 bg-emerald-500/5',
  P2: 'border-amber-500/30 bg-amber-500/5',
  P3: 'border-gray-700 bg-gray-950/60',
};

function roadmapStatusText(enabled: boolean, status: string): string {
  if (!enabled || status === 'disabled') return '停用';
  if (status === 'learning') return '學習';
  return '運行';
}

export function RoadmapChip({
  priority,
  label,
  benefit,
  enabled,
  status,
  compact,
  metric,
}: {
  priority: string;
  label: string;
  benefit?: string;
  enabled: boolean;
  status: string;
  compact?: boolean;
  metric?: string;
}) {
  const tone = ROADMAP_TONE[priority] ?? ROADMAP_TONE.P3;
  const active = enabled && status !== 'disabled';
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 ${tone} ${active ? '' : 'opacity-60'}`}
      title={benefit}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] font-bold text-gray-400">{priority}</span>
        <span className={`text-[9px] ${active ? 'text-emerald-300/90' : 'text-gray-500'}`}>
          {roadmapStatusText(enabled, status)}
        </span>
      </div>
      <p className={`truncate ${compact ? 'text-[10px]' : 'text-[11px]'} text-gray-200`}>{label}</p>
      {metric && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-gray-500">{metric}</p>
      )}
      {benefit && !compact && !metric && (
        <p className="mt-0.5 truncate text-[9px] text-gray-500">{benefit}</p>
      )}
    </div>
  );
}

const PRIORITY_BADGE: Record<string, string> = {
  P0: 'bg-[#5e6ad2]/20 text-[#828fff] border-[#5e6ad2]/40',
  P1: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  P2: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  P3: 'bg-gray-800/60 text-gray-400 border-gray-700',
};

export function RoadmapTable({
  items,
  compact,
}: {
  items: Array<{
    priority: string;
    id: string;
    label: string;
    benefit: string;
    enabled: boolean;
    status: string;
    metric?: string;
  }>;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-800">
      <table className="w-full text-left">
        <thead className={`bg-gray-950/80 text-gray-500 ${compact ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-wider`}>
          <tr>
            <th className="px-2 py-1.5 font-medium w-12">優先級</th>
            <th className="px-2 py-1.5 font-medium">優化項</th>
            <th className="hidden px-2 py-1.5 font-medium sm:table-cell">預期收益</th>
            <th className="px-2 py-1.5 font-medium w-20">狀態</th>
            {items.some((i) => i.metric) && (
              <th className="hidden px-2 py-1.5 font-medium lg:table-cell">即時指標</th>
            )}
          </tr>
        </thead>
        <tbody className={compact ? 'text-[10px]' : 'text-[11px]'}>
          {items.map((item) => {
            const active = item.enabled && item.status !== 'disabled';
            const badge = PRIORITY_BADGE[item.priority] ?? PRIORITY_BADGE.P3;
            return (
              <tr key={item.id} className={`border-t border-gray-800/80 ${active ? '' : 'opacity-60'}`}>
                <td className="px-2 py-1.5">
                  <span className={`inline-block rounded border px-1 py-0.5 text-[9px] font-bold ${badge}`}>
                    {item.priority}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-200">{item.label}</td>
                <td className="hidden px-2 py-1.5 text-gray-500 sm:table-cell">{item.benefit}</td>
                <td className="px-2 py-1.5">
                  <span className={active ? 'text-emerald-300' : 'text-gray-500'}>
                    {roadmapStatusText(item.enabled, item.status)}
                  </span>
                </td>
                {items.some((i) => i.metric) && (
                  <td className="hidden px-2 py-1.5 font-mono text-gray-500 lg:table-cell">
                    {item.metric ?? '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
