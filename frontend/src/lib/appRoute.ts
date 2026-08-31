/**
 * Hash 路由 — 支援書籤與刷新還原。
 *
 * 格式：
 *   #/chat
 *   #/monitor | #/monitor/tasks | #/monitor/tasks/{taskId}
 *   #/monitor/agents/{agentId}
 *   #/traces | #/traces/{taskId}
 */
import type { MonitorTab, ViewKey } from '../components/AppShell';
import { normalizeMonitorTab } from './monitorTabs';

export interface AppRoute {
  view: ViewKey;
  monitorTab: MonitorTab;
  focusAgentId: string | null;
  focusTaskId: string | null;
  traceTaskId: string | null;
}

function defaultView(): ViewKey {
  return import.meta.env.VITE_GITHUB_PAGES === 'true' ? 'monitor' : 'chat';
}

export function getDefaultRoute(): AppRoute {
  return {
    view: defaultView(),
    monitorTab: 'live',
    focusAgentId: null,
    focusTaskId: null,
    traceTaskId: null,
  };
}

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, '').replace(/^\/?/, '');
  if (!raw) return getDefaultRoute();

  const parts = raw.split('/').filter(Boolean);
  const head = parts[0];

  if (head === 'chat') {
    return { ...getDefaultRoute(), view: 'chat' };
  }

  if (head === 'monitor') {
    const tab = normalizeMonitorTab(parts[1] ?? 'live');
    const focusRaw = parts[2] ? decodeURIComponent(parts[2]) : null;
    return {
      view: 'monitor',
      monitorTab: tab,
      focusAgentId: tab === 'agents' && focusRaw ? focusRaw : null,
      focusTaskId: tab === 'tasks' && focusRaw ? focusRaw : null,
      traceTaskId: null,
    };
  }

  if (head === 'traces') {
    const traceTaskId = parts[1] ? decodeURIComponent(parts[1]) : null;
    return {
      ...getDefaultRoute(),
      view: 'traces',
      traceTaskId,
    };
  }

  return getDefaultRoute();
}

export function buildAppRouteHash(route: AppRoute): string {
  if (route.view === 'chat') return '#/chat';

  if (route.view === 'monitor') {
    if (route.monitorTab === 'agents' && route.focusAgentId) {
      return `#/monitor/agents/${encodeURIComponent(route.focusAgentId)}`;
    }
    if (route.monitorTab === 'tasks' && route.focusTaskId) {
      return `#/monitor/tasks/${encodeURIComponent(route.focusTaskId)}`;
    }
    if (route.monitorTab === 'live') return '#/monitor';
    return `#/monitor/${route.monitorTab}`;
  }

  if (route.view === 'traces') {
    return route.traceTaskId
      ? `#/traces/${encodeURIComponent(route.traceTaskId)}`
      : '#/traces';
  }

  return '#/chat';
}

export function appRouteFromState(params: {
  activeView: ViewKey;
  monitorTab: MonitorTab;
  focusAgentId: string | null;
  focusTaskId: string | null;
  traceTaskId: string | null;
}): AppRoute {
  return {
    view: params.activeView,
    monitorTab: params.monitorTab,
    focusAgentId: params.focusAgentId,
    focusTaskId: params.focusTaskId,
    traceTaskId: params.traceTaskId,
  };
}

/** 寫入 hash；一律用 replaceState，避免 hash 賦值觸發 hashchange 造成更新迴圈。 */
export function syncAppRouteHash(route: AppRoute): void {
  const hash = buildAppRouteHash(route);
  if (window.location.hash === hash) return;
  window.history.replaceState(null, '', hash);
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  return (
    a.view === b.view &&
    a.monitorTab === b.monitorTab &&
    a.focusAgentId === b.focusAgentId &&
    a.focusTaskId === b.focusTaskId &&
    a.traceTaskId === b.traceTaskId
  );
}

export function applyAppRoute(route: AppRoute): {
  activeView: ViewKey;
  monitorTab: MonitorTab;
  focusAgentId: string | null;
  focusTaskId: string | null;
  traceTaskId: string | null;
} {
  return {
    activeView: route.view,
    monitorTab: route.monitorTab,
    focusAgentId: route.focusAgentId,
    focusTaskId: route.focusTaskId,
    traceTaskId: route.traceTaskId,
  };
}
