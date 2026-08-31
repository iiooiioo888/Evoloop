/**
 * useChatLiveMonitor — 對話頁集中輪詢 Agent／雲端／LLM／系統指標／Docker 監控。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAgentMonitor,
  fetchCloudBilling,
  fetchCloudMonitoringLatest,
  fetchDockerStatus,
  fetchLlmOps,
  fetchMemories,
  fetchOptimizationMonitor,
} from '../api/client';
import type {
  AgentMonitorData,
  CloudBilling,
  DockerStatus,
  LlmOpsData,
  OptimizationMonitorData,
} from '../types';

export interface ChatLiveMonitorState {
  agents: AgentMonitorData | null;
  billing: CloudBilling | null;
  llmOps: LlmOpsData | null;
  docker: DockerStatus | null;
  optimization: OptimizationMonitorData | null;
  cloudLatest: { cpu: number; memMb: number; ts: string | null };
  memoryCount: number;
  updatedAt: string | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 5000;

export function useChatLiveMonitor(): ChatLiveMonitorState {
  const [agents, setAgents] = useState<AgentMonitorData | null>(null);
  const [billing, setBilling] = useState<CloudBilling | null>(null);
  const [llmOps, setLlmOps] = useState<LlmOpsData | null>(null);
  const [docker, setDocker] = useState<DockerStatus | null>(null);
  const [optimization, setOptimization] = useState<OptimizationMonitorData | null>(null);
  const [cloudLatest, setCloudLatest] = useState<{ cpu: number; memMb: number; ts: string | null }>({
    cpu: 0,
    memMb: 0,
    ts: null,
  });
  const [memoryCount, setMemoryCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, b, llm, dock, latest, mem, opt] = await Promise.all([
        fetchAgentMonitor().catch(() => null),
        fetchCloudBilling().catch(() => null),
        fetchLlmOps().catch(() => null),
        fetchDockerStatus().catch(() => null),
        fetchCloudMonitoringLatest().catch(() => null),
        fetchMemories(1, 0).catch(() => ({ total: 0 })),
        fetchOptimizationMonitor().catch(() => null),
      ]);
      if (a) setAgents(a);
      if (b) setBilling(b);
      if (llm) setLlmOps(llm);
      if (dock) setDocker(dock);
      if (opt) setOptimization(opt);
      if (latest) {
        const services = latest.services ?? {};
        const vals = Object.values(services);
        const cpu = vals.length ? vals.reduce((s, v) => s + (v.cpu ?? 0), 0) / vals.length : 0;
        const memMb = vals.reduce((s, v) => s + (v.mem_mb ?? 0), 0);
        setCloudLatest({ cpu, memMb, ts: latest.ts });
      }
      setMemoryCount(mem?.total ?? 0);
      setUpdatedAt(new Date().toISOString());
      setError(a || b ? null : '監控來源暫時不可達');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return {
    agents,
    billing,
    llmOps,
    docker,
    optimization,
    cloudLatest,
    memoryCount,
    updatedAt,
    error,
    refresh,
  };
}
