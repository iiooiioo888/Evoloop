/**
 * TasksMonitorPanel — 任務視角監控。
 *
 * 以任務為中心：統計概覽、狀態篩選、列表／看板、即時詳情。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cancelTask, fetchTask, resumeTask } from '../api/client';
import { useMonitorStore } from '../stores/monitorStore';
import type { TaskProgress, TaskSummary } from '../types';
import TaskPanel, {
  COMPANY_PHASES,
  OPC_PHASES,
  STANDARD_PHASES,
  phaseIndex,
} from './TaskPanel';
import ErrorState from './ui/ErrorState';

interface TasksMonitorPanelProps {
  focusTaskId: string | null;
  onFocusTask: (id: string | null) => void;
  onOpenTask: (task: TaskProgress) => void;
  onOpenTrace?: (taskId: string) => void;
}

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';
type ViewMode = 'list' | 'kanban';

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  pending: { label: '等待', cls: 'text-[#FF9500]', dot: 'bg-[#FF9500]' },
  running: { label: '執行中', cls: 'text-[#007AFF]', dot: 'bg-[#007AFF]' },
  completed: { label: '已完成', cls: 'text-[#34C759]', dot: 'bg-[#34C759]' },
  failed: { label: '失敗', cls: 'text-[#FF3B30]', dot: 'bg-[#FF3B30]' },
  cancelled: { label: '已取消', cls: 'text-[#8E8E93]', dot: 'bg-[#8E8E93]' },
  interrupted: { label: '中斷', cls: 'text-[#FF9500]', dot: 'bg-[#FF9500]' },
};

const PATH_META: Record<string, { icon: string; label: string }> = {
  simple: { icon: '⚙', label: '反思' },
  company: { icon: '🏢', label: '公司' },
  opc: { icon: '🏭', label: 'OPC' },
};

const KANBAN_COLS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'active', label: '進行中', statuses: ['pending', 'running'] },
  { key: 'done', label: '已完成', statuses: ['completed'] },
  { key: 'bad', label: '失敗 / 取消', statuses: ['failed', 'cancelled', 'interrupted'] },
];

function relTime(sec: number): string {
  const diff = Math.floor(Date.now() / 1000 - sec);
  if (diff < 60) return '剛剛';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return new Date(sec * 1000).toLocaleDateString('zh-TW');
}

function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m}m ${sec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function phasesFor(task: TaskSummary) {
  if (task.resolved_path === 'opc') return OPC_PHASES;
  if (task.resolved_path === 'company') return COMPANY_PHASES;
  return STANDARD_PHASES;
}

function matchesFilter(task: TaskSummary, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'running') return task.status === 'running' || task.status === 'pending';
  if (filter === 'completed') return task.status === 'completed';
  return task.status === 'failed' || task.status === 'cancelled' || task.status === 'interrupted';
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'blue' | 'green' | 'red' | 'neutral';
}) {
  const cls =
    accent === 'blue'
      ? 'text-[#007AFF]'
      : accent === 'green'
        ? 'text-[#34C759]'
        : accent === 'red'
          ? 'text-[#FF3B30]'
          : 'text-[#F5F5F7]';
  return (
    <div className="apple-card apple-card--tight apple-card--pad">
      <p className="apple-title">{label}</p>
      <p className={`apple-data mt-2 text-[22px] leading-none ${cls}`}>{value}</p>
    </div>
  );
}

function PhaseStrip({ task }: { task: TaskSummary }) {
  const phases = phasesFor(task);
  const idx = phaseIndex(phases, task.phase);
  const running = task.status === 'running' || task.status === 'pending';
  const failed = task.status === 'failed' || task.status === 'cancelled';

  return (
    <div className="mt-2 flex items-center gap-0.5">
      {phases.map((p, i) => {
        const active = running && i === idx;
        const passed = failed ? i < idx : i < idx || (!running && i <= idx);
        return (
          <div
            key={p.key}
            title={p.label}
            className={`h-1 flex-1 rounded-full transition-colors ${
              failed && i === idx
                ? 'bg-[#FF3B30]'
                : passed
                  ? 'bg-[#007AFF]'
                  : active
                    ? 'progress-shimmer'
                    : 'bg-white/[0.08]'
            }`}
          />
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  active,
  onClick,
}: {
  task: TaskSummary;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  const path = PATH_META[task.resolved_path] ?? PATH_META.simple;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-[#007AFF]/40 bg-[#007AFF]/10'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[13px]">{path.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-[#F5F5F7]">{task.query || '（無標題）'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#8E8E93]">
            <span className={meta.cls}>{meta.label}</span>
            <span>·</span>
            <span>{path.label}</span>
            <span>·</span>
            <span>{relTime(task.created_at)}</span>
            {task.score != null && (
              <>
                <span>·</span>
                <span className="text-[#64D2FF]">{task.score} 分</span>
              </>
            )}
          </div>
          <PhaseStrip task={task} />
        </div>
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
      </div>
    </button>
  );
}

export default function TasksMonitorPanel({
  focusTaskId,
  onFocusTask,
  onOpenTask,
  onOpenTrace,
}: TasksMonitorPanelProps) {
  const dashboard = useMonitorStore((s) => s.dashboard);
  const connected = useMonitorStore((s) => s.connected);
  const storeError = useMonitorStore((s) => s.error);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detail, setDetail] = useState<TaskProgress | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const tasks = dashboard?.tasks ?? [];
  const stats = dashboard?.stats;

  const filtered = useMemo(
    () => tasks.filter((t) => matchesFilter(t, filter)),
    [tasks, filter],
  );

  const runningIds = useMemo(
    () => tasks.filter((t) => t.status === 'running' || t.status === 'pending').map((t) => t.task_id),
    [tasks],
  );

  const loadDetail = useCallback(async (taskId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const full = await fetchTask(taskId);
      setDetail(full);
    } catch (err) {
      setDetailError((err as Error).message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (focusTaskId) void loadDetail(focusTaskId);
    else setDetail(null);
  }, [focusTaskId, loadDetail]);

  // 執行中任務高頻刷新詳情
  useEffect(() => {
    if (!focusTaskId || !runningIds.includes(focusTaskId)) return;
    const timer = setInterval(() => void loadDetail(focusTaskId), 3000);
    return () => clearInterval(timer);
  }, [focusTaskId, runningIds, loadDetail]);

  const handleCancel = async (taskId: string) => {
    try {
      await cancelTask(taskId);
      if (focusTaskId === taskId) void loadDetail(taskId);
    } catch {
      /* ignore */
    }
  };

  const handleResume = async (taskId: string) => {
    try {
      await resumeTask(taskId);
      void loadDetail(taskId);
    } catch {
      /* ignore */
    }
  };

  const pick = (taskId: string) => onFocusTask(taskId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden apple-canvas">
      {/* 頂欄 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-3">
        <div>
          <p className="apple-heading text-[15px]">任務</p>
          <p className="mt-0.5 text-[11px] text-[#636366]">
            {connected ? '即時同步' : '離線資料'}
            {stats ? ` · 共 ${stats.tasks_total} 筆` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.08] p-0.5">
            {(['list', 'kanban'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                  viewMode === mode
                    ? 'bg-white/[0.08] text-[#F5F5F7]'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7]'
                }`}
              >
                {mode === 'list' ? '列表' : '看板'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {storeError && (
        <div className="shrink-0 px-6 pt-3">
          <ErrorState kind="partial" message={storeError} compact />
        </div>
      )}

      {/* KPI */}
      <div className="shrink-0 grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-4 lg:grid-cols-5">
        <Kpi label="執行中" value={String(stats?.tasks_running ?? 0)} accent="blue" />
        <Kpi label="已完成" value={String(stats?.tasks_completed ?? 0)} accent="green" />
        <Kpi label="失敗" value={String(stats?.tasks_failed ?? 0)} accent="red" />
        <Kpi label="成功率" value={`${stats?.success_rate ?? 0}%`} />
        <Kpi
          label="平均評分"
          value={stats?.avg_score != null ? String(stats.avg_score) : '—'}
        />
      </div>

      {/* 篩選 */}
      <div className="shrink-0 flex gap-1.5 overflow-x-auto px-6 pb-3">
        {(
          [
            { key: 'all', label: '全部' },
            { key: 'running', label: '執行中' },
            { key: 'completed', label: '已完成' },
            { key: 'failed', label: '失敗' },
          ] as { key: StatusFilter; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors ${
              filter === item.key
                ? 'border-[#007AFF]/50 bg-[#007AFF]/15 text-[#64D2FF]'
                : 'border-white/[0.08] text-[#8E8E93] hover:border-white/[0.15] hover:text-[#F5F5F7]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 主區 */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden border-t border-white/[0.06]">
        {/* 左：任務列表 / 看板 */}
        <div
          className={`min-h-0 overflow-y-auto ${
            focusTaskId ? 'w-full shrink-0 border-r border-white/[0.06] lg:w-[340px]' : 'flex-1'
          }`}
        >
          <div className="p-4">
            {filtered.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-[#636366]">尚無符合條件的任務</p>
            ) : viewMode === 'list' ? (
              <div className="space-y-2">
                {filtered.map((task) => (
                  <TaskCard
                    key={task.task_id}
                    task={task}
                    active={focusTaskId === task.task_id}
                    onClick={() => pick(task.task_id)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-3">
                {KANBAN_COLS.map((col) => {
                  const colTasks = filtered.filter((t) => col.statuses.includes(t.status));
                  return (
                    <div key={col.key} className="min-w-0">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#636366]">
                        {col.label}
                        <span className="ml-1 font-mono text-[#48484A]">{colTasks.length}</span>
                      </p>
                      <div className="space-y-2">
                        {colTasks.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-white/[0.06] py-6 text-center text-[11px] text-[#48484A]">
                            空
                          </p>
                        ) : (
                          colTasks.map((task) => (
                            <TaskCard
                              key={task.task_id}
                              task={task}
                              active={focusTaskId === task.task_id}
                              onClick={() => pick(task.task_id)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 右：詳情 */}
        {focusTaskId && (
          <div className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0d0d0f]/95 px-5 py-2.5 backdrop-blur">
              <p className="truncate text-[12px] font-medium text-[#F5F5F7]">
                {detail?.query ?? focusTaskId.slice(0, 8)}
              </p>
              <button
                type="button"
                onClick={() => onFocusTask(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-[#8E8E93] hover:bg-white/[0.06] hover:text-[#F5F5F7]"
              >
                關閉
              </button>
            </div>
            <div className="p-5">
              {detailLoading && !detail && (
                <p className="py-8 text-center text-[12px] text-[#636366]">載入任務…</p>
              )}
              {detailError && (
                <ErrorState kind="generic" message={detailError} compact />
              )}
              {detail && (
                <>
                  <div className="mb-4 flex flex-wrap gap-3 text-[11px] text-[#8E8E93]">
                    <span>ID {detail.task_id.slice(0, 8)}</span>
                    <span>·</span>
                    <span>{PATH_META[detail.resolved_path]?.label ?? detail.resolved_path}</span>
                    <span>·</span>
                    <span>
                      耗時{' '}
                      {fmtDur(
                        detail.created_at
                          ? Math.max(0, Math.floor(Date.now() / 1000 - detail.created_at))
                          : 0,
                      )}
                    </span>
                  </div>
                  <TaskPanel
                    task={detail}
                    onOpenFull={() => onOpenTask(detail)}
                    onCancel={(id) => void handleCancel(id)}
                    onResume={(id) => void handleResume(id)}
                    onOpenTrace={onOpenTrace}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 行動端詳情（全屏疊層） */}
      {focusTaskId && detail && (
        <div className="fixed inset-0 z-30 flex flex-col bg-[#0d0d0f] lg:hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <p className="truncate text-[13px] font-medium">任務詳情</p>
            <button
              type="button"
              onClick={() => onFocusTask(null)}
              className="rounded-lg px-3 py-1 text-[12px] text-[#8E8E93]"
            >
              關閉
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <TaskPanel
              task={detail}
              onOpenFull={() => onOpenTask(detail)}
              onCancel={(id) => void handleCancel(id)}
              onResume={(id) => void handleResume(id)}
              onOpenTrace={onOpenTrace}
            />
          </div>
        </div>
      )}
    </div>
  );
}
