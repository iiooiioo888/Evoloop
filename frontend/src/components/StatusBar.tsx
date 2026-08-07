/**
 * StatusBar — IDE 风格底部状态栏。
 *
 * 全局显示 LLM 连接状态、Docker 容器健康、预算压力、活跃任务数、记忆库条目数。
 * Docker 容器状态与预算通过定时轮询获取，跨视图始终可见。
 */
import { useEffect, useState } from 'react';
import { fetchDockerBudget, fetchDockerStatus } from '../api/client';
import type { DockerBudget, DockerStatus } from '../types';

interface StatusBarProps {
  llmConfigured: boolean | null;
  taskCount: number;
  memoryCount: number;
}

function formatCost(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export default function StatusBar({ llmConfigured, taskCount, memoryCount }: StatusBarProps) {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [dockerBudget, setDockerBudget] = useState<DockerBudget | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [status, budget] = await Promise.all([
          fetchDockerStatus(),
          fetchDockerBudget(),
        ]);
        if (!cancelled) {
          setDockerStatus(status);
          setDockerBudget(budget);
        }
      } catch {
        if (!cancelled) {
          setDockerStatus(null);
          setDockerBudget(null);
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Docker 健康统计
  const dockerHealthy = dockerStatus?.health?.all_healthy
    ? Object.values(dockerStatus.health.services).filter((s) => s.healthy).length
    : 0;
  const dockerTotal = dockerStatus?.health?.services
    ? Object.keys(dockerStatus.health.services).length
    : 0;

  // 预算压力
  const pressure = dockerBudget?.company_budget?.budget_pressure ?? 0;
  const totalCost = dockerBudget?.total_docker_cost ?? 0;
  const budgetState = dockerBudget?.company_budget;
  const hasAutoOptimized = (budgetState?.auto_optimized?.stopped?.length ?? 0) > 0;

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

        {/* Docker 容器状态 */}
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              dockerStatus === null
                ? 'bg-gray-500'
                : dockerStatus.available && dockerStatus.health?.all_healthy
                  ? 'bg-green-400'
                  : dockerStatus.available
                    ? 'bg-yellow-400'
                    : 'bg-red-400'
            }`}
          />
          {dockerStatus === null
            ? 'Docker 未知'
            : !dockerStatus.available
              ? 'Docker 不可用'
              : `Docker ${dockerHealthy}/${dockerTotal} 健康`}
        </span>

        {/* 预算状态 */}
        {dockerBudget?.available && (
          <span
            className="flex items-center gap-1.5"
            title={
              budgetState
                ? `LLM + Docker 总计: ${formatCost(budgetState.total_spent)}
优化建议: ${budgetState.optimization_suggestions?.length ?? 0} 条
自动停止: ${budgetState.auto_optimized?.stopped?.join(', ') || '无'}`
                : ''
            }
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                pressure >= 0.9 ? 'bg-red-400' : pressure >= 0.7 ? 'bg-yellow-400' : 'bg-green-400'
              }`}
            />
            <span
              className={
                pressure >= 0.9 ? 'text-red-400' : pressure >= 0.7 ? 'text-yellow-400' : 'text-gray-400'
              }
            >
              预算 {formatCost(totalCost)}
              {pressure >= 0.5 && ` (${Math.round(pressure * 100)}%)`}
              {hasAutoOptimized && ' ⚡'}
            </span>
          </span>
        )}

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