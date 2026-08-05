/** 輸入列：自動增高文字框、公司模式開關與組織模板選擇。 */
import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { COMPANY_TEMPLATES } from '../types';
import type { CompanyTemplate } from '../types';

export interface SendOptions {
  companyMode: boolean;
  companyTemplate: CompanyTemplate;
}

interface InputBarProps {
  disabled: boolean;
  onSend: (text: string, options: SendOptions) => void;
}

export default function InputBar({ disabled, onSend }: InputBarProps) {
  const [text, setText] = useState('');
  const [companyMode, setCompanyMode] = useState(false);
  const [companyTemplate, setCompanyTemplate] = useState<CompanyTemplate>('quick_task');
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
    onSend(trimmed, { companyMode, companyTemplate });
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
    <div className="border-t border-gray-800 bg-gray-900/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        {/* 公司模式控制列 */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCompanyMode((v) => !v)}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              companyMode
                ? 'bg-purple-600 text-white'
                : 'border border-gray-700 bg-gray-800 text-gray-300 hover:border-purple-500'
            }`}
            title="公司模式：由多代理人團隊分工處理複雜目標"
          >
            🏢 公司模式 {companyMode ? 'ON' : 'OFF'}
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
        </div>

        {/* 輸入列 */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              companyMode
                ? '描述一個複雜目標，交給公司團隊處理…'
                : '輸入你的問題…（Enter 發送，Shift+Enter 換行）'
            }
            rows={1}
            disabled={disabled}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className={`h-[44px] shrink-0 rounded-xl px-4 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500 ${
              companyMode ? 'bg-purple-600 hover:bg-purple-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {disabled ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent align-middle" />
            ) : (
              '發送'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
