/**
 * 實驗室子分頁 — Firecrawl / Prompt Optimizer / Archify / Ponytail 等。
 */
export type LabSubTab = 'prompt' | 'firecrawl' | 'archify' | 'ponytail' | 'mcp' | 'ab';

export type LabTabItem = {
  key: LabSubTab;
  label: string;
  /** 上游專案 */
  upstream?: { name: string; url: string };
};

/** 四大整合工具（使用者指定）。 */
export const LAB_INTEGRATION_TABS: LabTabItem[] = [
  {
    key: 'prompt',
    label: '提示詞',
    upstream: { name: 'prompt-optimizer', url: 'https://github.com/linshenkx/prompt-optimizer' },
  },
  {
    key: 'firecrawl',
    label: '爬蟲',
    upstream: { name: 'firecrawl', url: 'https://github.com/firecrawl/firecrawl' },
  },
  {
    key: 'archify',
    label: '架構',
    upstream: { name: 'archify', url: 'https://github.com/tt-a1i/archify' },
  },
  {
    key: 'ponytail',
    label: '精簡',
    upstream: { name: 'ponytail', url: 'https://github.com/DietrichGebert/ponytail' },
  },
];

export const LAB_EXTRA_TABS: LabTabItem[] = [
  { key: 'mcp', label: 'MCP' },
  { key: 'ab', label: 'A/B' },
];

export const LAB_TABS: LabTabItem[] = [...LAB_INTEGRATION_TABS, ...LAB_EXTRA_TABS];

export function normalizeLabSubTab(tab: string | null | undefined): LabSubTab {
  if (tab && LAB_TABS.some((t) => t.key === tab)) return tab as LabSubTab;
  return 'prompt';
}

export function labSubTabLabel(tab: LabSubTab): string {
  return LAB_TABS.find((item) => item.key === tab)?.label ?? tab;
}
