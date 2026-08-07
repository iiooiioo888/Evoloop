/** 整頁任務視圖（PysdnOPC 任務列表風格，深度詳情版）。
 *
 * 區塊：頂欄（狀態/進度/耗時）→ 執行階段 → 任務規劃 →
 * 角色流水線 → 工作項（可展開：產出/審查反饋/成本/依賴）→
 * 品質評估 → Manager 最終審查 → 事件時間軸（可展開明細）→
 * 預算統計 → 最終交付。
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

/** 可展開的工作項卡片 */
function WorkItemCard({ item, status, allItems }: {
  item: KanbanItem;
  status: string;
  allItems: KanbanItem[];
}) {
  const [open, setOpen] = useState(false);
  const meta = ITEM_STATUS_META[status] ?? { label: status, cls: 'bg-gray-700/60 text-gray-300' };
  const hasDetails = !!(item.description || item.output || (item.feedback?.length ?? 0) > 0);
  const depTitles = (item.depends_on ?? [])
    .map((id) => allItems.find((x) => x.id === id)?.title ?? id)
    .filter(Boolean);

  return (
    <div className="mb-2 rounded-lg bg-gray-900/70 p-2.5 last:mb-0">
      <button
        type="button"
        className="flex w-full items-start gap-2 text-left"
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-px text-[11px] ${meta.cls}`}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 text-sm text-gray-200">{item.title}</span>
        {typeof item.actual_cost === 'number' && item.actual_cost > 0 && (
          <span className="shrink-0 text-[11px] text-gray-500">${item.actual_cost}</span>
        )}
        {hasDetails && (
          <span className="shrink-0 text-xs text-gray-500">{open ? '▲' : '▼'}</span>
        )}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-800 pt-2 text-xs">
          {item.description && (
            <div>
              <p className="mb-1 font-medium text-gray-400">📝 任務描述</p>
              <p className="whitespace-pre-wrap text-gray-300">{item.description}</p>
            </div>
          )}
          {depTitles.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-gray-400">🔗 依賴工作項</p>
              {depTitles.map((t, i) => (
                <p key={i} className="text-gray-300">· {t}</p>
              ))}
            </div>
          )}
          {(item.feedback?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 font-medium text-gray-400">🔍 審查反饋</p>
              {item.feedback!.map((fb, i) => (
                <p key={i} className="mb-1 whitespace-pre-wrap rounded bg-orange-500/10 px-2 py-1 text-orange-200/90 last:mb-0">
                  {String(fb.feedback ?? fb.summary ?? JSON.stringify(fb))}
                </p>
              ))}
            </div>
          )}
          {item.output && (
            <div>
              <p className="mb-1 font-medium text-gray-400">📦 產出內容</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-sans text-gray-200">
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
    ? { text: '執行中', cls: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/40' }
    : failed
      ? { text: '失敗', cls: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40' }
      : { text: '已完成', cls: 'bg-green-500/15 text-green-300 ring-1 ring-green-500/40' };

  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const toggleEvent = (i: number) =>
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

  return (
    <div className="flex h-dvh flex-col bg-gray-950 text-gray-100">
      {/* ══ 頂欄 ══ */}
      <header className="border-b border-gray-800 bg-gray-900/80 px-4 py-3">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <button
            onClick={onBack}
            className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-blue-500 hover:text-blue-300"
          >
            ← 返回對話
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-gray-100">
              {isCompany ? '🏢 公司任務' : '⚙️ 反思任務'}：{task.query}
            </h1>
            <p className="truncate text-xs text-gray-500">
              任務 ID：{task.task_id}
              {running && task.created_at ? ` · 已耗時 ${formatDuration(durationSec)}` : ''}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusBadge.cls}`}>
            {statusBadge.text}
            {task.status === 'completed' && task.score != null && ` · 評分 ${task.score}`}
          </span>
        </div>
        {/* 整體進度條 */}
        <div className="mx-auto mt-2.5 w-full max-w-4xl">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ${failed ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs text-gray-400">{progressPct}%</span>
          </div>
        </div>
      </header>

      {/* ══ 內容區 ══ */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {/* ── 執行階段 ── */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">執行階段</h2>
            <div className="flex items-center gap-1.5">
              {phases.map((p, i) => {
                const active = running && i === currentIdx;
                return (
                  <div key={p.key} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`h-2 w-full rounded-full ${
                        phasePassed(i) ? 'bg-blue-500' : active ? 'animate-pulse bg-blue-400' : 'bg-gray-700'
                      }`}
                    />
                    <span
                      className={`whitespace-nowrap text-xs ${
                        active ? 'font-medium text-blue-300' : phasePassed(i) ? 'text-gray-300' : 'text-gray-600'
                      }`}
                    >
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {running && (
              <p className="mt-3 text-xs text-gray-500">
                目前階段：{phases[currentIdx]?.label ?? task.phase}
                {totalCount > 0 && ` · 工作項 ${doneCount}/${totalCount} 完成`}
              </p>
            )}
            {failed && task.error && (
              <p className="mt-3 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-300">{task.error}</p>
            )}
          </section>

          {/* ── 任務規劃（Manager 分解結果） ── */}
          {isCompany && task.plan && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                📋 任務規劃
                {task.plan.strategy && (
                  <span className="ml-2 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-normal normal-case text-gray-400">
                    策略：{String(task.plan.strategy)}
                  </span>
                )}
                {task.plan.subtask_count != null && (
                  <span className="ml-2 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-normal normal-case text-gray-400">
                    {String(task.plan.subtask_count)} 個子任務
                  </span>
                )}
              </h2>
              {task.plan.execution_plan != null && (
                <div className="text-sm text-gray-300">
                  {typeof task.plan.execution_plan === 'string' ? (
                    <p className="whitespace-pre-wrap">{task.plan.execution_plan}</p>
                  ) : (
                    <ol className="list-decimal space-y-1 pl-5">
                      {(Array.isArray(task.plan.execution_plan) ? task.plan.execution_plan : []).map((step, i) => (
                        <li key={i}>
                          {typeof step === 'string'
                            ? step
                            : String((step as Record<string, unknown>).title ?? (step as Record<string, unknown>).description ?? JSON.stringify(step))}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── 角色流水線 ── */}
          {isCompany && pipeline.length > 1 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">角色流水線</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {pipeline.map((role, i) => (
                  <span key={role.key} className="flex items-center gap-1.5">
                    <span
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                        role.status === 'active'
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                          : role.status === 'done'
                            ? 'border-green-500/40 bg-green-500/10 text-green-200'
                            : role.status === 'failed'
                              ? 'border-red-500/40 bg-red-500/10 text-red-200'
                              : role.status === 'waiting'
                                ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
                                : 'border-gray-700 bg-gray-800/60 text-gray-500'
                      }`}
                    >
                      {role.label}
                      <RoleIcon status={role.status} />
                    </span>
                    {i < pipeline.length - 1 && <span className="text-gray-600">→</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── 工作項（按角色，可展開詳情） ── */}
          {isCompany && roleGroups.length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                工作項（按角色） · 點擊展開詳情
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {roleGroups.map((g) => (
                  <div key={g.role} className="rounded-xl bg-gray-800/50 p-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-200">
                      {roleLabel(g.role)}
                      <RoleIcon status={g.status} />
                      <span className="text-xs font-normal text-gray-500">
                        {g.entries.filter((e) => e.status === 'done').length}/{g.entries.length}
                      </span>
                    </p>
                    {g.entries.map(({ status, item }) => (
                      <WorkItemCard key={item.id} item={item} status={status} allItems={allItems} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 品質評估 ── */}
          {evaluations.length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">品質評估</h2>
              <div className="flex flex-wrap gap-2">
                {evaluations.map((e, i) => (
                  <span key={i} className="rounded-full bg-gray-800 px-3 py-1 text-sm text-gray-300">
                    第 {Number(e.data.iteration ?? 0) + 1} 次評估：
                    <span className="ml-1 font-semibold text-blue-300">{String(e.data.score ?? '?')} 分</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── Manager 最終審查 ── */}
          {isCompany && task.review && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                🧑‍💼 Manager 最終審查
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-normal normal-case ${
                    task.review.approved ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {task.review.approved ? '✓ 通過' : '✗ 未通過'}
                </span>
              </h2>
              <div className="space-y-1.5 text-sm text-gray-300">
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

          {/* ── 事件時間軸（可展開明細） ── */}
          {isCompany && task.events.length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                事件時間軸（{task.events.length}）
              </h2>
              <div className="border-l border-gray-700 pl-4">
                {task.events.slice(-25).map((e, i) => {
                  const detail = Object.fromEntries(
                    Object.entries(e.data).filter(([, v]) => v !== '' && v != null),
                  );
                  const hasDetail = Object.keys(detail).length > 0;
                  return (
                    <div key={i} className="mb-1.5 last:mb-0">
                      <button
                        type="button"
                        className="flex w-full items-baseline gap-2 text-left text-sm"
                        onClick={() => hasDetail && toggleEvent(i)}
                      >
                        <span className="shrink-0 text-gray-300">{EVENT_LABELS[e.event] ?? e.event}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-500">
                          {String(e.data.title ?? e.data.phase ?? '')}
                        </span>
                        {hasDetail && <span className="shrink-0 text-[10px] text-gray-600">{expandedEvents.has(i) ? '▲' : '▼'}</span>}
                        <span className="shrink-0 text-xs text-gray-600">{elapsed(e.ts)}</span>
                      </button>
                      {expandedEvents.has(i) && (
                        <pre className="mt-1 overflow-auto rounded bg-black/40 p-2 text-[11px] text-gray-400">
                          {JSON.stringify(detail, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 預算與統計 ── */}
          {isCompany && Object.keys(task.budget).length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">預算與統計</h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>💰 花費 <span className="text-gray-200">${String(task.budget.task_spent ?? 0)}</span> / ${String(task.budget.task_limit ?? '-')}</span>
                <span>模型：{String(task.budget.active_tier ?? '-')}</span>
                <span>迭代 {task.iteration} 輪</span>
                {task.stats && (
                  <span>
                    工作項：{String(task.stats.done ?? 0)}/{String(task.stats.total ?? 0)} 完成
                    {task.stats.review_rounds != null && ` · 審查 ${String(task.stats.review_rounds)} 輪`}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* ── 最終交付 ── */}
          {task.answer && (
            <section className="rounded-2xl border border-blue-500/30 bg-gray-900/60 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-300">📦 最終交付</h2>
              <div className="markdown-body text-sm text-gray-100">
                <ReactMarkdown>{task.answer}</ReactMarkdown>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
