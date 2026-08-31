/**
 * 監控中心資料源：優先 WebSocket 推送，失敗則降級為 REST 輪詢。
 */
import { useEffect } from 'react';
import {
  fetchAgentMonitor,
  fetchCloudBilling,
  fetchDashboard,
  fetchHubMonitor,
  fetchLlmOps,
  fetchOptimizationMonitor,
  MonitorHubWebSocket,
} from '../api/client';
import { useMonitorStore } from '../stores/monitorStore';

const POLL_MS = 8000;

async function pullRestSnapshot() {
  const [agents, optimization, billing, llmOps, hub, dashboard] = await Promise.all([
    fetchAgentMonitor().catch(() => null),
    fetchOptimizationMonitor().catch(() => null),
    fetchCloudBilling().catch(() => null),
    fetchLlmOps().catch(() => null),
    fetchHubMonitor().catch(() => null),
    fetchDashboard().catch(() => null),
  ]);
  useMonitorStore.getState().applySnapshot({
    agents,
    optimization,
    billing,
    llmOps,
    hub,
    dashboard,
    generated_at: new Date().toISOString(),
    error: null,
  });
}

/** 訂閱監控 Hub；元件掛載時自動連線／降級輪詢。 */
export function useMonitorHub(enabled = true) {
  const connected = useMonitorStore((s) => s.connected);
  const error = useMonitorStore((s) => s.error);

  useEffect(() => {
    if (!enabled) return;

    let ws: MonitorHubWebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const startPoll = () => {
      if (pollTimer || cancelled) return;
      void pullRestSnapshot();
      pollTimer = setInterval(() => void pullRestSnapshot(), POLL_MS);
    };

    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    try {
      ws = new MonitorHubWebSocket(
        (snap) => {
          if (cancelled) return;
          stopPoll();
          useMonitorStore.getState().setConnected(true);
          useMonitorStore.getState().applySnapshot({
            agents: (snap.agents as never) ?? null,
            optimization: (snap.optimization as never) ?? null,
            billing: (snap.billing as never) ?? null,
            llmOps: (snap.llm_ops as never) ?? null,
            hub: (snap.hub as never) ?? null,
            dashboard: (snap.dashboard as never) ?? null,
            generated_at: String(snap.generated_at ?? new Date().toISOString()),
            error: null,
          });
        },
        () => {
          useMonitorStore.getState().setConnected(false);
          if (!cancelled) startPoll();
        },
      );
      ws.connect();
      // 3 秒內未連上則降級
      setTimeout(() => {
        if (!cancelled && !ws?.connected) startPoll();
      }, 3000);
    } catch {
      startPoll();
    }

    return () => {
      cancelled = true;
      stopPoll();
      ws?.close();
      useMonitorStore.getState().setConnected(false);
    };
  }, [enabled]);

  return { connected, error };
}
