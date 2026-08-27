/**
 * AppShell — IDE 风格布局容器。
 *
 * 布局：TopBar → [ActivityBar | SidePanel | MainContent | RightPanel] → StatusBar
 * 管理 activeView / rightPanelOpen / sidebarOpen 等布局状态。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChatSession } from '../types';
import ActivityBar from './ActivityBar';
import RightPanel from './RightPanel';
import SidePanel from './SidePanel';
import StatusBar from './StatusBar';
import TopBar from './TopBar';

export type ViewKey = 'chat' | 'monitor' | 'traces';
/** 精簡後的監控主分頁（次要功能收入 ops / lab）。 */
export type MonitorTab =
  | 'live'
  | 'agents'
  | 'pipeline'
  | 'opc'
  | 'lab'
  | 'ops'
  | 'memory';

export interface AppShellProps {
  /** 当前活跃视图 */
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;

  /** 右侧 OPC 面板内容（TaskProgress） */
  rightPanelTask: import('../types').TaskProgress | null;
  onRightPanelClose: () => void;

  /** 会话列表（SidePanel 用） */
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;

  /** LLM 配置状态 */
  llmConfigured: boolean | null;

  /** 打开设置 */
  onOpenSettings: () => void;

  /** 监控中心子分頁 */
  monitorTab: MonitorTab;
  onMonitorTabChange: (tab: MonitorTab) => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;

  /** 状态栏信息 */
  statusInfo: {
    taskCount: number;
    memoryCount: number;
  };

  /** 主内容区 */
  children: ReactNode;
}

export default function AppShell({
  activeView,
  onViewChange,
  rightPanelTask,
  onRightPanelClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  llmConfigured,
  onOpenSettings,
  monitorTab,
  onMonitorTabChange,
  focusAgentId,
  onFocusAgent,
  statusInfo,
  children,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 任一入口切到「角色 Agent」時，確保左側外圍側欄開啟（名冊所在）
  useEffect(() => {
    if (activeView === 'monitor' && monitorTab === 'agents') {
      setSidebarOpen(true);
    }
  }, [activeView, monitorTab]);

  const handleViewChange = useCallback(
    (view: ViewKey) => {
      onViewChange(view);
      setSidebarOpen(view === 'monitor');
    },
    [onViewChange],
  );

  return (
    <div className="flex h-dvh flex-col apple-canvas text-[#F5F5F7]">
      {/* ══ 顶栏 ══ */}
      <TopBar
        activeView={activeView}
        llmConfigured={llmConfigured}
        rightPanelOpen={rightPanelTask !== null}
        onRightPanelToggle={() => {
          if (rightPanelTask) onRightPanelClose();
        }}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {/* ══ 中间区域：ActivityBar + SidePanel + Main + RightPanel ══ */}
      <div className="flex min-h-0 flex-1">
        {/* 活动栏 */}
        <ActivityBar activeView={activeView} onViewChange={handleViewChange} />

        {/* 侧面板（移动端覆盖层） */}
        <SidePanel
          activeView={activeView}
          sessions={sessions}
          activeSessionId={activeSessionId}
          open={sidebarOpen}
          onSelectSession={(id) => {
            onSelectSession(id);
            setSidebarOpen(false);
          }}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          onClose={() => setSidebarOpen(false)}
          monitorTab={monitorTab}
          onMonitorTabChange={onMonitorTabChange}
          focusAgentId={focusAgentId}
          onFocusAgent={onFocusAgent}
        />

        {/* 主内容区 */}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>

        {/* 右侧 OPC 面板（滑动式） */}
        <RightPanel
          task={rightPanelTask}
          onClose={onRightPanelClose}
        />
      </div>

      {/* ══ 底部状态栏 ══ */}
      <StatusBar
        llmConfigured={llmConfigured}
        taskCount={statusInfo.taskCount}
        memoryCount={statusInfo.memoryCount}
      />
    </div>
  );
}