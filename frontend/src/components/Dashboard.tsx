/** AI Agent 控制面版（Nexus 三欄外殼 + Spec 五分頁）。
 *
 * 外殼：左欄（智能體 + MCP/Skills 清單）、右欄（追蹤/上下文/指標）、
 * 底部輸入列；頂欄含 ← 返回對話、「📊 控制面版」標題、手動重新整理、
 * 5 秒自動輪詢。
 *
 * 中央分頁導覽（Spec 五分頁 + Nexus 控制台）：
 * 控制台（訊息串）→ 總覽（統計卡格/狀態分布/最近活動）→
 * 任務歷史（可展開 + 跳轉任務頁）→ 生成內容（存檔卡：Markdown +
 * 評分環 + 反思 + 引用記憶 chips）→ 工具與 Skills（能力卡）→
 * OPC 審計（匯總 + 明細表）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { createTask, fetchDashboard, fetchTask } from '../api/client';
import type {
  ArchiveRecord,
  Capability,
  DashboardData,
  TaskEvent,
  TaskProgress,
  TaskSummary,
} from '../types';
import { COMPANY_PHASES, STANDARD_PHASES, phaseIndex } from './TaskPanel';
import '../dashboard.css';

interface DashboardProps {
  onBack: () => void;
  onOpenTask: (task: TaskProgress) => void;
}

type ViewKey = 'console' | 'overview' | 'tasks' | 'content' | 'skills' | 'audit';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'console', label: '控制台' },
  { key: 'overview', label: '總覽' },
  { key: 'tasks', label: '任務歷史' },
  { key: 'content', label: '生成內容' },
  { key: 'skills', label: '工具與 Skills' },
  { key: 'audit', label: 'OPC 審計' },
];

const POLL_INTERVAL = 5000;

const CARD_STYLE: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--r)',
  padding: '20px 24px',
  marginBottom: 16,
  maxWidth: 860,
};

/** Unix 秒 → HH:MM:SS */
function fmtClock(sec: number): string {
  return new Date(sec * 1000).toLocaleTimeString('zh-TW', { hour12: false });
}

/** ISO → 短格式 */
function fmtIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 秒數 → 耗時字串 */
function fmtDur(sec: number): string {
  if (sec < 1) return `${Math.round(sec * 1000)}ms`;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  return `${m}m ${Math.round(sec % 60)}s`;
}

/** Unix 秒 → 相對時間 */
function relTime(sec: number): string {
  const diff = Math.floor(Date.now() / 1000 - sec);
  if (diff < 60) return '剛剛';
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return new Date(sec * 1000).toLocaleDateString('zh-TW');
}

/** 任務狀態 → 徽章 */
function statusBadge(status: string): { label: string; cls: 'ok' | 'run' | 'err' } {
  if (status === 'completed') return { label: '已完成', cls: 'ok' };
  if (status === 'failed') return { label: '失敗', cls: 'err' };
  if (status === 'running' || status === 'pending') return { label: '執行中', cls: 'run' };
  return { label: status, cls: 'run' };
}

/** 事件 → 工具呼叫卡元資料 */
const TOOL_META: Record<string, { icon: string; badge: 'ok' | 'run' | 'err'; label: string }> = {
  work_item_start: { icon: '▶', badge: 'run', label: 'work_item.start' },
  work_item_done: { icon: '✔', badge: 'ok', label: 'work_item.done' },
  work_item_error: { icon: '✖', badge: 'err', label: 'work_item.error' },
  work_item_retry: { icon: '🔁', badge: 'run', label: 'work_item.retry' },
  work_item_escalate: { icon: '⬆', badge: 'run', label: 'work_item.escalate' },
  review_pass: { icon: '👌', badge: 'ok', label: 'review.pass' },
  review_rework: { icon: '↩', badge: 'run', label: 'review.rework' },
  review_force_done: { icon: '⚠', badge: 'run', label: 'review.force_done' },
  budget_warning: { icon: '💰', badge: 'err', label: 'budget.warning' },
  budget_degrade: { icon: '📉', badge: 'err', label: 'budget.degrade' },
  decompose_done: { icon: '📋', badge: 'ok', label: 'decompose.done' },
  evaluation: { icon: '📊', badge: 'ok', label: 'evaluate.score' },
};

/** 可展開的工具呼叫卡 */
function ToolCard({ event }: { event: TaskEvent }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[event.event];
  const desc = String(event.data.title ?? event.data.phase ?? '');
  const body = JSON.stringify(
    Object.fromEntries(Object.entries(event.data).filter(([, v]) => v !== '' && v != null)),
    null, 2,
  );
  return (
    <div className="tool-call">
      <button type="button" className="tc-head" onClick={() => setOpen((v) => !v)}>
        <span className="tc-icon">{meta.icon}</span>
        <div>
          <div className="tc-name">{meta.label}</div>
          {desc && <div className="tc-desc">{desc}</div>}
        </div>
        <span className={`tc-badge ${meta.badge}`}>
          {meta.badge === 'ok' ? '成功' : meta.badge === 'err' ? '警告' : '執行'}
        </span>
        <span className="tc-time">{fmtClock(event.ts)}</span>
      </button>
      {open && <div className="tc-body">{body || '（無附加資料）'}</div>}
    </div>
  );
}

/** 單一任務的訊息串（使用者 → 思維鏈 → 工具呼叫 → 產出） */
function TaskStream({ task, memories }: { task: TaskSummary; memories: string[] }) {
  const events = task.events ?? [];
  const toolEvents = events.filter((e) => TOOL_META[e.event]);
  const decompose = events.find((e) => e.event === 'decompose_done');

  return (
    <>
      <div className="msg">
        <div className="msg-header">
          <div className="msg-avatar user">U</div>
          <span className="msg-name">使用者</span>
          <span className="msg-time">{fmtClock(task.created_at)}</span>
        </div>
        <div className="msg-content"><p>{task.query}</p></div>
      </div>

      <div className="msg">
        <div className="msg-header">
          <div className="msg-avatar agent">◈</div>
          <span className="msg-name">{task.mode === 'company' ? '公司編排器' : '反思代理'}</span>
          <span className="msg-label">思考中</span>
          <span className="msg-time">{fmtClock(task.created_at)}</span>
        </div>
        <div className="msg-content">
          <div className="think">
            <div className="think-label">✦ 思維鏈</div>
            <p style={{ margin: 0 }}>
              {task.mode === 'company'
                ? `公司模式：Manager 分解 → 多角色並行 → Reviewer 審查 → Synthesizer 整合${
                    decompose ? ` · 子任務 ${String(decompose.data.subtask_count ?? '?')} · 策略 ${String(decompose.data.strategy ?? 'auto')}` : ''}`
                : `反思閉環：生成 → 評估 → 反思 → 改進 · 迭代 ${task.iteration} 輪 · 評分 ${task.score ?? '-'}`}
            </p>
          </div>
        </div>
      </div>

      {toolEvents.length > 0 && (
        <div className="msg">
          <div className="msg-header">
            <div className="msg-avatar tool">⚡</div>
            <span className="msg-name">工具呼叫</span>
            <span className="msg-time">{fmtClock(toolEvents[toolEvents.length - 1].ts)}</span>
          </div>
          <div className="msg-content">
            {toolEvents.map((e, i) => <ToolCard key={i} event={e} />)}
          </div>
        </div>
      )}

      {task.status === 'failed' ? (
        <div className="msg">
          <div className="msg-header">
            <div className="msg-avatar sys">⚠</div>
            <span className="msg-name">系統</span>
            <span className="msg-label">失敗</span>
          </div>
          <div className="msg-content"><p style={{ color: 'var(--red)' }}>{task.answer_preview || '任務執行失敗'}</p></div>
        </div>
      ) : task.answer ? (
        <div className="msg">
          <div className="msg-header">
            <div className="msg-avatar agent">◈</div>
            <span className="msg-name">{task.mode === 'company' ? '公司編排器' : '反思代理'}</span>
            {task.score != null && <span className="msg-label">評分 {task.score}</span>}
            <span className="msg-time">{fmtDur(task.duration_sec ?? 0)}</span>
          </div>
          <div className="msg-content">
            {memories.length > 0 && (
              <div className="refs">
                {memories.map((m, i) => <span key={i} className="ref-tag">🧠 {m}</span>)}
              </div>
            )}
            <div className="markdown-body">
              <ReactMarkdown components={mdComponents}>{task.answer}</ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 評分圓環（conic-gradient） */
function ScoreRing({ score }: { score: number | null }) {
  const pct = Math.min(100, Math.max(0, (score ?? 0) * 10));
  return (
    <div
      style={{
        width: 38, height: 38, flexShrink: 0, borderRadius: '50%',
        background: `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--bg-elevated) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      title={`評分 ${score ?? '-'}`}
    >
      <span style={{
        width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--mono)',
      }}
      >
        {score != null ? String(score) : '-'}
      </span>
    </div>
  );
}

/** 遞迴提取文字內容（供代碼複製） */
function extractText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object') {
    return extractText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

/** 複製按鈕 */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="code-copy"
      onClick={() => {
        if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? '已複製' : '複製'}
    </button>
  );
}

/** Markdown 渲染組件：代碼塊帶語言欄 + 複製按鈕 */
const mdComponents: Components = {
  pre: (props) => {
    const { children } = props;
    const child = Array.isArray(children) ? children[0] : children;
    const m = /language-([\w-]+)/.exec(
      String((child as { props?: { className?: unknown } })?.props?.className ?? ''),
    );
    return (
      <div className="code-block">
        <div className="code-bar">
          <div className="code-dots">
            <span className="code-dot" /><span className="code-dot" /><span className="code-dot" />
          </div>
          <span className="code-lang">{m ? m[1] : 'text'}</span>
          <CopyBtn text={extractText(children)} />
        </div>
        <pre className="code-body">{children}</pre>
      </div>
    );
  },
};

interface Heading { id: number; text: string; level: number }

/** 從 Markdown 解析 TOC（## / ###） */
function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  md.split(/\r?\n/).forEach((line) => {
    const m = /^(#{2,3})\s+(.+)/.exec(line);
    if (m) out.push({ id: out.length, text: m[2], level: m[1].length });
  });
  return out;
}

/** 任務歷史列（可展開 + 跳轉任務頁） */
function TaskRow({ task, onOpenTask }: { task: TaskSummary; onOpenTask: (t: TaskProgress) => void }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const badge = statusBadge(task.status);

  const openFull = async () => {
    setOpening(true);
    try {
      onOpenTask(await fetchTask(task.task_id));
    } catch {
      setOpen(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="tool-call" style={{ maxWidth: 860 }}>
      <button type="button" className="tc-head" onClick={() => setOpen((v) => !v)}>
        <span className="tc-icon">{task.mode === 'company' ? '🏢' : '⚙️'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tc-name" style={{ fontFamily: 'var(--font)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.query}
          </div>
          <div className="tc-desc">
            {relTime(task.created_at)} · 迭代 {task.iteration} 輪 · 事件 {task.events_count} 條 · 耗時 {fmtDur(task.duration_sec ?? 0)}
          </div>
        </div>
        {task.score != null && <span className="tc-time" style={{ color: 'var(--accent)' }}>{task.score} 分</span>}
        {task.spent > 0 && <span className="tc-time">${task.spent}</span>}
        <span className={`tc-badge ${badge.cls}`}>{badge.label}</span>
        <span className="tc-time">{fmtClock(task.created_at)}</span>
      </button>
      {open && (
        <div className="tc-body" style={{ whiteSpace: 'normal' }}>
          <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>
            {task.answer_preview || '（尚無產出內容）'}
          </p>
          <button
            type="button"
            className="doc-pick"
            disabled={opening}
            onClick={() => void openFull()}
          >
            {opening ? '載入中…' : '⛶ 開啟任務頁面'}
          </button>
        </div>
      )}
    </div>
  );
}

/** 生成內容卡（存檔記錄） */
function ArchiveCard({ record, onOpen }: { record: ArchiveRecord; onOpen: () => void }) {
  const memories = (record.memory_items ?? [])
    .map((m) => (typeof m === 'string' ? m : String((m as Record<string, unknown>)?.text ?? JSON.stringify(m))))
    .filter(Boolean);
  const reflectionText = (() => {
    const r = record.reflection;
    if (!r) return '';
    if (Array.isArray(r)) {
      return r.map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return String(o.critique ?? o.suggestion ?? JSON.stringify(o));
      }).join('；');
    }
    if (typeof r === 'string') return r;
    return JSON.stringify(r);
  })();

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <ScoreRing score={record.evaluation_score ?? null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {record.user_query || '（無提問）'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--mono)' }}>
            {fmtIso(record.timestamp)} · {String(record.metadata?.mode ?? 'standard')} · 迭代 {String(record.metadata?.iterations ?? 0)} 輪
          </p>
        </div>
        <button type="button" className="doc-pick" onClick={onOpen}>⛶ 文檔視圖</button>
      </div>

      {record.evaluation_feedback && (
        <div className={`doc-callout ${(record.evaluation_score ?? 0) >= 8 ? 'success' : 'info'}`}>
          <span className="doc-callout-icon">{(record.evaluation_score ?? 0) >= 8 ? '✓' : 'ℹ'}</span>
          <div>評估反饋：{record.evaluation_feedback}</div>
        </div>
      )}
      {reflectionText && (
        <div className="doc-callout warn">
          <span className="doc-callout-icon">↻</span>
          <div>反思：{reflectionText}</div>
        </div>
      )}

      {record.final_answer && (
        <div className="doc-content" style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 8 }}>
          <ReactMarkdown components={mdComponents}>{record.final_answer}</ReactMarkdown>
        </div>
      )}

      {memories.length > 0 && (
        <div className="refs" style={{ marginBottom: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)' }}>🧠 引用的記憶：</span>
          {memories.map((m, i) => <span key={i} className="ref-tag">{m}</span>)}
        </div>
      )}
    </div>
  );
}

/** 能力統計值渲染 */
function CapStats({ cap }: { cap: Capability }) {
  const LABELS: Record<string, string> = {
    model: '模型', api_base: 'API Base', configured: '已配置',
    usage: '使用次數', count: '記憶筆數', referenced: '被引用',
    reads: '讀取', writes: '寫入', blocked: '截', files: '存檔檔',
  };
  return (
    <div style={{ marginTop: 10 }}>
      {Object.entries(cap.stats).map(([k, v]) => (
        <div key={k} className="cfg-row">
          <span className="cfg-k">{LABELS[k] ?? k}</span>
          {Array.isArray(v) ? (
            <span className="cfg-v" style={{ whiteSpace: 'normal', textAlign: 'right' }}>
              {(v as string[]).slice(0, 6).join('、') || '-'}
            </span>
          ) : typeof v === 'boolean' ? (
            <span className="cfg-v" style={{ color: v ? 'var(--green)' : 'var(--amber)' }}>{v ? '是' : '否'}</span>
          ) : (
            <span className="cfg-v">{String(v)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ onBack, onOpenTask }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>('console');
  const [rpTab, setRpTab] = useState<'trace' | 'ctx' | 'metrics'>('trace');
  const [input, setInput] = useState('');
  const [opening, setOpening] = useState(false);
  const [openDoc, setOpenDoc] = useState<ArchiveRecord | null>(null);
  const [activeHeading, setActiveHeading] = useState(0);

  const consoleRef = useRef<HTMLDivElement>(null);
  const docPageRef = useRef<HTMLDivElement>(null);
  // 點擊 TOC 後短暫抑制 scrollspy，避免平滑滾動期間高亮被覆寫
  const tocLockUntil = useRef(0);

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  // 控制台訊息串自動捲底
  const streamCount = data?.tasks.length ?? 0;
  useEffect(() => {
    if (view === 'console' && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [view, streamCount]);

  const stats = data?.stats;
  const llmCap = data?.capabilities.find((c) => c.key === 'llm');
  const model = String(llmCap?.stats.model ?? '') || 'unknown';
  const anyRunning = (data?.tasks ?? []).some((t) => t.status === 'running' || t.status === 'pending');
  const skillsOn = (data?.capabilities ?? []).filter((c) => c.status === 'active').length;

  const archiveByTask = useMemo(
    () => new Map((data?.archives ?? []).map((a) => [a.session_id, a])),
    [data],
  );
  const streamTasks = useMemo(() => (data?.tasks ?? []).slice(0, 6).slice().reverse(), [data]);

  // 右欄追蹤：最新任務
  const focusTask = data?.tasks[0];
  const focusPhases = focusTask?.mode === 'company' ? COMPANY_PHASES : STANDARD_PHASES;
  const focusIdx = focusTask ? phaseIndex(focusPhases, focusTask.status === 'completed' ? 'done' : (focusTask.phase || '')) : -1;
  const focusChain = (focusTask?.events ?? []).filter((e) => TOOL_META[e.event]).slice(-6);

  const openFocusTask = async () => {
    if (!focusTask) return;
    setOpening(true);
    try {
      onOpenTask(await fetchTask(focusTask.task_id));
    } catch {
      // 任務已淘汰時忽略
    } finally {
      setOpening(false);
    }
  };

  const sendInput = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      await createTask(text, false, 'quick_task');
      await load();
    } catch {
      // 後端離線時靜默
    }
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evoloop-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 文檔視圖 TOC
  const docHeadings = useMemo(() => parseHeadings(openDoc?.final_answer ?? ''), [openDoc]);

  const scrollToHeading = (id: number) => {
    const els = docPageRef.current?.querySelectorAll('.doc-content h2, .doc-content h3');
    els?.[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tocLockUntil.current = Date.now() + 900;
    setActiveHeading(id);
  };

  const onDocScroll = () => {
    if (Date.now() < tocLockUntil.current) return;
    const page = docPageRef.current;
    if (!page) return;
    const els = page.querySelectorAll('.doc-content h2, .doc-content h3');
    let current = 0;
    els.forEach((el, i) => {
      if (el.getBoundingClientRect().top - page.getBoundingClientRect().top < 140) current = i;
    });
    setActiveHeading(current);
  };

  const audit = data?.opc_audit;

  return (
    <div className="nx">
      {/* ══ TOPBAR ══ */}
      <header className="topbar">
        <div className="logo">
          <div className="logo-mark">E</div>
          <span className="logo-text">EvoLoop</span>
        </div>
        <div className="top-sep" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>📊 控制面版</span>
        <div className="session-pill">
          <span className={`dot ${anyRunning ? '' : 'off'}`} />
          <span>{anyRunning ? '運行中' : '待機'}</span>
          <code>{model.slice(0, 12)}</code>
        </div>
        <div className="view-switch">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`view-btn ${view === v.key ? 'active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <span className="stat">任務 <strong>{stats?.tasks_total ?? 0}</strong></span>
          <span className="stat">花費 <strong>${stats?.total_spent ?? 0}</strong></span>
          <span className="stat">技能 <strong>{skillsOn}/{data?.capabilities.length ?? 0}</strong></span>
          <button className="icon-btn" title="匯出 JSON" onClick={exportJson}>⤓</button>
          <button className="icon-btn" title="重新整理（5 秒自動輪詢）" onClick={() => void load()}>⟳</button>
          <button className="icon-btn" title="返回對話" onClick={onBack}>←</button>
        </div>
      </header>

      {/* ══ SIDEBAR ══ */}
      <aside className="sidebar">
        <div className="side-label">智能體</div>
        <div className="agents">
          <div className={`agent-row ${!anyRunning ? 'active' : ''}`}>
            <div className="agent-dot a">◈</div>
            <div className="agent-info">
              <div className="agent-name">反思代理</div>
              <div className="agent-meta">{model} · standard</div>
            </div>
            <span className={`agent-badge ${(data?.tasks ?? []).some((t) => t.mode === 'standard' && (t.status === 'running' || t.status === 'pending')) ? 'on' : 'off'}`}>
              {(data?.tasks ?? []).some((t) => t.mode === 'standard' && (t.status === 'running' || t.status === 'pending')) ? '活躍' : '待命'}
            </span>
          </div>
          <div className="agent-row">
            <div className="agent-dot b">◆</div>
            <div className="agent-info">
              <div className="agent-name">公司編排器</div>
              <div className="agent-meta">multi-agent · company</div>
            </div>
            <span className={`agent-badge ${(data?.tasks ?? []).some((t) => t.mode === 'company' && (t.status === 'running' || t.status === 'pending')) ? 'on' : 'off'}`}>
              {(data?.tasks ?? []).some((t) => t.mode === 'company' && (t.status === 'running' || t.status === 'pending')) ? '活躍' : '待命'}
            </span>
          </div>
          <div className="agent-row">
            <div className="agent-dot c">◇</div>
            <div className="agent-info">
              <div className="agent-name">OPC 感知-行動</div>
              <div className="agent-meta">opc ua · guard</div>
            </div>
            <span className={`agent-badge ${(stats?.opc_total ?? 0) > 0 ? 'on' : 'off'}`}>
              {(stats?.opc_total ?? 0) > 0 ? '活躍' : '待命'}
            </span>
          </div>
        </div>
        <div className="side-label">MCP 技能</div>
        <div className="skills">
          {(data?.capabilities ?? []).map((cap) => (
            <div key={cap.key} className="skill-row" title={cap.description}>
              <div className="skill-icon">{cap.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="skill-name">{cap.key}</div>
                <div className="skill-desc">{cap.name}</div>
              </div>
              <span className={`skill-dot ${cap.status === 'active' ? 'on' : 'off'}`} />
            </div>
          ))}
          {!data && <div className="empty-hint">載入中…</div>}
        </div>
      </aside>

      {/* ══ 控制台（訊息串） ══ */}
      {view === 'console' && (
        <main className="main">
          <div className="main-scroll" ref={consoleRef}>
            <div className="msg">
              <div className="msg-header">
                <div className="msg-avatar sys">⚙</div>
                <span className="msg-name">系統</span>
                <span className="msg-label">初始化</span>
                <span className="msg-time">{new Date().toLocaleTimeString('zh-TW', { hour12: false })}</span>
              </div>
              <div className="msg-content">
                <p>
                  控制面版已連線 <code>GET /dashboard</code> · 輪詢 5s ·
                  技能 <strong>{skillsOn}/{data?.capabilities.length ?? 0}</strong> ·
                  {error ? <span style={{ color: 'var(--red)' }}> 後端離線</span> : ' 後端正常'}
                </p>
              </div>
            </div>

            {streamTasks.map((t) => (
              <TaskStream
                key={t.task_id}
                task={t}
                memories={(archiveByTask.get(t.task_id)?.memory_items ?? [])
                  .map((m) => (typeof m === 'string' ? m : String((m as Record<string, unknown>)?.text ?? '')))
                  .filter(Boolean)}
              />
            ))}

            {streamTasks.length === 0 && (
              <div className="empty-hint">尚無任務——在下方輸入列傳送第一個指令</div>
            )}

            {anyRunning && (
              <div className="msg">
                <div className="msg-header">
                  <div className="msg-avatar agent" style={{ opacity: 0.4 }}>◈</div>
                  <span className="msg-name" style={{ opacity: 0.4 }}>代理</span>
                </div>
                <div className="typing"><i /><i /><i /></div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ══ 總覽 ══ */}
      {view === 'overview' && (
        <main className="main">
          <div className="main-scroll">
            <div style={CARD_STYLE}>
              <div className="doc-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', margin: 0 }}>
                <div className="doc-stat-card"><div className="doc-stat-val">{stats?.tasks_total ?? 0}</div><div className="doc-stat-label">任務總數（執行中 {stats?.tasks_running ?? 0}）</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{stats?.success_rate ?? 0}%</div><div className="doc-stat-label">成功率（失敗 {stats?.tasks_failed ?? 0}）</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{stats?.avg_score ?? '-'}</div><div className="doc-stat-label">平均分數（迭代 {stats?.total_iterations ?? 0} 輪）</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">${stats?.total_spent ?? 0}</div><div className="doc-stat-label">總花費</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{stats?.memories_count ?? 0}</div><div className="doc-stat-label">記憶筆數（存檔 {stats?.archives_count ?? 0}）</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{stats?.opc_total ?? 0}</div><div className="doc-stat-label">OPC 操作（攔截 {stats?.opc_blocked ?? 0}）</div></div>
              </div>
            </div>

            <div style={CARD_STYLE}>
              <div className="rp-title">任務狀態分布</div>
              {(stats?.tasks_total ?? 0) === 0 ? (
                <div className="empty-hint">尚無任務記錄</div>
              ) : (
                <>
                  <div className="bar-group">
                    <div className="bar-label"><span>已完成</span><span>{stats?.tasks_completed ?? 0}</span></div>
                    <div className="bar-track"><div className="bar-fill g" style={{ width: `${((stats?.tasks_completed ?? 0) / (stats?.tasks_total ?? 1)) * 100}%` }} /></div>
                  </div>
                  <div className="bar-group">
                    <div className="bar-label"><span>執行中</span><span>{stats?.tasks_running ?? 0}</span></div>
                    <div className="bar-track"><div className="bar-fill a" style={{ width: `${((stats?.tasks_running ?? 0) / (stats?.tasks_total ?? 1)) * 100}%` }} /></div>
                  </div>
                  <div className="bar-group">
                    <div className="bar-label"><span>失敗</span><span>{stats?.tasks_failed ?? 0}</span></div>
                    <div className="bar-track"><div className="bar-fill r" style={{ width: `${((stats?.tasks_failed ?? 0) / (stats?.tasks_total ?? 1)) * 100}%` }} /></div>
                  </div>
                </>
              )}
            </div>

            <div style={{ ...CARD_STYLE, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div className="rp-title">最新任務</div>
                {(data?.tasks ?? []).length === 0 && <div className="empty-hint">尚無任務</div>}
                {(data?.tasks ?? []).slice(0, 3).map((t) => {
                  const b = statusBadge(t.status);
                  return (
                    <div key={t.task_id} className="ctx-card">
                      <div className="ctx-top">
                        <span className={`ctx-type ${b.cls === 'ok' ? 'u' : b.cls === 'err' ? 'a' : 'f'}`}>{b.label}</span>
                        <span className="ctx-name">{t.query}</span>
                      </div>
                      <div className="ctx-snip">{relTime(t.created_at)}</div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="rp-title">最新 OPC 操作</div>
                {(audit?.recent ?? []).length === 0 && <div className="empty-hint">尚無 OPC 操作記錄</div>}
                {(audit?.recent ?? []).slice(0, 3).map((a, i) => (
                  <div key={i} className="ctx-card">
                    <div className="ctx-top">
                      <span className={`ctx-type ${a.result === 'success' ? 'u' : 'a'}`}>{a.result === 'success' ? '成功' : '攔截'}</span>
                      <span className="ctx-name">{a.operation} · {a.tag_name}</span>
                    </div>
                    <div className="ctx-snip">{fmtIso(a.timestamp)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ══ 任務歷史 ══ */}
      {view === 'tasks' && (
        <main className="main">
          <div className="main-scroll">
            {(data?.tasks ?? []).length === 0 ? (
              <div className="empty-hint">尚無任務記錄——回到對話或於下方輸入列傳送第一個任務</div>
            ) : (
              (data?.tasks ?? []).map((t) => <TaskRow key={t.task_id} task={t} onOpenTask={onOpenTask} />)
            )}
          </div>
        </main>
      )}

      {/* ══ 生成內容（卡片清單 → 完整文檔視圖） ══ */}
      {view === 'content' && (
        <main className="main">
          {openDoc ? (
            <div className="doc-page" ref={docPageRef} onScroll={onDocScroll}>
              <div className="doc-layout">
                <div className="doc-body">
                  <button
                    type="button"
                    className="doc-pick"
                    style={{ marginBottom: 24 }}
                    onClick={() => { setOpenDoc(null); setActiveHeading(0); }}
                  >
                    ← 返回生成內容清單
                  </button>
                  <div className="doc-header">
                    <div className="doc-tag">✦ AI 生成文檔</div>
                    <h1 className="doc-title">{openDoc.user_query || '（無提問）'}</h1>
                    <p className="doc-subtitle">
                      {openDoc.evaluation_feedback || '由 EvoLoop 反思閉環自動生成與評估的交付文檔。'}
                    </p>
                    <div className="doc-meta">
                      <div className="doc-meta-item">
                        <span className="doc-meta-avatar">◈</span>
                        <strong>{String(openDoc.metadata?.mode ?? 'standard') === 'company' ? '公司編排器' : '反思代理'}</strong>
                      </div>
                      <span className="doc-meta-dot" />
                      <div className="doc-meta-item">模型 <strong>{String(openDoc.metadata?.model ?? model)}</strong></div>
                      <span className="doc-meta-dot" />
                      <div className="doc-meta-item">生成於 <strong>{fmtIso(openDoc.timestamp)}</strong></div>
                    </div>
                  </div>
                  <div className="doc-content">
                    <div className="doc-stats">
                      <div className="doc-stat-card"><div className="doc-stat-val">{openDoc.evaluation_score ?? '-'}</div><div className="doc-stat-label">評估分數</div></div>
                      <div className="doc-stat-card"><div className="doc-stat-val">{String(openDoc.metadata?.iterations ?? 0)}</div><div className="doc-stat-label">反思迭代</div></div>
                      <div className="doc-stat-card"><div className="doc-stat-val">{(openDoc.memory_items ?? []).length}</div><div className="doc-stat-label">引用記憶</div></div>
                    </div>
                    {(openDoc.evaluation_score ?? 0) >= 8 ? (
                      <div className="doc-callout success">
                        <span className="doc-callout-icon">✓</span>
                        <div>品質達標——評估分數 {String(openDoc.evaluation_score)}，直接交付。</div>
                      </div>
                    ) : (
                      <div className="doc-callout warn">
                        <span className="doc-callout-icon">⚠</span>
                        <div>品質待改進——評估分數 {String(openDoc.evaluation_score ?? '-')}，已進入反思迭代。</div>
                      </div>
                    )}
                    <ReactMarkdown components={mdComponents}>
                      {openDoc.final_answer || '（無產出內容）'}
                    </ReactMarkdown>
                    {(() => {
                      const r = openDoc.reflection;
                      const text = !r
                        ? ''
                        : Array.isArray(r)
                          ? r.map((x) => String((x as Record<string, unknown>)?.critique ?? (x as Record<string, unknown>)?.suggestion ?? '')).join('；')
                          : typeof r === 'string'
                            ? r
                            : JSON.stringify(r);
                      return text ? (
                        <div className="doc-callout warn"><span className="doc-callout-icon">↻</span><div>反思：{text}</div></div>
                      ) : null;
                    })()}
                    {(openDoc.memory_items ?? []).length > 0 && (
                      <div className="refs">
                        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>🧠 引用的記憶：</span>
                        {(openDoc.memory_items ?? []).map((m, i) => {
                          const t = typeof m === 'string' ? m : String((m as Record<string, unknown>)?.text ?? '');
                          return t ? <span key={i} className="ref-tag">{t}</span> : null;
                        })}
                      </div>
                    )}
                    <hr />
                    <div className="doc-footer">
                      <span className="doc-footer-tag">EvoLoop</span>
                      <span className="doc-footer-tag">{String(openDoc.metadata?.mode ?? 'standard')}</span>
                      {openDoc.metadata?.template != null && (
                        <span className="doc-footer-tag">{String(openDoc.metadata.template)}</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-4)' }}>
                        由 AI 智能體自動生成 · {fmtIso(openDoc.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
                {docHeadings.length > 0 && (
                  <div className="doc-toc">
                    <div className="doc-toc-title">目錄</div>
                    <ul className="doc-toc-list">
                      {docHeadings.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            className={`${h.level === 3 ? 'l3' : ''} ${activeHeading === h.id ? 'active' : ''}`}
                            onClick={() => scrollToHeading(h.id)}
                          >
                            {h.text}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="main-scroll">
              {(data?.archives ?? []).length === 0 ? (
                <div className="empty-hint">尚無生成內容存檔——完成第一個任務後自動存檔</div>
              ) : (
                (data?.archives ?? []).map((a, i) => (
                  <ArchiveCard
                    key={`${a.session_id}-${i}`}
                    record={a}
                    onOpen={() => { setOpenDoc(a); setActiveHeading(0); }}
                  />
                ))
              )}
            </div>
          )}
        </main>
      )}

      {/* ══ 工具與 Skills ══ */}
      {view === 'skills' && (
        <main className="main">
          <div className="main-scroll">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, maxWidth: 860 }}>
              {(data?.capabilities ?? []).map((cap) => (
                <div key={cap.key} className="ctx-card" style={{ padding: '14px 16px' }}>
                  <div className="ctx-top">
                    <span className="ctx-type f" style={{ fontSize: 13 }}>{cap.icon}</span>
                    <span className="ctx-name">{cap.name}</span>
                    <span className={`skill-dot ${cap.status === 'active' ? 'on' : 'off'}`} style={{ marginLeft: 'auto' }} />
                  </div>
                  <div className="ctx-snip" style={{ WebkitLineClamp: 3 }}>{cap.description}</div>
                  <CapStats cap={cap} />
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ══ OPC 審計 ══ */}
      {view === 'audit' && (
        <main className="main">
          <div className="main-scroll">
            <div style={CARD_STYLE}>
              <div className="doc-stats" style={{ gridTemplateColumns: 'repeat(5, 1fr)', margin: 0 }}>
                <div className="doc-stat-card"><div className="doc-stat-val">{audit?.summary.total ?? 0}</div><div className="doc-stat-label">總操作</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{audit?.summary.success ?? 0}</div><div className="doc-stat-label">成功</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{audit?.summary.blocked ?? 0}</div><div className="doc-stat-label">攔截</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{audit?.summary.reads ?? 0}</div><div className="doc-stat-label">讀取</div></div>
                <div className="doc-stat-card"><div className="doc-stat-val">{audit?.summary.writes ?? 0}</div><div className="doc-stat-label">寫入</div></div>
              </div>
            </div>
            <div style={CARD_STYLE}>
              {(audit?.recent ?? []).length === 0 ? (
                <div className="empty-hint">尚無 OPC 審計記錄</div>
              ) : (
                <div className="doc-content" style={{ margin: 0 }}>
                  <table>
                    <thead>
                      <tr><th>時間</th><th>操作</th><th>標籤</th><th>值</th><th>結果</th><th>原因/詳情</th></tr>
                    </thead>
                    <tbody>
                      {(audit?.recent ?? []).map((a, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtIso(a.timestamp)}</td>
                          <td>{a.operation}</td>
                          <td><code>{a.tag_name}</code></td>
                          <td>{a.value != null ? String(a.value) : '-'}</td>
                          <td style={{ color: a.result === 'success' ? 'var(--green)' : 'var(--red)' }}>
                            {a.result === 'success' ? '成功' : '攔截'}
                          </td>
                          <td title={`${a.reason ?? ''}${a.detail ? ` — ${a.detail}` : ''}`}>
                            {a.reason || a.detail || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ══ 右欄 ══ */}
      <aside className="right-panel">
        <div className="rp-tabs">
          <button className={`rp-tab ${rpTab === 'trace' ? 'active' : ''}`} onClick={() => setRpTab('trace')}>追蹤</button>
          <button className={`rp-tab ${rpTab === 'ctx' ? 'active' : ''}`} onClick={() => setRpTab('ctx')}>上下文</button>
          <button className={`rp-tab ${rpTab === 'metrics' ? 'active' : ''}`} onClick={() => setRpTab('metrics')}>指標</button>
        </div>

        {rpTab === 'trace' && (
          <div className="rp-scroll">
            <div className="rp-section">
              <div className="rp-title">執行管線 · {focusTask ? focusTask.query.slice(0, 14) : '（無任務）'}</div>
              {focusPhases.map((p, i) => {
                const running = focusTask?.status === 'running' || focusTask?.status === 'pending';
                const state = focusTask?.status === 'failed'
                  ? (i < focusIdx ? 'done' : i === focusIdx ? 'err' : 'idle')
                  : i < focusIdx || (!running && i <= focusIdx)
                    ? 'done'
                    : running && i === focusIdx ? 'active' : 'idle';
                return (
                  <div key={p.key} className="trace-row">
                    <div className={`trace-num ${state}`}>{state === 'done' ? '✓' : state === 'err' ? '✗' : state === 'active' ? '●' : '·'}</div>
                    <div className="trace-info"><div className="trace-name">{p.label}</div></div>
                  </div>
                );
              })}
              {focusTask && (
                <button
                  type="button"
                  className="doc-pick"
                  style={{ marginTop: 8 }}
                  disabled={opening}
                  onClick={() => void openFocusTask()}
                >
                  {opening ? '載入中…' : '⛶ 開啟任務頁面'}
                </button>
              )}
            </div>
            <div className="rp-section">
              <div className="rp-title">MCP 呼叫鏈</div>
              {focusChain.length === 0 && <div className="empty-hint">尚無工具呼叫</div>}
              {focusChain.map((e, i) => {
                const prev = focusChain[i - 1];
                return (
                  <div key={i} className="chain-row">
                    <span className="chain-n">{i + 1}</span>
                    <span className="chain-name">{TOOL_META[e.event].label}</span>
                    <span className="chain-dur">{prev ? fmtDur(Math.max(0, e.ts - prev.ts)) : fmtClock(e.ts)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {rpTab === 'ctx' && (
          <div className="rp-scroll">
            <div className="rp-section">
              <div className="rp-title">引用記憶</div>
              {((data?.archives[0]?.memory_items ?? []).length === 0) && <div className="empty-hint">最新存檔未引用記憶</div>}
              {(data?.archives[0]?.memory_items ?? []).map((m, i) => {
                const text = typeof m === 'string' ? m : String((m as Record<string, unknown>)?.text ?? JSON.stringify(m));
                return (
                  <div key={i} className="ctx-card">
                    <div className="ctx-top"><span className="ctx-type m">記憶</span><span className="ctx-name">{text.slice(0, 40)}</span></div>
                  </div>
                );
              })}
            </div>
            <div className="rp-section">
              <div className="rp-title">生成文檔</div>
              {(data?.archives ?? []).length === 0 && <div className="empty-hint">尚無存檔</div>}
              {(data?.archives ?? []).slice(0, 6).map((a, i) => (
                <button
                  key={`${a.session_id}-${i}`}
                  type="button"
                  className="ctx-card"
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => setView('content')}
                >
                  <div className="ctx-top"><span className="ctx-type d">文檔</span><span className="ctx-name">{a.user_query || '（無提問）'}</span></div>
                  <div className="ctx-snip">{(a.final_answer || '').slice(0, 80)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {rpTab === 'metrics' && (
          <div className="rp-scroll">
            <div className="rp-section">
              <div className="rp-title">任務指標</div>
              <div className="bar-group">
                <div className="bar-label"><span>成功率</span><span>{stats?.success_rate ?? 0}%</span></div>
                <div className="bar-track"><div className="bar-fill g" style={{ width: `${stats?.success_rate ?? 0}%` }} /></div>
              </div>
              <div className="bar-group">
                <div className="bar-label"><span>平均分數</span><span>{stats?.avg_score ?? '-'}</span></div>
                <div className="bar-track"><div className="bar-fill a" style={{ width: `${((stats?.avg_score ?? 0) / 10) * 100}%` }} /></div>
              </div>
              <div className="bar-group">
                <div className="bar-label"><span>OPC 攔截率</span><span>{stats && stats.opc_total > 0 ? Math.round((stats.opc_blocked / stats.opc_total) * 100) : 0}%</span></div>
                <div className="bar-track"><div className="bar-fill r" style={{ width: `${stats && stats.opc_total > 0 ? (stats.opc_blocked / stats.opc_total) * 100 : 0}%` }} /></div>
              </div>
            </div>
            <div className="rp-section">
              <div className="rp-title">耗時</div>
              <div className="bar-group">
                <div className="bar-label"><span>最近任務</span><span>{fmtDur(focusTask?.duration_sec ?? 0)}</span></div>
                <div className="bar-track"><div className="bar-fill am" style={{ width: `${Math.min(100, ((focusTask?.duration_sec ?? 0) / 120) * 100)}%` }} /></div>
              </div>
              <div className="bar-group">
                <div className="bar-label"><span>事件數</span><span>{focusTask?.events_count ?? 0}</span></div>
                <div className="bar-track"><div className="bar-fill b" style={{ width: `${Math.min(100, ((focusTask?.events_count ?? 0) / 200) * 100)}%` }} /></div>
              </div>
            </div>
            <div className="rp-section">
              <div className="rp-title">模型配置</div>
              <div className="cfg-row"><span className="cfg-k">模型</span><span className="cfg-v hi">{String(llmCap?.stats.model ?? '-')}</span></div>
              <div className="cfg-row"><span className="cfg-k">API Base</span><span className="cfg-v">{String(llmCap?.stats.api_base ?? '-') || '-'}</span></div>
              <div className="cfg-row"><span className="cfg-k">已配置</span><span className="cfg-v">{llmCap?.stats.configured ? '是' : '否'}</span></div>
              <div className="cfg-row"><span className="cfg-k">記憶筆數</span><span className="cfg-v">{String(stats?.memories_count ?? 0)}</span></div>
            </div>
          </div>
        )}
      </aside>

      {/* ══ 輸入列 ══ */}
      <div className="input-bar">
        <input
          type="text"
          className="input-field"
          placeholder="輸入指令…（建立反思任務）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void sendInput(); }}
        />
        <span className="input-hint"><kbd>Enter</kbd> 發送</span>
        <button type="button" className="send-btn" onClick={() => void sendInput()}>↑</button>
      </div>
    </div>
  );
}
