/**
 * 監控中心分頁定義（單一資料源）。
 * 精簡為 7 個主分頁，次要功能收入「運維／實驗室」膠囊內。
 */
import type { MonitorTab } from '../components/AppShell';

export type MonitorTabItem = { key: MonitorTab; icon: string; label: string };

/** 左側外圍導航順序。 */
export const MONITOR_TABS: MonitorTabItem[] = [
  { key: 'live', icon: '◎', label: '即時' },
  { key: 'agents', icon: '◈', label: '角色' },
  { key: 'pipeline', icon: '⬡', label: '管線' },
  { key: 'opc', icon: '⬡', label: 'OPC' },
  { key: 'lab', icon: '✦', label: '實驗室' },
  { key: 'ops', icon: '⚙', label: '運維' },
  { key: 'memory', icon: '◌', label: '記憶' },
];

/** 舊分頁鍵 → 新分頁（相容本機狀態／書籤）。 */
export const MONITOR_TAB_ALIASES: Record<string, MonitorTab> = {
  overview: 'live',
  balancer: 'live',
  dashboard: 'pipeline',
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
