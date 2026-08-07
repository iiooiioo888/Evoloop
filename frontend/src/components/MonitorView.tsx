/**
 * MonitorView — 统一监控视图。
 *
 * 整合 Dashboard（控制面版）、OPC（工业监控）、Cloud（云控制台）
 * 三个子面板，通过顶部标签切换。
 */
import { useState } from 'react';
import type { TaskProgress } from '../types';
import CloudConsoleView from './CloudConsoleView';
import Dashboard from './Dashboard';

type MonitorTab = 'dashboard' | 'opc' | 'cloud';

const TABS: { key: MonitorTab; icon: string; label: string }[] = [
  { key: 'dashboard', icon: '📊', label: '控制面版' },
  { key: 'opc', icon: '🏭', label: 'OPC 监控' },
  { key: 'cloud', icon: '☁️', label: '云控制台' },
];

interface MonitorViewProps {
  onOpenTask: (task: TaskProgress) => void;
}

/** OPC 监控占位页（OPC 详细数据在 RightPanel 中展示） */
function OPCView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <span className="mb-4 text-5xl">🏭</span>
      <h2 className="mb-2 text-lg font-semibold text-gray-200">OPC UA 工业监控</h2>
      <p className="mb-4 max-w-md text-sm text-gray-500">
        在对话视图中开启 OPC 模式，发送工业制程检查请求，
        即可在右侧面板查看 6 级闭环诊断数据。
      </p>
      <div className="grid max-w-lg gap-2 text-left">
        {[
          { icon: '📡', label: '感知', desc: '读取 OPC UA 标签实时数据' },
          { icon: '🧹', label: '预處理', desc: '数据品质过滤与清洗' },
          { icon: '📊', label: '分析', desc: '统计分析与阈值违规检测' },
          { icon: '🔍', label: '诊断', desc: '根因分析与异常定位' },
          { icon: '🧠', label: '决策', desc: '修正方案生成与风险评估' },
          { icon: '⚡', label: '执行', desc: '安全护栏校验后写入 OPC' },
        ].map((p) => (
          <div
            key={p.label}
            className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5"
          >
            <span className="text-base">{p.icon}</span>
            <div>
              <p className="text-xs font-medium text-gray-300">{p.label}</p>
              <p className="text-[11px] text-gray-500">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MonitorView({ onOpenTask }: MonitorViewProps) {
  const [activeTab, setActiveTab] = useState<MonitorTab>('dashboard');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 子标签栏 */}
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
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* 子面板内容 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeTab === 'dashboard' && (
          <Dashboard
            embedded
            onBack={() => {}}
            onOpenTask={onOpenTask}
          />
        )}
        {activeTab === 'opc' && <OPCView />}
        {activeTab === 'cloud' && <CloudConsoleView />}
      </div>
    </div>
  );
}