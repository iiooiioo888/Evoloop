/**
 * ActivityBar — VS Code 风格活动栏（48px 图标列）。
 *
 * 4 个导航图标：💬 对话 / 📊 控制面版 / 🏭 OPC 监控 / ⚙ 设置
 * 当前活跃项左侧蓝色竖条指示器。
 */
import type { ViewKey } from './AppShell';

interface ActivityBarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const ITEMS: { key: ViewKey; icon: string; label: string }[] = [
  { key: 'chat', icon: '💬', label: '对话' },
  { key: 'monitor', icon: '📊', label: '监控' },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center border-r border-gray-800 bg-gray-900/80 py-2">
      {ITEMS.map((item) => {
        const active = activeView === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={`relative mb-1 flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-all duration-150 ${
              active
                ? 'text-gray-100'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            }`}
            title={item.label}
          >
            {/* 左侧活跃指示器 */}
            {active && (
              <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-blue-500" />
            )}
            {item.icon}
          </button>
        );
      })}
    </nav>
  );
}