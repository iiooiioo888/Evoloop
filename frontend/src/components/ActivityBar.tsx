/**
 * ActivityBar — 三層活動：對話 / 控制台 / 實驗室。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityKey } from '../lib/monitorTabs';

interface ActivityBarProps {
  activity: ActivityKey;
  onActivityChange: (activity: ActivityKey) => void;
}

const ITEMS: { key: ActivityKey; labelKey: string; icon: (active: boolean) => ReactNode }[] = [
  {
    key: 'chat',
    labelKey: 'nav.chat',
    icon: (active: boolean) => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M3 4.5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0115 4.5v6A1.5 1.5 0 0113.5 12H7l-3 2.5V4.5z"
          stroke="currentColor"
          strokeWidth="1.3"
          fill={active ? 'currentColor' : 'none'}
          fillOpacity={active ? 0.15 : 0}
        />
      </svg>
    ),
  },
  {
    key: 'console',
    labelKey: 'nav.console',
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <rect x="2" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 15h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'lab',
    labelKey: 'nav.lab',
    icon: () => (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M6 2.5h6M7.5 2.5v4.2L3.8 14.2A1.4 1.4 0 005 16h8a1.4 1.4 0 001.2-1.8L10.5 6.7V2.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M7.2 10.5h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function ActivityBar({ activity, onActivityChange }: ActivityBarProps) {
  const { t } = useTranslation();

  return (
    <nav className="flex w-11 shrink-0 flex-col items-center border-r border-white/[0.06] apple-chrome py-2" aria-label="主活動">
      {ITEMS.map((item) => {
        const active = activity === item.key;
        const label = t(item.labelKey);
        return (
          <button
            key={item.key}
            onClick={() => onActivityChange(item.key)}
            className={`mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-white/[0.08] text-[#F5F5F7]'
                : 'text-[#636366] hover:bg-white/[0.04] hover:text-[#AEAEB2]'
            }`}
            title={label}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon(active)}
          </button>
        );
      })}
    </nav>
  );
}
