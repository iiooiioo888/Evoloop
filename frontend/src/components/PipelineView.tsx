/**
 * 管線視圖：DAG + 反思雷達／趨勢。
 */
import { useMemo } from 'react';
import { buildAnimLiveFeed } from '../lib/animLive';
import { useMonitorStore } from '../stores/monitorStore';
import type { MultiDimEvaluation } from '../types';
import PipelineDag from './PipelineDag';
import { IterationTrend, ReflectionRadar } from './ReflectionCharts';

interface PipelineViewProps {
  onGoTasks?: () => void;
}

export default function PipelineView({ onGoTasks }: PipelineViewProps) {
  const agents = useMonitorStore((s) => s.agents);
  const optimization = useMonitorStore((s) => s.optimization);
  const billing = useMonitorStore((s) => s.billing);
  const llmOps = useMonitorStore((s) => s.llmOps);

  const feed = useMemo(
    () =>
      buildAnimLiveFeed({
        agents,
        optimization,
        billing,
        llmOps,
      }),
    [agents, optimization, billing, llmOps],
  );

  const phase = feed.streamPhase || feed.taskPhase;
  const multiDim: MultiDimEvaluation | null = useMemo(() => {
    const dims = optimization?.reflection;
    if (!dims) return null;
    // 無即時多維時用門檻示意
    const base = Number(dims.pass_threshold ?? 8);
    return {
      accuracy: { score: base - 0.4, reason: '' },
      completeness: { score: base - 0.6, reason: '' },
      clarity: { score: base - 0.2, reason: '' },
      relevance: { score: base, reason: '' },
      overall: base - 0.3,
      source: 'rule_fallback',
    };
  }, [optimization]);

  const history = useMemo(() => {
    const max = Number(optimization?.reflection?.max_iterations ?? 3);
    return Array.from({ length: max + 1 }, (_, i) => ({
      iteration: i,
      score: Math.min(10, 5.5 + i * 1.1 + (i === max ? 0.4 : 0)),
    }));
  }, [optimization]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden apple-canvas">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-3">
        <p className="apple-heading text-[15px]">管線</p>
        <button
          type="button"
          onClick={() => onGoTasks?.()}
          className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-[#AEAEB2] hover:text-[#F5F5F7]"
        >
          任務監控 →
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 sm:p-8">
        <PipelineDag phase={phase} height={300} />
        <div className="grid gap-5 lg:grid-cols-2">
          <ReflectionRadar multiDim={multiDim} />
          <IterationTrend history={history} />
        </div>
      </div>
    </div>
  );
}
