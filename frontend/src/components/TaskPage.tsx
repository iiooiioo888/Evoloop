/** 整頁任務視圖（PysdnOPC office_ui 設計語言）。
 *
 * 佈局：sticky 頂欄（標題/狀態膠囊/耗時/總進度）→ live 橫幅 →
 * 卡片流（階段/規劃/角色流水線/工作項/評估/終審/時間軸/預算/交付）→ 終態條。
 *
 * 樣式全部來自 taskpage.css（tp- 前綴作用域）。
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { TaskProgress, KanbanItem } from '../types';
import {
  COMPANY_PHASES,
  EVENT_LABELS,
  RoleIcon,
  STANDARD_PHASES,
  elapsed,
  phaseIndex,
  roleLabel,
} from './TaskPanel';
import type { RoleStatus } from './TaskPanel';
import './taskpage.css';

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

/** 事件穩定 key（不再用陣列下標，避免窗口滑動後展開態錯位） */
function eventKey(e: { ts: number; event: string }): string {
  return `${e.ts}-${e.event}`;
}

/** 葉子計時器：1 秒 tick 只重渲耗時文字，不牽動整頁 */
function ElapsedTimer({ createdAt, running }: { createdAt?: number; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !createdAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, createdAt]);
  if (!createdAt) return null;
  const sec = Math.max(0, Math.floor(now / 1000 - createdAt));
  return <span>· 已耗時 {formatDuration(sec)}</span>;
}

/** 可展開的工作項卡片 */
function WorkItemCard({ item, status, allItems }: {
  item: KanbanItem;
  status: string;
  allItems: KanbanItem[];
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(item.description || item.output || (item.feedback?.length ?? 0) > 0);
  const depTitles = (item.depends_on ?? [])
    .map((id) => allItems.find((x) => x.id === id)?.title ?? id)
    .filter(Boolean);
  const statusLabel: Record<string, string> = {
    planning: '規劃中', ready: '就緒', executing: '執行中', in_review: '審查中',
    rework: '修改中', done: '完成', blocked: '阻塞',
  };

  return (
    <div className="tp-item">
      <button
        type="button"
        className="tp-item-head"
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <span className="tp-item-badge" data-status={status}>
          {statusLabel[status] ?? status}
        </span>
        <span className="tp-item-title">{item.title}</span>
        {typeof item.actual_cost === 'number' && item.actual_cost > 0 && (
          <span className="tp-item-cost">${item.actual_cost}</span>
        )}
        {hasDetails && <span className="tp-item-chevron">{open ? '▲' : '▼'}</span>}
      </button>

      {open && (
        <div className="tp-item-body">
          {item.description && (
            <div>
              <p className="tp-item-section-label">📝 任務描述</p>
              <p className="tp-item-text">{item.description}</p>
            </div>
          )}
          {depTitles.length > 0 && (
            <div>
              <p className="tp-item-section-label">🔗 依賴工作項</p>
              {depTitles.map((t, i) => (
                <p key={i} className="tp-item-text">· {t}</p>
              ))}
            </div>
          )}
          {(item.feedback?.length ?? 0) > 0 && (
            <div>
              <p className="tp-item-section-label">🔍 審查反饋</p>
              {item.feedback!.map((fb, i) => (
                <p key={i} className="tp-item-feedback">
                  {String(fb.feedback ?? fb.summary ?? JSON.stringify(fb))}
                </p>
              ))}
            </div>
          )}
          {item.output && (
            <div>
              <p className="tp-item-section-label">📦 產出內容</p>
              <div className="tp-item-output">{item.output}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 角色芯片圖標（對應 PysdnOPC 投影圖標） */
function ChipIcon({ status }: { status: RoleStatus }) {
  if (status === 'done') return <span className="tp-chip-icon">✓</span>;
  if (status === 'failed') return <span className="tp-chip-icon">✗</span>;
  if (status === 'active') return <span className="tp-chip-icon tp-pulse">●</span>;
  if (status === 'waiting') return <span className="tp-chip-icon">●</span>;
  return null;
}

export default function TaskPage({ task, onBack }: TaskPageProps) {
  const isCompany = task.mode === 'company';
  const phases = isCompany ? COMPANY_PHASES : STANDARD_PHASES;
  const running = task.status === 'running' || task.status === 'pending';
  const failed = task.status === 'failed';
  const currentIdx = phaseIndex(phases, task.phase);
  const phasePassed = (i: number) =>
    failed ? i < currentIdx : i < currentIdx || (!running && i <= currentIdx);

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

  const statusMeta = running
    ? { label: '執行中', status: 'running' }
    : failed
      ? { label: '失敗', status: 'failed' }
      : { label: '已完成', status: 'completed' };

  // ── 事件展開態（穩定 key） ──
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const toggleEvent = (key: string) =>
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  return (
    <div className="tp-page flex h-dvh flex-col">
      {/* ══ sticky 頂欄 ══ */}
      <header className="tp-header-shell">
        <div className="tp-header-bar">
          <button onClick={onBack} className="tp-back-btn">← 返回對話</button>
          <div className="min-w-0 flex-1">
            <h1 className="tp-title">
              {isCompany ? '🏢 公司任務' : '⚙️ 反思任務'}：{task.query}
            </h1>
            <p className="tp-subtitle">
              任務 ID：{task.task_id}
              {running && <ElapsedTimer createdAt={task.created_at} running={running} />}
            </p>
          </div>
          <span className="tp-status-pill" data-status={statusMeta.status}>
            <span className="tp-status-dot" />
            {statusMeta.label}
            {task.status === 'completed' && task.score != null && ` · 評分 ${task.score}`}
          </span>
        </div>
        {/* 總進度條 */}
        <div className="flex items-center gap-2">
          <div className="tp-progress-track flex-1">
            <div
              className="tp-progress-fill"
              data-failed={failed}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="tp-progress-pct">{progressPct}%</span>
        </div>
      </header>

      {/* ══ 內容區 ══ */}
      <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3.5">
          {/* ── 執行中 live 橫幅 ── */}
          {running && (
            <div className="tp-live tp-enter">
              <span className="tp-live-icon" />
              <span style={{ whiteSpace: 'nowrap' }}>
                {phases[currentIdx]?.label ?? task.phase}
                {totalCount > 0 && ` · 工作項 ${doneCount}/${totalCount}`}
              </span>
              <span className="tp-live-shimmer" />
            </div>
          )}

          {/* ── 錯誤訊息 ── */}
          {failed && task.error && <div className="tp-error-box tp-enter">{task.error}</div>}

          {/* ── 執行階段 ── */}
          <section className="tp-card">
            <h2 className="tp-card-title">執行階段</h2>
            <div className="tp-phases">
              {phases.map((p, i) => {
                const active = running && i === currentIdx;
                return (
                  <div key={p.key} className="tp-phase">
                    <div
                      className="tp-phase-bar"
                      data-passed={phasePassed(i)}
                      data-active={active}
                    />
                    <span
                      className="tp-phase-label"
                      data-passed={phasePassed(i)}
                      data-active={active}
                    >
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 任務規劃 ── */}
          {isCompany && task.plan && (
            <section className="tp-card">
              <h2 className="tp-card-title">
                📋 任務規劃
                {task.plan.strategy && (
                  <span className="tp-meta-pill">策略：{String(task.plan.strategy)}</span>
                )}
                {task.plan.subtask_count != null && (
                  <span className="tp-meta-pill">{String(task.plan.subtask_count)} 個子任務</span>
                )}
              </h2>
              {task.plan.execution_plan != null && (
                <div>
                  {typeof task.plan.execution_plan === 'string' ? (
                    <p className="tp-item-text">{task.plan.execution_plan}</p>
                  ) : (
                    <ol className="tp-plan-list">
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
            <section className="tp-card">
              <h2 className="tp-card-title">角色流水線</h2>
              <div className="tp-pipeline">
                {pipeline.map((role, i) => (
                  <span key={role.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="tp-chip" data-status={role.status}>
                      {role.label}
                      <ChipIcon status={role.status} />
                    </span>
                    {i < pipeline.length - 1 && <span className="tp-chip-connector">→</span>}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── 工作項（按角色） ── */}
          {isCompany && roleGroups.length > 0 && (
            <section className="tp-card">
              <h2 className="tp-card-title">工作項（按角色）· 點擊展開詳情</h2>
              <div className="tp-role-grid">
                {roleGroups.map((g) => (
                  <div key={g.role} className="tp-role-box">
                    <p className="tp-role-name">
                      {roleLabel(g.role)}
                      <RoleIcon status={g.status} />
                      <span className="tp-role-count">
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
            <section className="tp-card">
              <h2 className="tp-card-title">品質評估</h2>
              <div className="flex flex-wrap gap-2">
                {evaluations.map((e, i) => (
                  <span key={i} className="tp-meta-pill">
                    第 {Number(e.data.iteration ?? 0) + 1} 次評估：
                    <span className="tp-meta-pill-strong">{String(e.data.score ?? '?')} 分</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── Manager 最終審查 ── */}
          {isCompany && task.review && (
            <section className="tp-card">
              <h2 className="tp-card-title">
                🧑‍💼 Manager 最終審查
                <span
                  className="tp-review-verdict"
                  data-approved={task.review.approved ? 'true' : 'false'}
                >
                  {task.review.approved ? '✓ 通過' : '✗ 未通過'}
                </span>
              </h2>
              <div className="flex flex-col gap-1.5 text-[13px]" style={{ color: 'var(--tp-text)' }}>
                {task.review.summary != null && (
                  <p className="tp-item-text">{String(task.review.summary)}</p>
                )}
                {task.review.suggestions != null && (
                  <p className="tp-item-text" style={{ color: 'var(--tp-text-secondary)' }}>
                    建議：{String(task.review.suggestions)}
                  </p>
                )}
                {task.review.degraded === true && (
                  <p style={{ fontSize: 12, color: 'var(--tp-yellow)' }}>
                    ⚠️ 審查異常降級：自動通過（{String(task.review.error ?? '')}）
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── 事件時間軸 ── */}
          {isCompany && task.events.length > 0 && (
            <section className="tp-card">
              <h2 className="tp-card-title">事件時間軸（{task.events.length}）</h2>
              <div className="tp-timeline">
                {task.events.slice(-25).map((e) => {
                  const key = eventKey(e);
                  const detail = Object.fromEntries(
                    Object.entries(e.data).filter(([, v]) => v !== '' && v != null),
                  );
                  const hasDetail = Object.keys(detail).length > 0;
                  return (
                    <div key={key} className="tp-tl-entry">
                      <div className="tp-tl-connector">
                        <div className="tp-tl-dot">●</div>
                        <div className="tp-tl-line" />
                      </div>
                      <div className="tp-tl-content">
                        <button
                          type="button"
                          className="tp-tl-row"
                          data-static={!hasDetail}
                          onClick={() => hasDetail && toggleEvent(key)}
                        >
                          <span className="tp-tl-label">{EVENT_LABELS[e.event] ?? e.event}</span>
                          <span className="tp-tl-summary">
                            {String(e.data.title ?? e.data.phase ?? '')}
                          </span>
                          {hasDetail && (
                            <span className="tp-tl-chevron">{expandedEvents.has(key) ? '▲' : '▼'}</span>
                          )}
                          <span className="tp-tl-time">{elapsed(e.ts)}</span>
                        </button>
                        {expandedEvents.has(key) && (
                          <pre className="tp-detail-card">{JSON.stringify(detail, null, 2)}</pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── 終態條 ── */}
          {!running && (
            <div className={`tp-completion ${failed ? 'tp-completion-failed' : 'tp-completion-done'} tp-enter`}>
              <span>{failed ? '✗' : '✓'}</span>
              <span>{failed ? '任務執行失敗' : `任務完成${task.score != null ? ` · 評分 ${task.score}` : ''} · 迭代 ${task.iteration} 輪`}</span>
            </div>
          )}

          {/* ── 預算與統計 ── */}
          {isCompany && Object.keys(task.budget).length > 0 && (
            <section className="tp-card">
              <h2 className="tp-card-title">預算與統計</h2>
              <div className="tp-stats-row">
                <span>💰 花費 <strong>${String(task.budget.task_spent ?? 0)}</strong> / ${String(task.budget.task_limit ?? '-')}</span>
                <span>模型：<strong>{String(task.budget.active_tier ?? '-')}</strong></span>
                {task.stats && (
                  <span>
                    工作項：<strong>{String(task.stats.done ?? 0)}/{String(task.stats.total ?? 0)}</strong> 完成
                    {task.stats.review_rounds != null && ` · 審查 ${String(task.stats.review_rounds)} 輪`}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* ── 最終交付 ── */}
          {task.answer && (
            <section className="tp-card tp-delivery">
              <h2 className="tp-card-title tp-card-title-accent">📦 最終交付</h2>
              <div className="markdown-body tp-delivery-body">
                <ReactMarkdown>{task.answer}</ReactMarkdown>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
