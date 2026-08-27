/**
 * ActivityBar — Apple 風格活動欄（48px）。
 */
import { useTranslation } from 'react-i18next';
import type { ViewKey } from './AppShell';

interface ActivityBarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const ITEMS: { key: ViewKey; icon: string; labelKey: string }[] = [
  { key: 'chat', icon: '◉', labelKey: 'nav.chat' },
  { key: 'monitor', icon: '◎', labelKey: 'nav.monitor' },
  { key: 'traces', icon: '☰', labelKey: 'nav.traces' },
];

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center border-r border-white/[0.06] apple-chrome py-2">
      {ITEMS.map((item) => {
        const active = activeView === item.key;
        const label = t(item.labelKey);
        return (
          <button
            key={item.key}
            onClick={() => onViewChange(item.key)}
            className={`relative mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-[15px] transition-colors ${
              active ? 'bg-[#007AFF]/15 text-[#F5F5F7]' : 'text-[#636366] hover:bg-white/[0.04] hover:text-[#AEAEB2]'
            }`}
            title={label}
            aria-label={label}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#007AFF]" />
            )}
            {item.icon}
          </button>
        );
      })}
    </nav>
  );
}
