/**
 * DashboardView — 控制面版视图包装器。
 *
 * 在 IDE 布局中嵌入 Dashboard 组件（embedded 模式），
 * 去除独立页面外壳，适配 AppShell 主内容区。
 */
import type { TaskProgress } from '../types';
import Dashboard from './Dashboard';

interface DashboardViewProps {
  onBack: () => void;
  onOpenTask: (task: TaskProgress) => void;
}

export default function DashboardView({ onBack, onOpenTask }: DashboardViewProps) {
  return (
    <Dashboard
      embedded
      onBack={onBack}
      onOpenTask={onOpenTask}
    />
  );
}