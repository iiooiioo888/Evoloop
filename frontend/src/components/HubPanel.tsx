/**
 * HubPanel — AI Hub 統一面板（操作台 + 監控）。
 *
 * 合併原 ActivityBar「AI Hub」視圖與監控中心 Hub 分頁，避免兩套入口。
 */
import { useState } from 'react';
import HubMonitorPanel from './HubMonitorPanel';
import HubView from './HubView';

type HubMode = 'console' | 'monitor';

const MODES: { key: HubMode; icon: string; label: string }[] = [
  { key: 'console', icon: '🎛️', label: '操作台' },
  { key: 'monitor', icon: '📡', label: '監控' },
];

export default function HubPanel() {
  const [mode, setMode] = useState<HubMode>('console');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#010102]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[#23252a] bg-[#0f1011] px-3 py-2">
        <span className="mr-2 text-xs font-semibold text-[#828fff]">🛰️ AI Hub</span>
        {MODES.map((item) => {
          const active = mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
                active
                  ? 'border-[#5e6ad2]/50 bg-[#5e6ad2]/15 text-[#828fff]'
                  : 'border-[#23252a] text-[#8a8f98] hover:text-[#d0d6e0]'
              }`}
            >
              {item.icon} {item.label}
            </button>
          );
        })}
        <p className="ml-auto hidden text-[10px] text-[#62666d] sm:block">
          GPT-5.6 Sol · Gemini 3.1 Pro · 零 Claude
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === 'console' ? <HubView embedded /> : <HubMonitorPanel />}
      </div>
    </div>
  );
}
