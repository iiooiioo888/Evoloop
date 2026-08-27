/**
 * TopBar — Apple 風格頂欄。
 */
import { useTranslation } from 'react-i18next';
import { setLocale } from '../i18n';
import type { ViewKey } from './AppShell';

interface TopBarProps {
  activeView: ViewKey;
  llmConfigured: boolean | null;
  rightPanelOpen: boolean;
  onRightPanelToggle: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}

export default function TopBar({
  activeView,
  llmConfigured,
  rightPanelOpen,
  onRightPanelToggle,
  onOpenSettings,
  onToggleSidebar,
}: TopBarProps) {
  const { t, i18n } = useTranslation();
  const viewLabel =
    activeView === 'chat'
      ? t('nav.chat')
      : activeView === 'monitor'
        ? t('nav.monitor')
        : t('nav.traces');

  return (
    <header className="flex h-10 shrink-0 items-center border-b border-white/[0.06] apple-chrome px-3">
      <button
        onClick={onToggleSidebar}
        className="mr-1 rounded-lg px-2 py-1 text-[#8E8E93] hover:bg-white/[0.06] hover:text-[#F5F5F7] md:hidden"
        aria-label="切換側邊欄"
      >
        ☰
      </button>

      <span className="mr-2 text-[13px] font-bold tracking-tight text-[#F5F5F7]">EvoLoop</span>
      <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[#AEAEB2]">
        {viewLabel}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px]"
          style={{
            color:
              llmConfigured === null ? '#8E8E93' : llmConfigured ? '#34C759' : '#FF9500',
            background:
              llmConfigured === null
                ? 'rgba(255,255,255,0.04)'
                : llmConfigured
                  ? 'rgba(52,199,89,0.12)'
                  : 'rgba(255,149,0,0.12)',
          }}
        >
          <span
            className={
              llmConfigured
                ? 'apple-dot apple-dot--ok'
                : llmConfigured === false
                  ? 'apple-dot apple-dot--warn'
                  : 'apple-dot'
            }
            style={llmConfigured === null ? { background: '#8E8E93' } : undefined}
          />
          {llmConfigured === null ? '—' : llmConfigured ? '已連線' : '未配置'}
        </span>

        <button
          type="button"
          onClick={() => setLocale(i18n.language === 'en' ? 'zh-TW' : 'en')}
          className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] font-bold text-[#AEAEB2] hover:text-[#F5F5F7]"
          title="Language"
        >
          {i18n.language === 'en' ? 'EN' : '繁'}
        </button>

        <button
          onClick={onRightPanelToggle}
          className={`rounded-lg px-2 py-1 text-[12px] ${
            rightPanelOpen ? 'text-[#007AFF]' : 'text-[#8E8E93] hover:text-[#F5F5F7]'
          }`}
          title="OPC 面板"
        >
          OPC
        </button>
        <button
          onClick={onOpenSettings}
          className="rounded-lg px-2 py-1 text-[12px] text-[#8E8E93] hover:text-[#F5F5F7]"
          title="設定"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
