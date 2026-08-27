/**
 * 實驗室面板：DSPy 對比 · MCP 工具 · A/B 評估儀表板。
 */
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PromptEditor from './PromptEditor';
import ErrorState from './ui/ErrorState';

type LabTab = 'dspy' | 'mcp' | 'ab';

const DEMO_BEFORE = `你是一位工業助手。根據感測資料回答問題。
請盡量詳細說明。`;

const DEMO_AFTER = `你是 EvoLoop OPC 診斷助手。
規則：
1. 僅引用白名單標籤
2. 先給結論，再列證據
3. 數值附單位與時間戳
輸出格式：結論 / 證據 / 建議動作`;

const MCP_TOOLS = [
  { id: 'opc.read', name: 'OPC Read', desc: '讀取白名單標籤', enabled: true, risk: 'low' },
  { id: 'opc.write', name: 'OPC Write', desc: '經護欄寫入', enabled: true, risk: 'high' },
  { id: 'memory.search', name: 'Memory Search', desc: '向量記憶檢索', enabled: true, risk: 'low' },
  { id: 'docker.inspect', name: 'Docker Inspect', desc: '容器狀態查詢', enabled: false, risk: 'mid' },
  { id: 'trace.export', name: 'Trace Export', desc: '匯出執行軌跡', enabled: true, risk: 'low' },
];

const AB_SERIES = [
  { name: '準確', a: 7.2, b: 8.6 },
  { name: '完整', a: 6.8, b: 8.1 },
  { name: '清晰', a: 7.5, b: 8.4 },
  { name: '相關', a: 7.0, b: 8.9 },
  { name: '延遲↓', a: 4.2, b: 6.8 },
];

export default function LabPanel() {
  const [tab, setTab] = useState<LabTab>('dspy');
  const [tools, setTools] = useState(MCP_TOOLS);
  const [before, setBefore] = useState(DEMO_BEFORE);
  const [after, setAfter] = useState(DEMO_AFTER);

  const winner = useMemo(() => {
    const scoreA = AB_SERIES.reduce((s, r) => s + r.a, 0) / AB_SERIES.length;
    const scoreB = AB_SERIES.reduce((s, r) => s + r.b, 0) / AB_SERIES.length;
    return { scoreA, scoreB, better: scoreB >= scoreA ? 'B' : 'A' };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden apple-canvas">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-6 py-3">
        {(
          [
            ['dspy', 'DSPy 優化'],
            ['mcp', 'MCP 工具'],
            ['ab', 'A/B 評估'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
              tab === key
                ? 'bg-[#007AFF] text-white'
                : 'bg-white/[0.04] text-[#AEAEB2] hover:text-[#F5F5F7]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
        {tab === 'dspy' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="apple-card">
              <div className="apple-card__head">
                <h2 className="apple-title">優化前</h2>
              </div>
              <div className="apple-card__body apple-card__body--static !pt-0">
                <PromptEditor value={before} onChange={setBefore} height={260} />
              </div>
            </section>
            <section className="apple-card">
              <div className="apple-card__head">
                <h2 className="apple-title">優化後</h2>
                <span className="text-[10px] font-bold text-[#34C759]">DSPy</span>
              </div>
              <div className="apple-card__body apple-card__body--static !pt-0">
                <PromptEditor value={after} onChange={setAfter} height={260} />
              </div>
            </section>
            <div className="lg:col-span-2">
              <ErrorState
                kind="partial"
                compact
                message="目前為前端預覽對照。接上 DSPy 優化 API 後，會以真實 before/after 取代示範稿。"
              />
            </div>
          </div>
        )}

        {tab === 'mcp' && (
          <div className="mx-auto max-w-2xl space-y-3">
            {tools.map((t) => (
              <label
                key={t.id}
                className="apple-card apple-card--tight flex cursor-pointer items-center gap-4 px-4 py-3"
              >
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={() =>
                    setTools((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)),
                    )
                  }
                  className="h-4 w-4 accent-[#007AFF]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#F5F5F7]">{t.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#8E8E93]">{t.desc}</p>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    color:
                      t.risk === 'high' ? '#FF3B30' : t.risk === 'mid' ? '#FF9500' : '#34C759',
                    background:
                      t.risk === 'high'
                        ? 'rgba(255,59,48,0.12)'
                        : t.risk === 'mid'
                          ? 'rgba(255,149,0,0.12)'
                          : 'rgba(52,199,89,0.12)',
                  }}
                >
                  {t.risk}
                </span>
              </label>
            ))}
          </div>
        )}

        {tab === 'ab' && (
          <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
            <section className="apple-card">
              <div className="apple-card__head">
                <h2 className="apple-title">記憶蒸餾 · 評分對照</h2>
              </div>
              <div className="apple-card__body apple-card__body--static apple-chart h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={AB_SERIES} barGap={6} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#AEAEB2', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#636366', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{
                        background: '#2C2C2E',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="a" name="對照組 A" fill="rgba(142,142,147,0.55)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="b" name="實驗組 B" fill="#007AFF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="apple-card apple-card--pad flex flex-col justify-center gap-4">
              <div>
                <p className="apple-title">勝出</p>
                <p className="mt-2 text-[28px] font-bold text-[#007AFF]">變體 {winner.better}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#8E8E93]">A 均分</p>
                <p className="apple-data text-[18px]">{winner.scoreA.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#8E8E93]">B 均分</p>
                <p className="apple-data text-[18px] text-[#34C759]">{winner.scoreB.toFixed(2)}</p>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
