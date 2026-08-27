/** TraceView — 執行軌跡視圖（思考過程查看器）。
 *
 * 按 Linear 設計規範：
 * - Canvas: #010102, Surface-1: #0f1011, Hairline: #23252a
 * - Primary accent: #007AFF (lavender-blue)
 * - 使用 surface ladder + hairline borders，不用 shadow
 *
 * 功能：
 * - 列出所有軌跡檔案
 * - 點擊查看完整思考過程時間線
 * - 按事件類型篩選
 * - 可展開查看完整 prompt/response
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchTaskTrace, fetchTraces } from '../api/client';
import type { TraceEntry, TraceSummary } from '../types';

// ── 事件類型元數據 ──
const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  llm_call: { label: 'LLM 調用', icon: '🤖', color: 'text-[#007AFF]' },
  context_injection: { label: '上下文注入', icon: '📎', color: 'text-cyan-400' },
  evaluation: { label: '評估', icon: '📊', color: 'text-yellow-400' },
  reflection: { label: '反思', icon: '💭', color: 'text-purple-400' },
  improvement: { label: '改進', icon: '✨', color: 'text-green-400' },
  phase_change: { label: '階段切換', icon: '🔀', color: 'text-gray-400' },
  tool_call: { label: '工具調用', icon: '🔧', color: 'text-orange-400' },
  state_snapshot: { label: '狀態快照', icon: '📸', color: 'text-blue-400' },
  memory_operation: { label: '記憶操作', icon: '🧠', color: 'text-pink-400' },
  error: { label: '錯誤', icon: '❌', color: 'text-red-400' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'llm_call', label: '🤖 LLM' },
  { value: 'context_injection', label: '📎 上下文' },
  { value: 'evaluation', label: '📊 評估' },
  { value: 'reflection', label: '💭 反思' },
  { value: 'improvement', label: '✨ 改進' },
  { value: 'tool_call', label: '🔧 工具' },
  { value: 'error', label: '❌ 錯誤' },
];

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

/** 單條軌跡事件卡片 */
function TraceEventCard({ entry }: { entry: TraceEntry }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_META[entry.event] ?? { label: entry.event, icon: '📋', color: 'text-gray-400' };

  return (
    <div className="apple-card apple-card--tight !p-0 p-3 transition-colors hover:border-[#34343a]">
      {/* 標題行 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm">{meta.icon}</span>
        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
        {entry.phase && (
          <span className="rounded-full bg-[#141516] px-2 py-0.5 text-[10px] text-[#8a8f98]">
            {entry.phase}
          </span>
        )}
        {entry.iteration != null && entry.iteration > 0 && (
          <span className="rounded-full bg-[#141516] px-2 py-0.5 text-[10px] text-[#8a8f98]">
            迭代 {entry.iteration}
          </span>
        )}
        <span className="ml-auto text-[10px] text-[#62666d]">{formatTs(entry.ts)}</span>
        <span className="text-[10px] text-[#62666d]">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* 摘要（未展開時） */}
      {!expanded && (
        <div className="mt-1.5">
          {entry.event === 'llm_call' && (
            <p className="truncate text-[11px] text-[#8a8f98]">
              {entry.model && <span className="text-[#007AFF]">[{entry.model}] </span>}
              {String(entry.prompt ?? '').slice(0, 100)}...
            </p>
          )}
          {entry.event === 'evaluation' && (
            <p className="text-[11px] text-[#8a8f98]">
              分數：<span className="font-medium text-yellow-400">{entry.score ?? '?'}</span>
              {entry.feedback && ` · ${String(entry.feedback).slice(0, 80)}`}
            </p>
          )}
          {entry.event === 'reflection' && (
            <p className="truncate text-[11px] text-[#8a8f98]">
              {String(entry.reflection ?? '').slice(0, 120)}
            </p>
          )}
          {entry.event === 'context_injection' && (
            <p className="text-[11px] text-[#8a8f98]">
              來源：{entry.source} · {entry.count ?? 0} 條
            </p>
          )}
          {entry.event === 'tool_call' && (
            <p className="text-[11px] text-[#8a8f98]">
              {entry.success ? '✓' : '✗'} {entry.tool}
            </p>
          )}
          {entry.event === 'error' && (
            <p className="truncate text-[11px] text-red-400">{String(entry.error ?? '').slice(0, 100)}</p>
          )}
        </div>
      )}

      {/* 展開詳情 */}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-white/[0.08] pt-2">
          {entry.event === 'llm_call' && (
            <>
              {entry.system && (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#62666d]">System</p>
                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] leading-relaxed text-[#d0d6e0]">
                    {entry.system}
                  </pre>
                </div>
              )}
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#62666d]">
                  Prompt ({entry.prompt_length ?? 0} chars)
                </p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] leading-relaxed text-[#d0d6e0]">
                  {entry.prompt}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[#62666d]">
                  Response ({entry.response_length ?? 0} chars)
                </p>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] leading-relaxed text-[#d0d6e0]">
                  {entry.response}
                </pre>
              </div>
              <div className="flex gap-3 text-[10px] text-[#62666d]">
                {entry.model && <span>模型：{entry.model}</span>}
                {entry.cost != null && <span>成本：${entry.cost}</span>}
                {entry.duration_ms != null && <span>耗時：{entry.duration_ms}ms</span>}
              </div>
            </>
          )}
          {entry.event === 'evaluation' && (
            <>
              <div className="flex gap-4">
                <span className="text-sm font-medium text-yellow-400">分數：{entry.score ?? '?'}</span>
                {entry.iteration != null && <span className="text-[11px] text-[#8a8f98]">迭代 {entry.iteration}</span>}
              </div>
              {entry.strengths && (
                <div>
                  <p className="mb-1 text-[10px] font-medium text-green-400">優點</p>
                  <p className="text-[11px] text-[#d0d6e0]">{entry.strengths}</p>
                </div>
              )}
              {entry.weaknesses && (
                <div>
                  <p className="mb-1 text-[10px] font-medium text-red-400">缺點</p>
                  <p className="text-[11px] text-[#d0d6e0]">{entry.weaknesses}</p>
                </div>
              )}
              {entry.raw_response && (
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] text-[#8a8f98]">
                  {entry.raw_response}
                </pre>
              )}
            </>
          )}
          {entry.event === 'reflection' && (
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] leading-relaxed text-[#d0d6e0]">
              {entry.reflection}
            </pre>
          )}
          {entry.event === 'improvement' && (
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] leading-relaxed text-[#d0d6e0]">
              {entry.improved_answer}
            </pre>
          )}
          {entry.event === 'context_injection' && entry.items && (
            <div className="space-y-1">
              {entry.items.map((item, i) => (
                <p key={i} className="rounded-md apple-canvas p-2 text-[11px] text-[#d0d6e0]">
                  {item.slice(0, 300)}
                </p>
              ))}
            </div>
          )}
          {entry.event === 'tool_call' && (
            <>
              <div className="flex items-center gap-2">
                <span className={entry.success ? 'text-green-400' : 'text-red-400'}>
                  {entry.success ? '✓ 成功' : '✗ 失敗'}
                </span>
                <span className="text-[11px] text-[#8a8f98]">{entry.tool}</span>
              </div>
              {entry.args && (
                <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] text-[#d0d6e0]">
                  {JSON.stringify(entry.args, null, 2)}
                </pre>
              )}
              {entry.result && (
                <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md apple-canvas p-2 text-[11px] text-[#d0d6e0]">
                  {entry.result}
                </pre>
              )}
            </>
          )}
          {entry.event === 'error' && (
            <div>
              <p className="text-[11px] text-red-400">{entry.error}</p>
              {entry.context && <p className="mt-1 text-[10px] text-[#62666d]">上下文：{entry.context}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TraceView() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 選中的任務軌跡
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEntry[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTraces(50);
      setTraces(data.traces);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  const loadEvents = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId);
    setEventsLoading(true);
    setEvents([]);
    try {
      const data = await fetchTaskTrace(taskId, 200, 0);
      setEvents(data.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const filteredEvents = filter === 'all' ? events : events.filter((e) => e.event === filter);

  return (
    <div className="flex h-full flex-col apple-canvas">
      {/* 標題列 */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <h2 className="text-sm font-medium tracking-tight text-[#f7f8f8]">
          📜 執行軌跡
          <span className="ml-2 text-xs font-normal text-[#8a8f98]">
            {selectedTaskId ? `任務 ${selectedTaskId}` : `${traces.length} 個軌跡檔案`}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {selectedTaskId && (
            <button
              onClick={() => { setSelectedTaskId(null); setEvents([]); }}
              className="rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-3 py-1.5 text-xs text-[#f7f8f8] transition-colors hover:border-[#34343a]"
            >
              ← 返回列表
            </button>
          )}
          <button
            onClick={() => void loadTraces()}
            disabled={loading}
            className="rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-3 py-1.5 text-xs text-[#f7f8f8] transition-colors hover:border-[#34343a] disabled:opacity-40"
          >
            {loading ? '...' : '🔄'}
          </button>
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <p className="border-b border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-400">
          ⚠️ {error}
        </p>
      )}

      {/* 軌跡列表 */}
      {!selectedTaskId && (
        <div className="flex-1 overflow-y-auto p-4">
          {loading && traces.length === 0 && (
            <p className="py-12 text-center text-xs text-[#62666d]">載入中...</p>
          )}
          {!loading && traces.length === 0 && (
            <div className="py-16 text-center">
              <span className="text-3xl">📜</span>
              <p className="mt-2 text-xs text-[#62666d]">尚無軌跡記錄</p>
              <p className="mt-1 text-[11px] text-[#3e3e44]">執行任務後，思考過程會自動記錄在此</p>
            </div>
          )}
          <div className="space-y-2">
            {traces.map((t) => (
              <button
                key={t.task_id}
                onClick={() => void loadEvents(t.task_id)}
                className="w-full apple-card apple-card--tight !p-0 p-3 text-left transition-colors hover:border-[#007AFF]/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[#007AFF]">{t.task_id}</span>
                  <span className="text-[10px] text-[#62666d]">{t.file_size_kb} KB</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-[#8a8f98]">
                  <span>{t.event_count} 個事件</span>
                  <span>{t.last_ts ? new Date(t.last_ts).toLocaleString('zh-TW') : ''}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 事件詳情 */}
      {selectedTaskId && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 篩選列 */}
          <div className="flex flex-wrap gap-1.5 border-b border-white/[0.08] px-4 py-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                  filter === opt.value
                    ? 'bg-[#141516] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-[#62666d]">
              {filteredEvents.length} / {events.length} 條
            </span>
          </div>

          {/* 事件列表 */}
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {eventsLoading && (
              <p className="py-12 text-center text-xs text-[#62666d]">載入中...</p>
            )}
            {!eventsLoading && filteredEvents.length === 0 && (
              <p className="py-12 text-center text-xs text-[#62666d]">無符合條件的事件</p>
            )}
            {filteredEvents.map((entry) => (
              <TraceEventCard key={entry.seq} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}