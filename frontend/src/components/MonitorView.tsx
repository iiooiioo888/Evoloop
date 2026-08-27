/**
 * MonitorView — 统一监控视图。
 *
 * 分頁切換統一由左側 SidePanel 外圍導航負責；此處僅渲染當前分頁內容。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAgentMonitor,
  fetchCloudBilling,
  fetchLlmOps,
  fetchOpcMonitor,
  fetchOptimizationMonitor,
} from '../api/client';
import { buildAnimLiveFeed } from '../lib/animLive';
import type { TaskProgress } from '../types';
import type {
  AgentMonitorData,
  CloudBilling,
  LlmOpsData,
  OpcMonitorData,
  OptimizationMonitorData,
} from '../types';
import AgentsMonitorPanel from './AgentsMonitorPanel';
import type { MonitorTab } from './AppShell';
import CheckpointsPanel from './CheckpointsPanel';
import CloudConsoleView from './CloudConsoleView';
import Dashboard from './Dashboard';
import HubPanel from './HubPanel';
import LlmOpsPanel from './LlmOpsPanel';
import LiveBoard from './LiveBoard';
import MemoryPanel from './MemoryPanel';
import MonitorOverview from './MonitorOverview';
import { monitorTabLabel, MONITOR_TABS } from '../lib/monitorTabs';
import OpcMonitorPanel from './OpcMonitorPanel';

interface MonitorViewProps {
  onOpenTask: (task: TaskProgress) => void;
  activeTab: MonitorTab;
  onTabChange: (tab: MonitorTab) => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
}

function BalancerTab() {
  const [agents, setAgents] = useState<AgentMonitorData | null>(null);
  const [optimization, setOptimization] = useState<OptimizationMonitorData | null>(null);
  const [opc, setOpc] = useState<OpcMonitorData | null>(null);
  const [billing, setBilling] = useState<CloudBilling | null>(null);
  const [llmOps, setLlmOps] = useState<LlmOpsData | null>(null);

  const refresh = useCallback(async () => {
    const [a, opt, o, b, llm] = await Promise.all([
      fetchAgentMonitor().catch(() => null),
      fetchOptimizationMonitor().catch(() => null),
      fetchOpcMonitor().catch(() => null),
      fetchCloudBilling().catch(() => null),
      fetchLlmOps().catch(() => null),
    ]);
    if (a) setAgents(a);
    if (opt) setOptimization(opt);
    if (o) setOpc(o);
    if (b) setBilling(b);
    if (llm) setLlmOps(llm);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const liveFeed = useMemo(
    () =>
      buildAnimLiveFeed({
        agents,
        optimization,
        opc,
        billing,
        llmOps,
        updatedAt: agents?.generated_at ?? null,
      }),
    [agents, optimization, opc, billing, llmOps],
  );

  return <LiveBoard feed={liveFeed} />;
}

export default function MonitorView({
  onOpenTask,
  activeTab,
  onTabChange,
  focusAgentId,
  onFocusAgent,
}: MonitorViewProps) {
  const openTab = (tab: MonitorTab, agentId?: string) => {
    onTabChange(tab);
    if (tab === 'agents' && agentId) {
      onFocusAgent(agentId);
    }
  };

  const current = MONITOR_TABS.find((t) => t.key === activeTab);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#010102]">
      {/* 即時動態：標題已在左側導航，主區不再重複 chrome／長說明 */}
      {activeTab !== 'balancer' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#23252a] bg-[#0f1011] px-4 py-2">
          <span className="text-sm leading-none">{current?.icon ?? '▣'}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#f7f8f8]">
              {current?.label ?? monitorTabLabel(activeTab)}
            </p>
            <p className="text-[10px] text-[#62666d]">
              左側外圍切換分頁 · ◈ 角色 Agent 與其他分頁同層
            </p>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === 'overview' && <MonitorOverview onOpenTab={openTab} />}
        {activeTab === 'agents' && (
          <AgentsMonitorPanel focusAgentId={focusAgentId} onFocusAgent={onFocusAgent} />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard
            embedded
            onBack={() => {}}
            onOpenTask={onOpenTask}
            onOpenAgent={(id) => openTab('agents', id)}
          />
        )}
        {activeTab === 'opc' && <OpcMonitorPanel />}
        {activeTab === 'hub' && <HubPanel />}
        {activeTab === 'llm' && <LlmOpsPanel />}
        {activeTab === 'balancer' && <BalancerTab />}
        {activeTab === 'cloud' && <CloudConsoleView />}
        {activeTab === 'memory' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#010102]">
            <MemoryPanel />
          </div>
        )}
        {activeTab === 'checkpoints' && <CheckpointsPanel />}
      </div>
    </div>
  );
}
