/**
 * MonitorView — 统一监控视图。
 *
 * 總覽 / 角色 Agent / 控制面版 / OPC / AI Hub / 雲控制台 / 記憶庫 / 檢查點。
 */
import type { TaskProgress } from '../types';
import AgentsMonitorPanel from './AgentsMonitorPanel';
import type { MonitorTab } from './AppShell';
import CheckpointsPanel from './CheckpointsPanel';
import CloudConsoleView from './CloudConsoleView';
import Dashboard from './Dashboard';
import HubPanel from './HubPanel';
import LlmOpsPanel from './LlmOpsPanel';
import MemoryPanel from './MemoryPanel';
import MonitorOverview from './MonitorOverview';
import { MONITOR_TABS } from '../lib/monitorTabs';
import OpcMonitorPanel from './OpcMonitorPanel';

interface MonitorViewProps {
  onOpenTask: (task: TaskProgress) => void;
  activeTab: MonitorTab;
  onTabChange: (tab: MonitorTab) => void;
  focusAgentId: string | null;
  onFocusAgent: (id: string | null) => void;
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[#010102]">
      <nav className="flex shrink-0 items-center overflow-x-auto border-b border-[#23252a] bg-[#0f1011] px-2">
        {MONITOR_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => openTab(tab.key)}
              className={`relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-[#5e6ad2] text-[#828fff]'
                  : 'border-transparent text-[#8a8f98] hover:text-[#d0d6e0]'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

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
