/**
 * 監控中心分頁定義（單一資料源）。
 *
 * SidePanel 左側外圍導航與 MonitorView 共用，避免兩套入口分叉。
 */
import type { MonitorTab } from '../components/AppShell';

export type MonitorTabItem = { key: MonitorTab; icon: string; label: string };

/** 順序即左側外圍導航順序（角色 Agent 與其他分頁同層）。 */
export const MONITOR_TABS: MonitorTabItem[] = [
  { key: 'overview', icon: '▣', label: '總覽' },
  { key: 'agents', icon: '◈', label: '角色 Agent' },
  { key: 'dashboard', icon: '📊', label: '控制面版' },
  { key: 'opc', icon: '🏭', label: 'OPC 監控' },
  { key: 'hub', icon: '🛰️', label: 'AI Hub' },
  { key: 'llm', icon: '⚙', label: 'LLM 運維' },
  { key: 'balancer', icon: '✨', label: '即時動態' },
  { key: 'cloud', icon: '☁️', label: '雲控制台' },
  { key: 'memory', icon: '🧠', label: '記憶庫' },
  { key: 'checkpoints', icon: '💾', label: '檢查點' },
];

export function monitorTabLabel(tab: MonitorTab): string {
  return MONITOR_TABS.find((item) => item.key === tab)?.label ?? tab;
}
