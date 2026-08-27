/**
 * MonitorView — 统一监控视图（懶加載重模組 + Hub 推送）。
 *
 * 分頁切換統一由左側 SidePanel 外圍導航負責；此處僅渲染當前分頁內容。
 */
import { lazy, Suspense, useEffect } from 'react';
import { useMonitorHub } from '../hooks/useMonitorHub';
import { buildAnimLiveFeed } from '../lib/animLive';
import { normalizeMonitorTab } from '../lib/monitorTabs';
import { useMonitorStore } from '../stores/monitorStore';
import type { TaskProgress } from '../types';
import type { MonitorTab } from './AppShell';
import LiveBoard from './LiveBoard';
import ErrorState from './ui/ErrorState';

const AgentsMonitorPanel = lazy(() => import('./AgentsMonitorPanel'));
const PipelineView = lazy(() => import('./PipelineView'));
const OpcMonitorPanel = lazy(() => import('./OpcMonitorPanel'));
const LabPanel = lazy(() => import('./LabPanel'));
const OpsPanel = lazy(() => import('./OpsPanel'));
const MemoryPanel = lazy(() => import('./MemoryPanel'));

interface MonitorViewProps {
  onOpenTask: (task: TaskProgress) => void;
  activeTab: MonitorTab;
  onTabChange: (tab: MonitorTab) => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
}

function PanelFallback() {
  return (
    <div className="flex flex-1 items-center justify-center text-[12px] text-[#8E8E93]">
      載入模組…
    </div>
  );
}

function LiveTab() {
  const agents = useMonitorStore((s) => s.agents);
  const optimization = useMonitorStore((s) => s.optimization);
  const opc = useMonitorStore((s) => s.opc);
  const billing = useMonitorStore((s) => s.billing);
  const llmOps = useMonitorStore((s) => s.llmOps);
  const generatedAt = useMonitorStore((s) => s.generated_at);
  const connected = useMonitorStore((s) => s.connected);
  const error = useMonitorStore((s) => s.error);

  const liveFeed = buildAnimLiveFeed({
    agents,
    optimization,
    opc,
    billing,
    llmOps,
    updatedAt: generatedAt,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {error && (
        <div className="shrink-0 px-6 pt-4">
          <ErrorState kind="partial" message={error} compact />
        </div>
      )}
      {!connected && !error && (
        <div className="shrink-0 px-6 pt-3 text-[10px] text-[#636366]">REST 輪詢模式</div>
      )}
      <LiveBoard feed={liveFeed} />
    </div>
  );
}

export default function MonitorView({
  onOpenTask,
  activeTab,
  onTabChange,
  focusAgentId,
  onFocusAgent,
}: MonitorViewProps) {
  const tab = normalizeMonitorTab(activeTab);

  useEffect(() => {
    if (tab !== activeTab) onTabChange(tab);
  }, [tab, activeTab, onTabChange]);

  useMonitorHub(tab === 'agents' || tab === 'pipeline' || tab === 'live');

  const openAgent = (id: string) => {
    onTabChange('agents');
    onFocusAgent(id);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden apple-canvas">
      <Suspense fallback={<PanelFallback />}>
        {tab === 'live' && <LiveTab />}
        {tab === 'agents' && (
          <AgentsMonitorPanel focusAgentId={focusAgentId} onFocusAgent={onFocusAgent} />
        )}
        {tab === 'pipeline' && (
          <PipelineView onOpenTask={onOpenTask} onOpenAgent={openAgent} />
        )}
        {tab === 'opc' && <OpcMonitorPanel />}
        {tab === 'lab' && <LabPanel />}
        {tab === 'ops' && <OpsPanel />}
        {tab === 'memory' && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden apple-canvas">
            <MemoryPanel />
          </div>
        )}
      </Suspense>
    </div>
  );
}
