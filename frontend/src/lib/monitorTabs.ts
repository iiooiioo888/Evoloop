/**
 * 監控中心分頁定義（單一資料源）。
 *
 * MonitorView 頂部導航與 SidePanel 當前分頁標籤共用此配置，避免兩套入口分叉。
 */
import type { MonitorTab } from '../components/AppShell';

export type MonitorTabItem = { key: MonitorTab; icon: string; label: string };

export const MONITOR_TABS: MonitorTabItem[] = [
  { key: 'agents', icon: '◈', label: '角色 Agent' },
  { key: 'overview', icon: '▣', label: '總覽' },
  { key: 'dashboard', icon: '📊', label: '控制面版' },
  { key: 'opc', icon: '🏭', label: 'OPC 監控' },
  { key: 'hub', icon: '🛰️', label: 'AI Hub' },
  { key: 'llm', icon: '⚙', label: 'LLM 運維' },
  { key: 'cloud', icon: '☁️', label: '雲控制台' },
  { key: 'memory', icon: '🧠', label: '記憶庫' },
  { key: 'checkpoints', icon: '💾', label: '檢查點' },
];

export function monitorTabLabel(tab: MonitorTab): string {
  return MONITOR_TABS.find((item) => item.key === tab)?.label ?? tab;
}
