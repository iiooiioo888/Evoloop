/** 輸入列：自動增高文字框、公司模式開關、組織模板選擇與進階控制選項。 */
import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { COMPANY_TEMPLATES } from '../types';
import type { CompanyTemplate, TaskOptions } from '../types';

export interface SendOptions {
  companyMode: boolean;
  companyTemplate: CompanyTemplate;
  opcMode: boolean;
  /** 進階控制選項 */
  taskOptions?: TaskOptions;
}

interface InputBarProps {
  disabled: boolean;
  onSend: (text: string, options: SendOptions) => void;
}

export default function InputBar({ disabled, onSend }: InputBarProps) {
  const [text, setText] = useState('');
  const [companyMode, setCompanyMode] = useState(false);
  const [opcMode, setOpcMode] = useState(false);
  const [companyTemplate, setCompanyTemplate] = useState<CompanyTemplate>('quick_task');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // 進階控制選項
  const [budgetLimit, setBudgetLimit] = useState('');
  const [maxParallel, setMaxParallel] = useState('');
  const [maxIterations, setMaxIterations] = useState('');
  const [maxReviewRounds, setMaxReviewRounds] = useState('');
  const [passThreshold, setPassThreshold] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    // 組裝進階選項（僅填入有值的欄位）
    const taskOptions: TaskOptions = {};
    if (budgetLimit) taskOptions.budget_limit = parseFloat(budgetLimit);
    if (maxParallel) taskOptions.max_parallel = parseInt(maxParallel, 10);
    if (maxIterations) taskOptions.max_iterations = parseInt(maxIterations, 10);
    if (maxReviewRounds) taskOptions.max_review_rounds = parseInt(maxReviewRounds, 10);
    if (passThreshold) taskOptions.pass_threshold = parseFloat(passThreshold);
    onSend(trimmed, { companyMode, companyTemplate, opcMode, taskOptions });
    setText('');
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-800/60 bg-gray-900/60 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto max-w-3xl">
        {/* 公司模式控制列 */}
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setOpcMode((v) => !v);
              if (!opcMode) setCompanyMode(false);
            }}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50 ${
              opcMode
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white shadow-md shadow-cyan-900/30 ring-1 ring-cyan-400/30'
                : 'border border-gray-700/80 bg-gray-800/80 text-gray-400 hover:border-cyan-500/50 hover:text-cyan-300'
            }`}
            title="OPC 模式：6 級工業閉環（感知→預處理→分析→診斷→決策→執行）"
          >
            🏭 OPC 模式
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${opcMode ? 'bg-white/20' : 'bg-gray-700/60'}`}>
              {opcMode ? 'ON' : 'OFF'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCompanyMode((v) => !v);
              if (!companyMode) setOpcMode(false);
            }}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50 ${
              companyMode
                ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-md shadow-purple-900/30 ring-1 ring-purple-400/30'
                : 'border border-gray-700/80 bg-gray-800/80 text-gray-400 hover:border-purple-500/50 hover:text-purple-300'
            }`}
            title="公司模式：由多代理人團隊分工處理複雜目標"
          >
            🏢 公司模式
            <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] ${companyMode ? 'bg-white/20' : 'bg-gray-700/60'}`}>
              {companyMode ? 'ON' : 'OFF'}
            </span>
          </button>

          {companyMode && (
            <select
              value={companyTemplate}
              onChange={(e) => setCompanyTemplate(e.target.value as CompanyTemplate)}
              disabled={disabled}
              className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-xs text-gray-200 focus:border-purple-500 focus:outline-none disabled:opacity-50"
              title="選擇公司組織模板"
            >
              {COMPANY_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}

          {/* 進階選項開關 */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            disabled={disabled}
            className={`ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
              showAdvanced
                ? 'border-[#5e6ad2]/60 bg-[#5e6ad2]/10 text-[#828fff]'
                : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
            }`}
            title="進階控制選項：預算、並行數、迭代上限等"
          >
            ⚙️ 進階 {showAdvanced ? '▲' : '▼'}
          </button>
        </div>

        {/* 進階控制選項面板 */}
        {showAdvanced && (
          <div className="mb-2 rounded-lg border border-[#23252a] bg-[#0f1011] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[#62666d]">
              進階控制選項
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-0.5 block text-[10px] text-[#8a8f98]">預算上限 ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="預設"
                  disabled={disabled}
                  className="w-full rounded-md border border-[#23252a] bg-[#010102] px-2 py-1.5 text-xs text-[#f7f8f8] placeholder-[#3e3e44] focus:border-[#5e6ad2] focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[#8a8f98]">並行工作數</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxParallel}
                  onChange={(e) => setMaxParallel(e.target.value)}
                  placeholder="預設"
                  disabled={disabled}
                  className="w-full rounded-md border border-[#23252a] bg-[#010102] px-2 py-1.5 text-xs text-[#f7f8f8] placeholder-[#3e3e44] focus:border-[#5e6ad2] focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[#8a8f98]">最大迭代</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(e.target.value)}
                  placeholder="預設"
                  disabled={disabled}
                  className="w-full rounded-md border border-[#23252a] bg-[#010102] px-2 py-1.5 text-xs text-[#f7f8f8] placeholder-[#3e3e44] focus:border-[#5e6ad2] focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[#8a8f98]">審查輪數</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={maxReviewRounds}
                  onChange={(e) => setMaxReviewRounds(e.target.value)}
                  placeholder="預設"
                  disabled={disabled}
                  className="w-full rounded-md border border-[#23252a] bg-[#010102] px-2 py-1.5 text-xs text-[#f7f8f8] placeholder-[#3e3e44] focus:border-[#5e6ad2] focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[#8a8f98]">通過門檻</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(e.target.value)}
                  placeholder="預設"
                  disabled={disabled}
                  className="w-full rounded-md border border-[#23252a] bg-[#010102] px-2 py-1.5 text-xs text-[#f7f8f8] placeholder-[#3e3e44] focus:border-[#5e6ad2] focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        )}

        {/* 輸入列 */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2.5">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                opcMode
                  ? '描述工業製程檢查需求…（如：檢查製程狀態）'
                  : companyMode
                    ? '描述一個複雜目標，交給公司團隊處理…'
                    : '輸入你的問題…（Enter 發送，Shift+Enter 換行）'
              }
              rows={1}
              disabled={disabled}
              className={`max-h-40 min-h-[46px] w-full resize-none rounded-xl border bg-gray-800/80 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 shadow-inner transition-all duration-200 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                opcMode
                  ? 'border-gray-700/80 focus:border-cyan-500/60 focus:ring-cyan-500/20'
                  : companyMode
                    ? 'border-gray-700/80 focus:border-purple-500/60 focus:ring-purple-500/20'
                    : 'border-gray-700/80 focus:border-blue-500/60 focus:ring-blue-500/20'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className={`flex h-[46px] shrink-0 items-center gap-1.5 rounded-xl px-5 text-sm font-medium text-white shadow-md transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-700/60 disabled:text-gray-500 disabled:shadow-none ${
              opcMode
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 shadow-cyan-900/30 hover:from-cyan-500 hover:to-cyan-400'
                : companyMode
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-purple-900/30 hover:from-purple-500 hover:to-purple-400'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-blue-900/30 hover:from-blue-500 hover:to-blue-400'
            }`}
          >
            {disabled ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent align-middle" />
            ) : (
              <>
                <span>發送</span>
                <span className="text-xs opacity-80">➤</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
