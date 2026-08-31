/**
 * OpcMonitorPanel — 已棄用：監控中心「系統指標」請用 SystemMetricsPanel。
 *
 * 本元件保留供 opc_service 工業任務路徑（閥位、馬達等）除錯；
 * 不再掛載於監控中心主分頁。系統運行指標見 GET /monitor/optimization。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOpcMonitor } from '../api/client';
import { OPC_FALLBACK_CATALOG } from '../lib/monitorFallbacks';
import { mergeOpcCatalogReadings } from '../lib/opcTags';
import { OPC_PHASES } from '../types';
import type { OpcLiveReading, OpcMonitorData, OpcTagCatalog, TaskProgress } from '../types';

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function Gauge({ value, min, max }: { value: number | null; min: number; max: number }) {
  const span = max - min || 1;
  const pct = value == null ? 0 : Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const hot = pct >= 85;
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#141516]">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: hot ? '#e5484d' : '#007AFF',
        }}
      />
    </div>
  );
}

function PhaseStrip({ task }: { task: TaskProgress | null }) {
  const current = task?.phase ?? '';
  const idx = OPC_PHASES.findIndex((p) => p.key === current);
  const running = task?.status === 'running' || task?.status === 'pending';
  const failed = task?.status === 'failed';

  return (
    <div className="apple-card apple-card--tight !p-0 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
          6 級感知–行動閉環
        </p>
        {task ? (
          <span className="text-[11px] text-[#8a8f98]">
            {task.status} · {task.query?.slice(0, 28) || task.task_id.slice(0, 8)}
          </span>
        ) : (
          <span className="text-[11px] text-[#62666d]">尚無 OPC 任務，目錄與護欄仍有效</span>
        )}
      </div>
      <div className="flex items-start">
        {OPC_PHASES.map((p, i) => {
          const active = running && i === idx;
          const passed = idx >= 0 && (failed ? i < idx : i < idx || (!running && i <= idx));
          return (
            <div key={p.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div
                  className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : passed || active ? 'bg-[#007AFF]' : 'bg-[#23252a]'}`}
                />
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    failed && i === idx
                      ? 'bg-red-500/20 text-red-300'
                      : passed
                        ? 'bg-[#007AFF] text-white'
                        : active
                          ? 'bg-[#007AFF]/20 text-[#64D2FF] ring-1 ring-[#007AFF]'
                          : 'bg-[#141516] text-[#62666d]'
                  }`}
                >
                  {failed && i === idx ? '!' : passed ? '✓' : i + 1}
                </div>
                <div
                  className={`h-0.5 flex-1 ${i === OPC_PHASES.length - 1 ? 'opacity-0' : passed || (running && i + 1 === idx) ? 'bg-[#007AFF]' : 'bg-[#23252a]'}`}
                />
              </div>
              <span className={`mt-1.5 text-[10px] ${active ? 'text-[#64D2FF]' : passed ? 'text-[#d0d6e0]' : 'text-[#62666d]'}`}>
                {p.icon} {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TagRow({ tag, reading }: { tag: OpcTagCatalog; reading?: OpcLiveReading }) {
  const [min, max] = tag.range;
  const value = num(reading?.value);
  const quality = reading?.quality ?? (reading ? 'Good' : '—');
  const good = quality === 'Good' || quality === 'Simulated';
  const qualityLabel =
    quality === 'Simulated' ? '模擬' : quality === 'Good' ? 'Good' : quality;
  return (
    <tr className="border-b border-white/[0.08] last:border-0">
      <td className="py-2 pr-3">
        <p className="text-xs font-medium text-[#f7f8f8]">{tag.name}</p>
        <p className="text-[10px] text-[#62666d]">{tag.desc}</p>
      </td>
      <td className="py-2 pr-3 font-mono text-xs tabular-nums text-[#d0d6e0]">
        {value == null ? '—' : value.toFixed(2)}
        {tag.unit ? <span className="ml-1 text-[#62666d]">{tag.unit}</span> : null}
      </td>
      <td className="py-2 pr-3">
        <Gauge value={value} min={min} max={max} />
        <p className="mt-0.5 text-[10px] text-[#62666d]">
          {min}–{max}
        </p>
      </td>
      <td className="py-2 pr-3">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            quality === 'Simulated'
              ? 'bg-[#007AFF]/15 text-[#64D2FF]'
              : good
                ? 'bg-[#27a644]/15 text-[#4cc38a]'
                : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          {qualityLabel}
        </span>
      </td>
      <td className="py-2 text-[10px] text-[#8a8f98]">{tag.writable ? '白名單可寫' : '只讀'}</td>
    </tr>
  );
}

export default function OpcMonitorPanel() {
  const [data, setData] = useState<OpcMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchOpcMonitor();
      setData(next);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const latestTask = data?.recent_tasks?.[0] ?? null;
  const summary = data?.audit.summary ?? {};
  const live = data?.live;
  const connected = Boolean(live?.reachable && live.health?.opc_connected);
  const simulated = Boolean(live?.simulated);

  const rows = useMemo(() => {
    const catalog =
      data?.catalog && data.catalog.length > 0 ? data.catalog : OPC_FALLBACK_CATALOG;
    const readings = live?.readings ?? [];
    return mergeOpcCatalogReadings(catalog, readings);
  }, [data, live]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto apple-canvas p-4 text-[#f7f8f8]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">OPC UA 工業監控</h2>
          <p className="mt-0.5 text-[11px] text-[#8a8f98]">
            {data?.guard.opc_server ?? 'opc.tcp://…'} · 寫入必須經 guard.py
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] ${
              connected
                ? 'bg-[#27a644]/15 text-[#4cc38a]'
                : simulated
                  ? 'bg-[#007AFF]/15 text-[#64D2FF]'
                  : live?.reachable
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-[#141516] text-[#8a8f98]'
            }`}
          >
            {connected
              ? 'UA 已連線'
              : simulated
                ? '模擬快照'
                : live?.reachable
                  ? '服務在線、UA 降級'
                  : 'opc_service 離線'}
          </span>
          <button
            onClick={() => void refresh()}
            className="rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
          >
            {loading ? '同步中' : '重新整理'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!connected && (simulated || live?.error) && (
        <div className="mb-3 rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-3 py-2 text-[11px] text-[#8a8f98]">
          {simulated
            ? live?.error
              ? `opc_service 不可達（${live.error}），下方顯示模擬器初始值。`
              : 'UA 未連線，下方顯示模擬器初始值；啟動 OPC_SIM_ENABLED 可取得即時漂移。'
            : `即時讀取失敗（${live?.error}）。下方改顯示模擬標籤目錄、護欄邊界與審計檔。`}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: '標籤', value: String(rows.length) },
          { label: '審計筆數', value: String(summary.total ?? 0) },
          { label: '寫入攔截', value: String(summary.blocked ?? 0) },
          { label: '讀 / 寫', value: `${summary.reads ?? 0} / ${summary.writes ?? 0}` },
        ].map((kpi) => (
          <div key={kpi.label} className="apple-card apple-card--tight !p-0 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-[#62666d]">{kpi.label}</p>
            <p className="mt-1 font-mono text-lg text-[#f7f8f8]">{kpi.value}</p>
          </div>
        ))}
      </div>

      <PhaseStrip task={latestTask} />

      {latestTask?.opc_state?.analyze?.summary && (
        <p className="mt-2 text-[11px] text-[#8a8f98]">
          最近分析：{latestTask.opc_state.analyze.summary}
        </p>
      )}

      <div className="mt-4 overflow-x-auto apple-card apple-card--tight !p-0">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-[#62666d]">
              <th className="px-3 py-2 font-medium">標籤</th>
              <th className="px-3 py-2 font-medium">即時值</th>
              <th className="px-3 py-2 font-medium">量程</th>
              <th className="px-3 py-2 font-medium">品質</th>
              <th className="px-3 py-2 font-medium">護欄</th>
            </tr>
          </thead>
          <tbody className="px-3">
            {rows.map(({ tag, reading }) => (
              <TagRow key={tag.name} tag={tag} reading={reading} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="apple-card apple-card--tight !p-0 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
            審計日誌
          </p>
          {(data?.audit.recent.length ?? 0) === 0 ? (
            <p className="text-[11px] text-[#62666d]">尚無讀寫紀錄。寫入一律經白名單與數值邊界。</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {data!.audit.recent.map((row, i) => (
                <div
                  key={`${row.timestamp}-${row.tag_name}-${i}`}
                  className="flex items-center justify-between rounded-md bg-[#141516] px-2 py-1.5 text-[11px]"
                >
                  <span className="text-[#d0d6e0]">
                    {row.operation} · {row.tag_name}
                  </span>
                  <span
                    className={
                      row.result === 'blocked' ? 'text-red-300' : 'text-[#4cc38a]'
                    }
                  >
                    {row.result || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="apple-card apple-card--tight !p-0 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
            寫入護欄
          </p>
          <p className="mb-2 text-[11px] text-[#8a8f98]">
            白名單 {data?.guard.write_whitelist.join(', ') || '未設定'} · 審批{' '}
            {data?.guard.require_approval ? '開啟' : '關閉'} · 模擬{' '}
            {data?.guard.sim_enabled ? '啟用' : '關閉'}
          </p>
          <div className="space-y-1.5">
            {Object.entries(data?.guard.write_bounds ?? {}).map(([key, bound]) => (
              <div key={key} className="flex items-center justify-between text-[11px]">
                <span className="text-[#d0d6e0]">{key}</span>
                <span className="font-mono text-[#8a8f98]">
                  {bound.min} – {bound.max}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="apple-card apple-card--tight !p-0 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#62666d]">
            最近 OPC 任務
          </p>
          {(data?.recent_tasks.length ?? 0) === 0 ? (
            <p className="text-[11px] text-[#62666d]">
              尚無 OPC 路徑任務。對話中提到感測/閥位會走 6 級閉環。
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {data!.recent_tasks.map((t) => (
                <div key={t.task_id} className="rounded-md bg-[#141516] px-2 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#d0d6e0]">{t.phase || t.status}</span>
                    <span
                      className={
                        t.status === 'completed'
                          ? 'text-[#4cc38a]'
                          : t.status === 'failed'
                            ? 'text-red-300'
                            : 'text-amber-300'
                      }
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[#8a8f98]">{t.query || t.task_id}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
