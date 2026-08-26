/**
 * TopBar — IDE 风格顶栏。
 *
 * 显示 Logo、当前模式指示、右侧面板开关、设置按钮。
 */
import type { ViewKey } from './AppShell';

interface TopBarProps {
  activeView: ViewKey;
  llmConfigured: boolean | null;
  rightPanelOpen: boolean;
  onRightPanelToggle: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

const VIEW_LABELS: Record<ViewKey, { icon: string; label: string }> = {
  chat: { icon: '💬', label: '对话' },
  hub: { icon: '🛰️', label: 'AI Hub' },
  monitor: { icon: '📊', label: '监控' },
  traces: { icon: '📜', label: '执行轨迹' },
};

export default function TopBar({
  activeView,
  llmConfigured,
  rightPanelOpen,
  onRightPanelToggle,
  onOpenSettings,
  onToggleSidebar,
}: TopBarProps) {
  const view = VIEW_LABELS[activeView];

  return (
    <header className="flex h-10 shrink-0 items-center border-b border-gray-800 bg-gray-900 px-2">
      {/* 移动端汉堡菜单 */}
      <button
        onClick={onToggleSidebar}
        className="mr-1 rounded-md px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200 md:hidden"
        aria-label="切换侧边栏"
      >
        ☰
      </button>

      {/* Logo */}
      <span className="mr-3 text-base">🔄</span>
      <span className="mr-4 text-sm font-semibold text-gray-200">EvoLoop</span>

      {/* 当前视图指示 */}
      <span className="flex items-center gap-1.5 rounded-md bg-gray-800/80 px-2.5 py-1 text-xs text-gray-400">
        <span>{view.icon}</span>
        <span>{view.label}</span>
      </span>

      {/* 右侧操作 */}
      <div className="ml-auto flex items-center gap-1">
        {/* LLM 配置状态 */}
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${
            llmConfigured === null
              ? 'bg-gray-800 text-gray-500'
              : llmConfigured
                ? 'bg-green-500/15 text-green-300'
                : 'bg-yellow-500/15 text-yellow-300'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              llmConfigured === null
                ? 'bg-gray-500'
                : llmConfigured
                  ? 'bg-green-400'
                  : 'bg-yellow-400'
            }`}
          />
          {llmConfigured === null ? '未知' : llmConfigured ? '已连接' : '未配置'}
        </span>

        {import.meta.env.VITE_GITHUB_PAGES === 'true' && (
          <span
            className="hidden items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] text-indigo-300 sm:flex"
            title="此為 GitHub Pages 靜態預覽，聊天與寫入需本地或 Docker 啟動完整服務"
          >
            靜態預覽
          </span>
        )}

        {/* OPC 右侧面板开关 */}
        <button
          onClick={onRightPanelToggle}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
            rightPanelOpen
              ? 'bg-cyan-500/15 text-cyan-300'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
          }`}
          title="OPC 诊断面板"
        >
          🏭 OPC
        </button>

        {/* 设置 */}
        <button
          onClick={onOpenSettings}
          className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
          title="API 设置"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}