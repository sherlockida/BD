/**
 * Aggregator — backward-compatible wrapper for PMO Synthesizer.
 *
 * @deprecated Use PMO Synthesizer (synthesize, formatReportAsMarkdown) from index.ts
 */
import type { OrchestratorPlan } from '../types';

/**
 * Legacy summarize — kept for backward compatibility.
 * @deprecated Use formatReportAsMarkdown(synthesize(...)) instead.
 */
export function summarize(plan: OrchestratorPlan): string {
  const ok = plan.subTasks.filter(t => t.status === 'success').length;
  const fb = plan.subTasks.filter(t => t.status === 'fallback').length;
  const fail = plan.subTasks.filter(t => t.status === 'failed').length;
  const total = plan.subTasks.length;

  const lines: string[] = [
    `📋 任务执行完成：${ok}/${total} 成功`,
  ];

  if (fb > 0) lines.push(`  · ${fb} 个任务通过降级 Agent 完成`);
  if (fail > 0) lines.push(`  · ${fail} 个任务最终失败，请人工介入`);

  const arts = plan.subTasks.filter(t => t.producedArtifactId);
  if (arts.length > 0) {
    lines.push(`📦 产出 ${arts.length} 个产物：`);
    arts.forEach(t => lines.push(`  · ${t.title} → ${t.producedArtifactId}`));
  }

  return lines.join('\n');
}
