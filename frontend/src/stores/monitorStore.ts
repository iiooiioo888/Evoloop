/**
 * 監控中心全域狀態（Zustand）— 避免 prop drilling 與重複輪詢。
 */
import { create } from 'zustand';
import type {
  AgentMonitorData,
  CloudBilling,
  DashboardData,
  HubMonitorData,
  LlmOpsData,
  OpcMonitorData,
  OptimizationMonitorData,
} from '../types';

export interface MonitorHubSnapshot {
  agents: AgentMonitorData | null;
  optimization: OptimizationMonitorData | null;
  opc: OpcMonitorData | null;
  billing: CloudBilling | null;
  llmOps: LlmOpsData | null;
  hub: HubMonitorData | null;
  dashboard: DashboardData | null;
  generated_at: string | null;
  error: string | null;
}

interface MonitorStore extends MonitorHubSnapshot {
  connected: boolean;
  setConnected: (v: boolean) => void;
  applySnapshot: (partial: Partial<MonitorHubSnapshot>) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const empty: MonitorHubSnapshot = {
  agents: null,
  optimization: null,
  opc: null,
  billing: null,
  llmOps: null,
  hub: null,
  dashboard: null,
  generated_at: null,
  error: null,
};

export const useMonitorStore = create<MonitorStore>((set) => ({
  ...empty,
  connected: false,
  setConnected: (connected) => set({ connected }),
  applySnapshot: (partial) =>
    set((s) => ({
      ...s,
      ...partial,
      generated_at: partial.generated_at ?? s.generated_at ?? new Date().toISOString(),
      error: partial.error === undefined ? s.error : partial.error,
    })),
  setError: (error) => set({ error }),
  reset: () => set({ ...empty, connected: false }),
}));
