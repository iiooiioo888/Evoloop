/**
 * 監控中心分頁定義（單一資料源）。
 * 主分頁 3 個；其餘收入「更多」，降低側欄密度。
 */
import type { MonitorTab } from '../components/AppShell';

export type MonitorTabItem = { key: MonitorTab; icon: string; label: string };

/** 左側常駐主分頁。 */
export const MONITOR_PRIMARY_TABS: MonitorTabItem[] = [
  { key: 'live', icon: '◎', label: '即時' },
  { key: 'tasks', icon: '▣', label: '任務' },
  { key: 'agents', icon: '◈', label: '角色' },
  { key: 'pipeline', icon: '⬡', label: '管線' },
];

/** 收納於「更多」的次要分頁。 */
export const MONITOR_MORE_TABS: MonitorTabItem[] = [
  { key: 'opc', icon: '◇', label: 'OPC' },
  { key: 'lab', icon: '✦', label: '實驗室' },
  { key: 'ops', icon: '⚙', label: '運維' },
  { key: 'memory', icon: '◌', label: '記憶' },
];

/** 全部（相容舊呼叫）。 */
export const MONITOR_TABS: MonitorTabItem[] = [
  ...MONITOR_PRIMARY_TABS,
  ...MONITOR_MORE_TABS,
];

/** 舊分頁鍵 → 新分頁。 */
export const MONITOR_TAB_ALIASES: Record<string, MonitorTab> = {
  overview: 'live',
  balancer: 'live',
  task: 'tasks',
  dashboard: 'tasks',
  hub: 'ops',
  llm: 'ops',
  cloud: 'ops',
  checkpoints: 'ops',
};

export function normalizeMonitorTab(tab: string | null | undefined): MonitorTab {
  if (!tab) return 'live';
  if (MONITOR_TABS.some((t) => t.key === tab)) return tab as MonitorTab;
  return MONITOR_TAB_ALIASES[tab] ?? 'live';
}

export function monitorTabLabel(tab: MonitorTab): string {
  return MONITOR_TABS.find((item) => item.key === tab)?.label ?? tab;
}

export function isMonitorMoreTab(tab: MonitorTab): boolean {
  return MONITOR_MORE_TABS.some((t) => t.key === tab);
}
