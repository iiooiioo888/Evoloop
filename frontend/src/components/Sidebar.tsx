/** 會話列表側邊欄：新建/切換/刪除會話（兩段確認），手機版可收合。 */
import { useEffect, useState } from 'react';
import type { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

export default function Sidebar({
  sessions,
  activeId,
  open,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: SidebarProps) {
  // 兩段刪除確認：第一次點擊進入確認態，3 秒後自動恢復
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmingId) return;
    const timer = setTimeout(() => setConfirmingId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingId]);

  return (
    <>
      {/* 手機版遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* 頂部：新建按鈕 */}
        <div className="flex items-center gap-2 border-b border-gray-800 p-3">
          <button
            onClick={onNew}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-blue-500 hover:bg-gray-700"
          >
            ＋ 新對話
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-2 text-gray-400 hover:bg-gray-800 md:hidden"
            aria-label="關閉側邊欄"
          >
            ✕
          </button>
        </div>

        {/* 會話列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 && (
            <p className="mt-8 px-3 text-center text-xs text-gray-500">
              尚無對話紀錄
            </p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                session.id === activeId
                  ? 'bg-blue-600/15 ring-1 ring-blue-500/30'
                  : 'hover:bg-gray-800'
              }`}
              onClick={() => onSelect(session.id)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-200">
                  {session.title || '新對話'}
                </p>
                <p className="text-[11px] text-gray-500">
                  {formatRelative(session.updatedAt)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmingId === session.id) {
                    onDelete(session.id);
                    setConfirmingId(null);
                  } else {
                    setConfirmingId(session.id);
                  }
                }}
                className={`shrink-0 rounded px-1.5 py-1 text-xs transition-all ${
                  confirmingId === session.id
                    ? 'bg-red-900/50 text-red-300 opacity-100'
                    : 'text-gray-500 opacity-0 hover:bg-red-900/40 hover:text-red-300 group-hover:opacity-100'
                }`}
                aria-label="刪除會話"
              >
                {confirmingId === session.id ? '確認刪除?' : '🗑'}
              </button>
            </div>
          ))}
        </div>

        {/* 底部說明 */}
        <div className="border-t border-gray-800 p-3 text-[11px] text-gray-500">
          對話紀錄僅存於本機瀏覽器
        </div>
      </aside>
    </>
  );
}
