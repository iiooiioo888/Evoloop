/**
 * CheckpointsPanel — 監控中心斷點續跑。
 *
 * 列出 GET /checkpoints，支援 POST /tasks/{id}/resume。
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchCheckpoints, resumeTask } from '../api/client';
import type { CheckpointSummary } from '../types';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return d.toLocaleString('zh-TW', { hour12: false });
}

export default function CheckpointsPanel() {
  const [items, setItems] = useState<CheckpointSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCheckpoints();
      setItems(data.checkpoints ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 12000);
    return () => clearInterval(timer);
  }, [refresh]);

  const onResume = async (taskId: string) => {
    setResuming(taskId);
    setNotice(null);
    try {
      const result = await resumeTask(taskId);
      setNotice(result.message || (result.success ? '已從檢查點恢復' : '恢復失敗'));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResuming(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto apple-canvas p-4 text-[#f7f8f8]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">斷點檢查點</h2>
          <p className="mt-0.5 text-[11px] text-[#8a8f98]">
            公司運行時中斷後可從此續跑 · {items.length} 筆
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-xl border border-white/[0.08] bg-[#1C1C1E] px-2 py-1 text-[11px] text-[#8a8f98] hover:text-[#f7f8f8]"
        >
          {loading ? '同步中' : '重新整理'}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-md border border-[#007AFF]/30 bg-[#007AFF]/10 px-3 py-2 text-xs text-[#64D2FF]">
          {notice}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="apple-card apple-card--tight !p-0 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[#62666d]">可恢復</p>
          <p className="mt-1 font-mono text-lg">{items.length}</p>
        </div>
        <div className="apple-card apple-card--tight !p-0 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[#62666d]">工作項合計</p>
          <p className="mt-1 font-mono text-lg">
            {items.reduce((sum, c) => sum + (c.work_item_count ?? 0), 0)}
          </p>
        </div>
        <div className="apple-card apple-card--tight !p-0 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[#62666d]">最近階段</p>
          <p className="mt-1 truncate font-mono text-sm">{items[0]?.phase || '—'}</p>
        </div>
        <div className="apple-card apple-card--tight !p-0 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-[#62666d]">最近儲存</p>
          <p className="mt-1 truncate font-mono text-[11px]">{items[0] ? fmtTime(items[0].saved_at) : '—'}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="apple-card apple-card--tight !p-0 px-4 py-16 text-center">
          <p className="text-sm text-[#8a8f98]">尚無可恢復檢查點</p>
          <p className="mt-1 text-[11px] text-[#62666d]">
            公司任務執行中會自動寫入 checkpoint_*.json，中斷後可在此續跑。
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto apple-card apple-card--tight !p-0">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-[#62666d]">
                <th className="px-3 py-2 font-medium">任務</th>
                <th className="px-3 py-2 font-medium">目標</th>
                <th className="px-3 py-2 font-medium">階段</th>
                <th className="px-3 py-2 font-medium">模板</th>
                <th className="px-3 py-2 font-medium">工作項</th>
                <th className="px-3 py-2 font-medium">儲存時間</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.task_id} className="border-b border-white/[0.08] last:border-0">
                  <td className="px-3 py-2 font-mono text-[11px] text-[#64D2FF]">
                    {c.task_id.slice(0, 12)}
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-xs text-[#d0d6e0]">
                    {c.goal || '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[#8a8f98]">{c.phase || '—'}</td>
                  <td className="px-3 py-2 text-[11px] text-[#8a8f98]">{c.config_name || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{c.work_item_count ?? 0}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[#8a8f98]">
                    {fmtTime(c.saved_at)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => void onResume(c.task_id)}
                      disabled={resuming === c.task_id}
                      className="rounded-md bg-[#007AFF] px-2 py-1 text-[11px] text-white disabled:opacity-50"
                    >
                      {resuming === c.task_id ? '恢復中…' : '續跑'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
