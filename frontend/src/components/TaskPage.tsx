/** 整頁任務視圖（現代化深色玻璃風格）。
 *
 * 區塊：頂欄（狀態/進度/耗時）→ 執行階段（步驟條）→ 任務規劃 →
 * 角色流水線 → 工作項（可展開：產出/審查反饋/成本/依賴）→
 * 品質評估 → Manager 最終審查 → 事件時間軸（可展開明細）→
 * 預算統計（卡格）→ 最終交付。
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { TaskProgress, KanbanItem } from '../types';
import {
  COMPANY_PHASES,
  EVENT_LABELS,
  ITEM_STATUS_META,
  RoleIcon,
  STANDARD_PHASES,
  elapsed,
  phaseIndex,
  roleLabel,
} from './TaskPanel';
import type { RoleStatus } from './TaskPanel';

interface TaskPageProps {
  task: TaskProgress;
  onBack: () => void;
}

/** 耗時格式化 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m} 分 ${s} 秒`;
  return `${Math.floor(m / 60)} 時 ${m % 60} 分`;
}

/** 區塊標題（圖示 + 小寫間距字 + 右側附加內容） */
function SectionTitle({ icon, text, extra }: { icon?: string; text: string; extra?: React.ReactNode }) {
  return (
    <h2 className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
      {icon && <span className="text-sm">{icon}</span>}
      <span className="bg-gradient-to-r from-gray-200 to-gray-400 bg-clip-text text-transparent">{text}</span>
      {extra}
    </h2>
  );
}

/** 可展開的工作項卡片 */
function WorkItemCard({ item, status, allItems }: {
  item: KanbanItem;
  status: string;
  allItems: KanbanItem[];
}) {
  const [open, setOpen] = useState(false);
  const meta = ITEM_STATUS_META[status] ?? { label: status, cls: 'bg-gray-700/60 text-gray-300', bar: 'bg-gray-500' };
  const hasDetails = !!(item.description || item.output || (item.feedback?.length ?? 0) > 0);
  const depTitles = (item.depends_on ?? [])
    .map((id) => allItems.find((x) => x.id === id)?.title ?? id)
    .filter(Boolean);

  return (
    <div
      className={`mb-2 overflow-hidden rounded-lg border transition-colors duration-200 last:mb-0 ${
        open
          ? 'border-gray-600/70 bg-gray-800/70'
          : 'border-transparent bg-gray-900/60 hover:border-gray-700/60 hover:bg-gray-800/60'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 p-2.5 text-left"
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        {/* 左側狀態色條 */}
        <span className={`mt-0.5 h-4 w-1 shrink-0 rounded-full ${meta.bar}`} />
        <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-px text-[11px] font-medium ${meta.cls}`}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-5 text-gray-200">{item.title}</span>
        {typeof item.actual_cost === 'number' && item.actual_cost > 0 && (
          <span className="shrink-0 rounded bg-gray-800/80 px-1 py-px text-[10px] text-gray-500">
            ${item.actual_cost}
          </span>
        )}
        {hasDetails && (
          <span className={`shrink-0 text-[10px] text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            ▼
          </span>
        )}
      </button>

      {open && (
        <div className="task-expand-in mx-2.5 mb-2.5 flex flex-col gap-2.5 border-t border-gray-700/50 pt-2.5 text-xs">
          {item.description && (
            <div>
              <p className="mb-1 font-medium text-gray-400">📝 任務描述</p>
              <p className="whitespace-pre-wrap leading-relaxed text-gray-300">{item.description}</p>
            </div>
          )}
          {depTitles.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-gray-400">🔗 依賴工作項</p>
              <div className="flex flex-wrap gap-1.5">
                {depTitles.map((t, i) => (
                  <span key={i} className="rounded-md bg-gray-700/40 px-2 py-0.5 text-gray-300">· {t}</span>
                ))}
              </div>
            </div>
          )}
          {(item.feedback?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 font-medium text-gray-400">🔍 審查反饋</p>
              {item.feedback!.map((fb, i) => (
                <p key={i} className="mb-1.5 whitespace-pre-wrap rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1.5 leading-relaxed text-orange-200/90 last:mb-0">
                  {String(fb.feedback ?? fb.summary ?? JSON.stringify(fb))}
                </p>
              ))}
            </div>
          )}
          {item.output && (
            <div>
              <p className="mb-1 font-medium text-gray-400">📦 產出內容</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-700/50 bg-black/40 p-2.5 font-sans leading-relaxed text-gray-200">
                {item.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskPage({ task, onBack }: TaskPageProps) {
  const isCompany = task.mode === 'company';
  const phases = isCompany ? COMPANY_PHASES : STANDARD_PHASES;
  const running = task.status === 'running' || task.status === 'pending';
  const failed = task.status === 'failed';
  const currentIdx = phaseIndex(phases, task.phase);
  const phasePassed = (i: number) =>
    failed ? i < currentIdx : i < currentIdx || (!running && i <= currentIdx);

  // ── 耗時即時計時 ──
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const durationSec = task.created_at ? Math.max(0, Math.floor(now / 1000 - task.created_at)) : 0;

  // ── 整體進度百分比（階段 + 工作項混合，粒度更細） ──
  const totalCount = Object.values(task.kanban).reduce((s, items) => s + items.length, 0);
  const doneCount = task.kanban.done?.length ?? 0;
  const progressPct = (() => {
    if (task.status === 'completed') return 100;
    const phasePct = Math.round(
      ((failed ? currentIdx : Math.max(currentIdx, 0)) / phases.length) * 100,
    );
    // 執行階段內以工作項完成度細化（佔 16%~66% 區間）
    const itemPct =
      totalCount > 0 && currentIdx >= 1
        ? 16 + Math.round((doneCount / totalCount) * 50)
        : 0;
    return Math.min(95, Math.max(phasePct, itemPct));
  })();

  const allItems = useMemo(
    () => Object.values(task.kanban).flat(),
    [task.kanban],
  );

  // ── 按角色分組工作項 ──
  const roleGroups = useMemo(() => {
    if (!isCompany) return [];
    const groups = new Map<string, { status: string; item: KanbanItem }[]>();
    for (const [status, items] of Object.entries(task.kanban)) {
      for (const item of items) {
        const role = item.assignee || 'developer';
        if (!groups.has(role)) groups.set(role, []);
        groups.get(role)!.push({ status, item });
      }
    }
    return [...groups.entries()].map(([role, entries]) => {
      const statusSet = new Set(entries.map((e) => e.status));
      let status: RoleStatus = 'pending';
      if (statusSet.has('executing')) status = 'active';
      else if (statusSet.has('blocked')) status = 'failed';
      else if (statusSet.has('in_review') || statusSet.has('rework') || statusSet.has('ready')) status = 'waiting';
      else if ([...statusSet].every((s) => s === 'done')) status = 'done';
      return { role, status, entries };
    });
  }, [isCompany, task.kanban]);

  const SPECIAL_ROLES = new Set(['manager', 'reviewer', 'synthesizer']);
  const managerStatus: RoleStatus =
    task.phase === 'decompose' || task.phase === 'final_review'
      ? 'active'
      : currentIdx > 0 || task.status === 'completed'
        ? 'done'
        : 'pending';
  const reviewerStatus: RoleStatus =
    (task.kanban.in_review?.length ?? 0) > 0
      ? 'active'
      : (task.kanban.done?.length ?? 0) > 0
        ? 'done'
        : 'pending';
  const synthesizerStatus: RoleStatus =
    task.phase === 'synthesize' ? 'active' : currentIdx > 2 || task.status === 'completed' ? 'done' : 'pending';

  const pipeline: { key: string; label: string; status: RoleStatus }[] = isCompany
    ? [
        { key: 'manager', label: 'Manager', status: managerStatus },
        ...roleGroups
          .filter((g) => !SPECIAL_ROLES.has(g.role))
          .map((g) => ({ key: g.role, label: roleLabel(g.role), status: g.status })),
        { key: 'reviewer', label: 'Reviewer', status: reviewerStatus },
        { key: 'synthesizer', label: 'Synthesizer', status: synthesizerStatus },
      ]
    : [];

  const evaluations = task.events.filter((e) => e.event === 'evaluation');

  const statusBadge = running
    ? { text: '執行中', cls: 'badge-glow bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/50' }
    : failed
      ? { text: '失敗', cls: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40' }
      : { text: '已完成', cls: 'bg-green-500/15 text-green-300 ring-1 ring-green-500/40' };

  // ── 流水線芯片配色 ──
  const chipCls = (s: RoleStatus) =>
    s === 'active'
      ? 'border-blue-400/60 bg-blue-500/10 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.25)]'
      : s === 'done'
        ? 'border-green-500/40 bg-green-500/10 text-green-200'
        : s === 'failed'
          ? 'border-red-500/40 bg-red-500/10 text-red-200'
          : s === 'waiting'
            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
            : 'border-gray-700/70 bg-gray-800/40 text-gray-500';

  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const toggleEvent = (i: number) =>
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  // ── 預算卡格 ──
  const budgetCards = useMemo(() => {
    if (!isCompany || Object.keys(task.budget).length === 0) return [];
    const spent = Number(task.budget.task_spent ?? 0);
    const limit = Number(task.budget.task_limit ?? 0);
    return [
      { icon: '💰', label: '花費', value: `$${spent}`, sub: limit > 0 ? `上限 $${limit}` : '' },
      { icon: '🤖', label: '模型', value: String(task.budget.active_tier ?? '-'), sub: '當前層級' },
      { icon: '🔁', label: '迭代', value: `${task.iteration} 輪`, sub: '' },
      ...(task.stats
        ? [{
            icon: '📋',
            label: '工作項',
            value: `${String(task.stats.done ?? 0)}/${String(task.stats.total ?? 0)}`,
            sub: task.stats.review_rounds != null ? `審查 ${String(task.stats.review_rounds)} 輪` : '',
          }]
        : []),
    ];
  }, [isCompany, task.budget, task.iteration, task.stats]);

  return (
    <div className="flex h-dvh flex-col bg-gray-950 text-gray-100">
      {/* ══ 頂欄（玻璃擬態，附進度條） ══ */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-gray-950/80 px-4 py-3.5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <button
            onClick={onBack}
            className="group flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-700/80 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-300 transition-all duration-200 hover:border-blue-500/70 hover:bg-blue-500/10 hover:text-blue-300 active:scale-95"
          >
            <span className="transition-transform duration-200 group-hover:-translate-x-0.5">←</span>
            返回對話
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-gray-100">
              <span className="mr-1">{isCompany ? '🏢' : '⚙️'}</span>
              {task.query}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500">
              <span className="rounded bg-gray-800/80 px-1.5 py-px font-mono text-[10px] text-gray-400">
                {task.task_id}
              </span>
              {running && task.created_at && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                  已耗時 {formatDuration(durationSec)}
                </span>
              )}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-medium ${statusBadge.cls}`}>
            {statusBadge.text}
            {task.status === 'completed' && task.score != null && ` · 評分 ${task.score}`}
          </span>
        </div>
        {/* 整體進度條（執行中带流光） */}
        <div className="mx-auto mt-3 w-full max-w-4xl">
          <div className="flex items-center gap-2.5">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800/90 ring-1 ring-white/5">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  failed ? 'bg-gradient-to-r from-red-500 to-red-400' : running ? 'progress-shimmer' : 'bg-gradient-to-r from-blue-500 to-green-400'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-300">{progressPct}%</span>
          </div>
        </div>
      </header>

      {/* ══ 內容區 ══ */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {/* ── 執行階段（步驟條） ── */}
          <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
            <SectionTitle icon="🧭" text="執行階段" />
            <div className="flex items-start">
              {phases.map((p, i) => {
                const active = running && i === currentIdx;
                const passed = phasePassed(i);
                return (
                  <div key={p.key} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      {/* 左半連接線 */}
                      <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : passed || active ? 'bg-blue-500/70' : 'bg-gray-700/60'}`} />
                      {/* 節點圓 */}
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors duration-300 ${
                          failed && i === currentIdx
                            ? 'bg-red-500/20 text-red-300 ring-2 ring-red-500/50'
                            : passed
                              ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]'
                              : active
                                ? 'node-ring bg-blue-500/20 text-blue-200 ring-2 ring-blue-400/70'
                                : 'bg-gray-800 text-gray-500 ring-1 ring-gray-700'
                        }`}
                      >
                        {failed && i === currentIdx ? '✗' : passed ? '✓' : i + 1}
                      </div>
                      {/* 右半連接線 */}
                      <div className={`h-0.5 flex-1 ${i === phases.length - 1 ? 'opacity-0' : phasePassed(i + 1) || (running && i + 1 === currentIdx) ? 'bg-blue-500/70' : 'bg-gray-700/60'}`} />
                    </div>
                    <span
                      className={`mt-2 whitespace-nowrap text-xs ${
                        active ? 'font-medium text-blue-300' : passed ? 'text-gray-300' : 'text-gray-600'
                      }`}
                    >
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {running && (
              <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-blue-400 border-t-transparent" />
                目前階段：{phases[currentIdx]?.label ?? task.phase}
                {totalCount > 0 && ` · 工作項 ${doneCount}/${totalCount} 完成`}
              </p>
            )}
            {failed && task.error && (
              <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                ⚠️ {task.error}
              </p>
            )}
          </section>

          {/* ── 任務規劃（Manager 分解結果） ── */}
          {isCompany && task.plan && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle
                icon="📋"
                text="任務規劃"
                extra={
                  <span className="flex gap-1.5 normal-case tracking-normal">
                    {task.plan.strategy && (
                      <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-normal text-indigo-300">
                        策略：{String(task.plan.strategy)}
                      </span>
                    )}
                    {task.plan.subtask_count != null && (
                      <span className="rounded-full border border-gray-600/50 bg-gray-800/80 px-2 py-0.5 text-[10px] font-normal text-gray-400">
                        {String(task.plan.subtask_count)} 個子任務
                      </span>
                    )}
                  </span>
                }
              />
              {task.plan.execution_plan != null && (
                <div className="text-sm text-gray-300">
                  {typeof task.plan.execution_plan === 'string' ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{task.plan.execution_plan}</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {(Array.isArray(task.plan.execution_plan) ? task.plan.execution_plan : []).map((step, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-semibold text-blue-300">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">
                            {typeof step === 'string'
                              ? step
                              : String((step as Record<string, unknown>).title ?? (step as Record<string, unknown>).description ?? JSON.stringify(step))}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── 角色流水線（頭像圈） ── */}
          {isCompany && pipeline.length > 1 && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle icon="👥" text="角色流水線" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                {pipeline.map((role, i) => (
                  <span key={role.key} className="flex items-center gap-2">
                    <span
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ${chipCls(role.status)}`}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        role.status === 'active' ? 'bg-blue-400/25 text-blue-100'
                          : role.status === 'done' ? 'bg-green-400/25 text-green-100'
                            : role.status === 'failed' ? 'bg-red-400/25 text-red-100'
                              : role.status === 'waiting' ? 'bg-yellow-400/25 text-yellow-100'
                                : 'bg-gray-600/40 text-gray-300'
                      }`}>
                        {role.label.charAt(0).toUpperCase()}
                      </span>
                      {role.label}
                      <RoleIcon status={role.status} />
                    </span>
                    {i < pipeline.length - 1 && <span className="text-sm text-gray-600">→</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── 工作項（按角色，可展開詳情） ── */}
          {isCompany && roleGroups.length > 0 && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle
                icon="🗂️"
                text="工作項（按角色）"
                extra={<span className="text-[10px] font-normal normal-case tracking-normal text-gray-500">點擊展開詳情</span>}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {roleGroups.map((g) => {
                  const done = g.entries.filter((e) => e.status === 'done').length;
                  return (
                    <div key={g.role} className="rounded-xl border border-white/5 bg-gray-800/40 p-3 transition-colors duration-200 hover:border-gray-600/50">
                      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                        {roleLabel(g.role)}
                        <RoleIcon status={g.status} />
                        <span className="ml-auto flex items-center gap-1.5 text-[11px] font-normal text-gray-500">
                          <span className="inline-block h-1 w-14 overflow-hidden rounded-full bg-gray-700">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-green-400 transition-all duration-500"
                              style={{ width: `${g.entries.length ? (done / g.entries.length) * 100 : 0}%` }}
                            />
                          </span>
                          {done}/{g.entries.length}
                        </span>
                      </p>
                      {g.entries.map(({ status, item }) => (
                        <WorkItemCard key={item.id} item={item} status={status} allItems={allItems} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 品質評估（評分環） ── */}
          {evaluations.length > 0 && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle icon="📊" text="品質評估" />
              <div className="flex flex-wrap gap-3">
                {evaluations.map((e, i) => {
                  const score = Number(e.data.score ?? 0);
                  const pct = Math.min(100, Math.max(0, score * 10));
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-gray-800/40 px-4 py-2.5">
                      {/* 圓環評分 */}
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-blue-200"
                        style={{ background: `conic-gradient(#3b82f6 ${pct * 3.6}deg, rgba(55,65,81,0.8) 0deg)` }}
                      >
                        <span className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-gray-900">
                          {String(e.data.score ?? '?')}
                        </span>
                      </div>
                      <div className="text-xs">
                        <p className="font-medium text-gray-200">第 {Number(e.data.iteration ?? 0) + 1} 次評估</p>
                        <p className="text-gray-500">{String(e.data.summary ?? '自動品質評分')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Manager 最終審查 ── */}
          {isCompany && task.review && (
            <section className={`task-section rounded-2xl border p-5 shadow-lg shadow-black/20 ${
              task.review.approved
                ? 'border-green-500/25 bg-gradient-to-b from-green-500/10 to-gray-900/50'
                : 'border-red-500/25 bg-gradient-to-b from-red-500/10 to-gray-900/50'
            }`}>
              <SectionTitle
                icon="🧑‍💼"
                text="Manager 最終審查"
                extra={
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium normal-case tracking-normal ${
                    task.review.approved ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {task.review.approved ? '✓ 通過' : '✗ 未通過'}
                  </span>
                }
              />
              <div className="space-y-1.5 text-sm leading-relaxed text-gray-300">
                {task.review.summary != null && <p>{String(task.review.summary)}</p>}
                {task.review.suggestions != null && (
                  <p className="text-gray-400">
                    <span className="text-gray-500">建議：</span>
                    {String(task.review.suggestions)}
                  </p>
                )}
                {task.review.degraded === true && (
                  <p className="text-xs text-yellow-400/80">⚠️ 審查異常降級：自動通過（{String(task.review.error ?? '')}）</p>
                )}
              </div>
            </section>
          )}

          {/* ── 事件時間軸（節點點綴，可展開明細） ── */}
          {isCompany && task.events.length > 0 && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle
                icon="🕒"
                text="事件時間軸"
                extra={<span className="rounded-full bg-gray-800/80 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-gray-500">{task.events.length} 條</span>}
              />
              <div className="relative ml-1.5 border-l border-gray-700/70 pl-5">
                {task.events.slice(-25).map((e, i) => {
                  const detail = Object.fromEntries(
                    Object.entries(e.data).filter(([, v]) => v !== '' && v != null),
                  );
                  const hasDetail = Object.keys(detail).length > 0;
                  const isErr = e.event === 'work_item_error' || e.event === 'budget_warning';
                  const isOk = e.event === 'work_item_done' || e.event === 'review_pass' || e.event === 'company_done';
                  return (
                    <div key={i} className="group relative mb-1 last:mb-0">
                      {/* 時間軸節點圓點 */}
                      <span className={`absolute -left-[26.5px] top-1.5 h-2 w-2 rounded-full ring-4 ring-gray-950 ${
                        isErr ? 'bg-red-400' : isOk ? 'bg-green-400' : 'bg-blue-400/80'
                      }`} />
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition-colors duration-150 hover:bg-white/5"
                        onClick={() => hasDetail && toggleEvent(i)}
                      >
                        <span className="shrink-0 text-gray-300">{EVENT_LABELS[e.event] ?? e.event}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-500">
                          {String(e.data.title ?? e.data.phase ?? '')}
                        </span>
                        {hasDetail && (
                          <span className={`shrink-0 text-[10px] text-gray-600 transition-transform duration-200 ${expandedEvents.has(i) ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-gray-600">{elapsed(e.ts)}</span>
                      </button>
                      {expandedEvents.has(i) && (
                        <pre className="task-expand-in mt-1 overflow-auto rounded-lg border border-gray-700/50 bg-black/40 p-2.5 text-[11px] leading-relaxed text-gray-400">
                          {JSON.stringify(detail, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 預算與統計（卡格） ── */}
          {budgetCards.length > 0 && (
            <section className="task-section rounded-2xl border border-white/5 bg-gradient-to-b from-gray-900/80 to-gray-900/50 p-5 shadow-lg shadow-black/20">
              <SectionTitle icon="📈" text="預算與統計" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {budgetCards.map((c) => (
                  <div key={c.label} className="rounded-xl border border-white/5 bg-gray-800/40 px-3.5 py-3 transition-colors duration-200 hover:border-gray-600/50">
                    <p className="text-[11px] text-gray-500">{c.icon} {c.label}</p>
                    <p className="mt-1 truncate text-lg font-semibold text-gray-100">{c.value}</p>
                    {c.sub && <p className="mt-0.5 truncate text-[11px] text-gray-500">{c.sub}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 最終交付（藍光邊框） ── */}
          {task.answer && (
            <section className="task-section relative overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-b from-blue-500/10 to-gray-900/60 p-5 shadow-lg shadow-blue-500/10">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/80 to-transparent" />
              <SectionTitle icon="📦" text="最終交付" />
              <div className="markdown-body text-sm leading-relaxed text-gray-100">
                <ReactMarkdown>{task.answer}</ReactMarkdown>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
