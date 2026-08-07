/**
 * StatusBar — IDE 风格底部状态栏。
 *
 * 显示 LLM 连接状态、活跃任务数、记忆库条目数。
 */
interface StatusBarProps {
  llmConfigured: boolean | null;
  taskCount: number;
  memoryCount: number;
}

export default function StatusBar({ llmConfigured, taskCount, memoryCount }: StatusBarProps) {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-gray-800 bg-blue-600/10 px-3 text-[11px] text-gray-500">
      <div className="flex items-center gap-4">
        {/* LLM 状态 */}
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              llmConfigured === null
                ? 'bg-gray-500'
                : llmConfigured
                  ? 'bg-green-400'
                  : 'bg-yellow-400'
            }`}
          />
          {llmConfigured === null ? 'LLM 未知' : llmConfigured ? 'LLM 已连接' : 'LLM 未配置'}
        </span>

        {/* 任务数 */}
        <span className="flex items-center gap-1">
          <span className="text-gray-600">任务:</span>
          <span className="text-gray-400">{taskCount}</span>
        </span>

        {/* 记忆数 */}
        <span className="flex items-center gap-1">
          <span className="text-gray-600">记忆:</span>
          <span className="text-gray-400">{memoryCount}</span>
        </span>
      </div>

      <span className="text-gray-600">EvoLoop v1.0</span>
    </footer>
  );
}