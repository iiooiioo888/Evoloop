/**
 * CloudConsoleView — 雲控制台主視圖。
 *
 * 整合五大模組：
 * - 📊 費用帳單 — BillingPanel
 * - 📈 資源監控 — MonitoringPanel
 * - 🐳 實例管理 — DockerView（容器卡片 + 啟停控制）
 * - ⚠ 告警中心 — AlertsPanel
 * - 📜 事件時間線 — EventsPanel
 *
 * 透過頂部標籤切換，提供完整的雲端管理體驗。
 */
import { useState } from 'react';
import AlertsPanel from './AlertsPanel';
import BillingPanel from './BillingPanel';
import DockerView from './DockerView';
import EventsPanel from './EventsPanel';
import MonitoringPanel from './MonitoringPanel';

type CloudTab = 'billing' | 'monitoring' | 'instances' | 'alerts' | 'events';

const TABS: { key: CloudTab; icon: string; label: string; desc: string }[] = [
  { key: 'billing', icon: '📊', label: '費用帳單', desc: '按時計費 · 服務明細' },
  { key: 'monitoring', icon: '📈', label: '資源監控', desc: 'CPU · 記憶體 · 網路' },
  { key: 'instances', icon: '🐳', label: '實例管理', desc: '容器啟停 · 日誌' },
  { key: 'alerts', icon: '⚠️', label: '告警中心', desc: '閾值規則 · 歷史' },
  { key: 'events', icon: '📜', label: '事件時間線', desc: 'start · stop · restart' },
];

export default function CloudConsoleView() {
  const [activeTab, setActiveTab] = useState<CloudTab>('billing');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 子標籤欄 */}
      <nav className="flex shrink-0 items-center border-b border-gray-800 bg-gray-900/50 px-2">
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
              title={tab.desc}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* 子面板內容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'billing' && <BillingPanel />}
        {activeTab === 'monitoring' && <MonitoringPanel />}
        {activeTab === 'instances' && <DockerView />}
        {activeTab === 'alerts' && <AlertsPanel />}
        {activeTab === 'events' && <EventsPanel />}
      </div>
    </div>
  );
}