/**
 * SidePanel — 左侧上下文面板（220px）。
 *
 * 根据 activeView 显示不同内容：
 * - Chat → 会话列表（原 Sidebar 逻辑）
 * - Dashboard → 面版子导航
 * - OPC → OPC 标签列表
 */
import { useEffect, useState } from 'react';
import type { ChatSession } from '../types';
import type { ViewKey } from './AppShell';

interface SidePanelProps {
  activeView: ViewKey;
  sessions: ChatSession[];
  activeSessionId: string;
  open: boolean;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(ts).toLocaleDateString('zh-TW');
}

/** 会话列表 */
function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmingId) return;
    const timer = setTimeout(() => setConfirmingId(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingId]);

  return (
    <>
      <div className="border-b border-gray-800 p-2">
        <button
          onClick={onNewSession}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:border-blue-500 hover:bg-gray-700"
        >
          ＋ 新对话
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {sessions.length === 0 && (
          <p className="mt-8 px-3 text-center text-xs text-gray-500">尚無对话纪录</p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${
              session.id === activeSessionId
                ? 'bg-blue-600/15 ring-1 ring-blue-500/30'
                : 'hover:bg-gray-800'
            }`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{session.title || '新对话'}</p>
              <p className="text-[11px] text-gray-500">{formatRelative(session.updatedAt)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirmingId === session.id) {
                  onDeleteSession(session.id);
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
              aria-label="删除会话"
            >
              {confirmingId === session.id ? '确认?' : '🗑'}
            </button>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-800 p-2 text-[11px] text-gray-500">
        对话纪录仅存于本机浏览器
      </div>
    </>
  );
}

/** Dashboard 子导航 */
function DashboardNav() {
  return (
    <div className="p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">控制面版</p>
      <nav className="space-y-0.5">
        {[
          { key: 'console', label: '控制台', icon: '💬' },
          { key: 'overview', label: '总览', icon: '📈' },
          { key: 'tasks', label: '任务历史', icon: '📋' },
          { key: 'content', label: '生成内容', icon: '📦' },
          { key: 'skills', label: '工具与 Skills', icon: '🛠' },
          { key: 'audit', label: 'OPC 审计', icon: '🔍' },
        ].map((item) => (
          <a
            key={item.key}
            href={`#${item.key}`}
            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <span>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** OPC 标签列表 */
function OPCTagList() {
  return (
    <div className="p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">OPC 监控</p>
      <div className="space-y-2">
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
          <p className="text-xs font-medium text-cyan-300">📡 6 级闭环</p>
          <p className="mt-0.5 text-[11px] text-gray-500">感知 → 预處理 → 分析 → 诊断 → 决策 → 执行</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-gray-800/40 px-3 py-2">
          <p className="text-xs font-medium text-gray-300">📊 模拟标签</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Temperature, Pressure, FlowRate, Level, Vibration, Humidity
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-gray-800/40 px-3 py-2">
          <p className="text-xs font-medium text-gray-300">🛡 安全护栏</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            白名单验证 · 数值边界检查 · 审计日志
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SidePanel({
  activeView,
  sessions,
  activeSessionId,
  open,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onClose,
}: SidePanelProps) {
  return (
    <>
      {/* 移动端遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-10 left-12 z-30 flex w-56 flex-col border-r border-gray-800 bg-gray-900 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* 移动端关闭按钮 */}
        <div className="flex items-center justify-between border-b border-gray-800 p-2 md:hidden">
          <span className="text-xs font-medium text-gray-400">导航</span>
          <button
            onClick={onClose}
            className="rounded px-2 py-0.5 text-gray-400 hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {activeView === 'chat' && (
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
          />
        )}
        {activeView === 'dashboard' && <DashboardNav />}
        {activeView === 'opc' && <OPCTagList />}
      </aside>
    </>
  );
}