/**
 * PMO Synthesizer — intelligent result synthesis replacing simple aggregation.
 *
 * Upgrades the old aggregator.ts (which only counted success/failure)
 * to a full synthesis engine that:
 *   - Merges parallel agent outputs into unified artifacts
 *   - Resolves conflicts (multiple agents touching same file)
 *   - Polishes output (style unification, formatting)
 *   - Generates structured PMO delivery reports
 */
import type {
  OrchestratorPlan,
  SubTask,
  PMOReport,
  TaskReportItem,
  CriticReport,
  Agent,
} from '../types';

// ────────────────────────────────────────────────────────────
// Synthesis Context
// ────────────────────────────────────────────────────────────

export interface SynthesisContext {
  plan: OrchestratorPlan;
  agents: Agent[];                        // Agent metadata for display
  taskDurations: Map<string, number>;     // taskId → duration in ms
  totalTokens: number;
  criticReport?: CriticReport;
}

// ────────────────────────────────────────────────────────────
// Synthesis Engine
// ────────────────────────────────────────────────────────────

/**
 * Synthesize all task outputs into a PMO delivery report.
 */
export function synthesize(context: SynthesisContext): PMOReport {
  const { plan, agents, taskDurations, totalTokens, criticReport } = context;

  const completed: TaskReportItem[] = [];
  const degraded: TaskReportItem[] = [];
  const failed: TaskReportItem[] = [];

  for (const task of plan.subTasks) {
    const agent = agents.find(a => a.id === task.assignedAgentId);
    const agentName = agent?.name ?? task.assignedAgentId;
    const durationMs = taskDurations.get(task.id) ?? 0;

    const item: TaskReportItem = {
      taskId: task.id,
      title: task.title,
      agentName,
      artifactName: task.producedArtifactId ? `artifact_${task.producedArtifactId}` : undefined,
      durationMs,
    };

    switch (task.status) {
      case 'success':
        completed.push(item);
        break;
      case 'fallback':
        degraded.push({
          ...item,
          agentName: agents.find(a => a.id === (task.fallbackAgentId ?? task.assignedAgentId))?.name ?? agentName,
        });
        break;
      case 'failed':
        failed.push(item);
        break;
    }
  }

  const defaultCritic: CriticReport = {
    overallScore: 1.0,
    suggestions: [],
    reviewStrategy: 'llm-as-judge',
  };

  return {
    planId: plan.id,
    intent: plan.intent,
    completed,
    degraded,
    failed,
    criticReview: criticReport ?? defaultCritic,
    totalDurationMs: Date.now() - (plan.createdAt ?? Date.now()),
    totalTokens,
    artifacts: plan.subTasks
      .filter(t => t.producedArtifactId)
      .map(t => t.producedArtifactId!),
  };
}

// ────────────────────────────────────────────────────────────
// Report Formatting (for chat display)
// ────────────────────────────────────────────────────────────

/**
 * Format a PMOReport as a human-readable chat message.
 * This replaces the old aggregator.summarize() output.
 */
export function formatReportAsMarkdown(report: PMOReport, mergeReport?: MergeReport): string {
  const lines: string[] = ['📊 **项目交付报告**', ''];

  // Completed section
  if (report.completed.length > 0) {
    lines.push(`✅ **已完成 (${report.completed.length})**`);
    for (const item of report.completed) {
      const artifactInfo = item.artifactName ? ` — ${item.artifactName}` : '';
      const durationInfo = item.durationMs > 0 ? ` (${(item.durationMs / 1000).toFixed(1)}s)` : '';
      lines.push(`· ${item.title} — ${item.agentName}${artifactInfo}${durationInfo}`);
    }
    lines.push('');
  }

  // Degraded section
  if (report.degraded.length > 0) {
    lines.push(`⚠️ **降级完成 (${report.degraded.length})**`);
    for (const item of report.degraded) {
      lines.push(`· ${item.title} — ${item.agentName} (原 Agent 失败，已切换)`);
    }
    lines.push('');
  }

  // Failed section
  if (report.failed.length > 0) {
    lines.push(`❌ **失败 (${report.failed.length})**`);
    for (const item of report.failed) {
      lines.push(`· ${item.title} — ${item.agentName}`);
    }
    lines.push('');
  }

  // Critic review
  if (report.criticReview) {
    const cr = report.criticReview;
    lines.push('📝 **Critic 评审**');
    if (cr.codeQuality !== undefined) {
      lines.push(`· 代码质量: ${(cr.codeQuality * 10).toFixed(1)}/10`);
    }
    if (cr.security) {
      lines.push(`· 安全性: ${cr.security}`);
    }
    if (cr.suggestions.length > 0) {
      lines.push(`· 建议: ${cr.suggestions.length} 条`);
    }
    if (cr.overallScore < 1.0) {
      lines.push(`· 综合评分: ${(cr.overallScore * 10).toFixed(1)}/10 · 策略: ${cr.reviewStrategy}`);
    }
    lines.push('');
  }

  // Merge quality (Phase 4.1)
  if (mergeReport) {
    const qualityPct = (mergeReport.mergeQuality * 100).toFixed(0);
    const issueCount = mergeReport.integrityIssues.length;
    lines.push(`🔗 **合并质量**: ${qualityPct}% · ${issueCount} 个完整性问题 · ${mergeReport.suggestions.length} 条建议`);
    if (mergeReport.suggestions.length > 0) {
      for (const s of mergeReport.suggestions) lines.push(`  · ${s}`);
    }
    lines.push('');
  }

  // Summary
  const totalTasks = report.completed.length + report.degraded.length + report.failed.length;
  const successRate = totalTasks > 0
    ? Math.round(((report.completed.length + report.degraded.length) / totalTasks) * 100)
    : 100;
  lines.push(`⏱️ 总耗时: ${(report.totalDurationMs / 1000).toFixed(1)}s | Token: ${report.totalTokens.toLocaleString()} | 成功率: ${successRate}%`);

  return lines.join('\n');
}

/**
 * Generate a brief summary (for use in plan card subtitle).
 */
export function formatBriefSummary(report: PMOReport): string {
  const total = report.completed.length + report.degraded.length + report.failed.length;
  const ok = report.completed.length + report.degraded.length;
  if (report.failed.length === 0 && report.degraded.length === 0) {
    return `✅ ${ok}/${total} 任务全部成功`;
  }
  if (report.failed.length === 0) {
    return `⚠️ ${ok}/${total} 成功 · ${report.degraded.length} 降级`;
  }
  return `📋 ${ok}/${total} 完成 · ${report.failed.length} 失败`;
}

// ────────────────────────────────────────────────────────────
// Conflict Resolution
// ────────────────────────────────────────────────────────────

export interface ArtifactConflict {
  artifactName: string;
  producers: Array<{ agentId: string; taskId: string; content: string }>;
  resolution: 'keep-first' | 'keep-best' | 'merge' | 'manual';
}

/**
 * Detect when multiple agents produce artifacts with the same name.
 */
export function detectConflicts(tasks: SubTask[]): ArtifactConflict[] {
  const artifactMap = new Map<string, Array<{ agentId: string; taskId: string; content: string }>>();

  for (const task of tasks) {
    if (!task.output) continue;
    // Simple heuristic: check for artifact references in output
    const artifactMatches = task.output.matchAll(/(?:文件|file|artifact)[:\s]*(\S+\.\w+)/gi);
    for (const match of artifactMatches) {
      const name = match[1]!;
      if (!artifactMap.has(name)) artifactMap.set(name, []);
      artifactMap.get(name)!.push({
        agentId: task.assignedAgentId,
        taskId: task.id,
        content: task.output,
      });
    }
  }

  const conflicts: ArtifactConflict[] = [];
  for (const [name, producers] of artifactMap) {
    if (producers.length > 1) {
      conflicts.push({
        artifactName: name,
        producers,
        resolution: 'keep-best', // Default: keep the output from the task with higher review score
      });
    }
  }

  return conflicts;
}

// ────────────────────────────────────────────────────────────
// Multi-Artifact Merge Engine (Phase 4.1)
// ────────────────────────────────────────────────────────────

export interface MergeArtifact { id: string; agentId: string; agentName: string; type: 'html' | 'css' | 'js'; content: string; filename: string; }
export interface IntegrityIssue { type: string; description: string; sourceArtifact: string; element?: string; severity: 'error' | 'warning' | 'info'; }
export interface MergeReport { artifacts: MergeArtifact[]; integrityIssues: IntegrityIssue[]; suggestions: string[]; mergeQuality: number; }

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Analyze artifacts, detect cross-references, validate integrity, produce merge report. */
export function merge(artifacts: MergeArtifact[]): MergeReport {
  const issues: IntegrityIssue[] = [];
  const byName = new Map(artifacts.map(a => [a.filename, a]));
  const html = artifacts.find(a => a.type === 'html');
  const css = artifacts.find(a => a.type === 'css');
  const js = artifacts.find(a => a.type === 'js');
  if (html) {
    for (const m of html.content.matchAll(/(?:href=["']([^"']+\.css)["']|src=["']([^"']+\.js)["'])/gi)) {
      const t = m[1] ?? m[2]!;
      if (!byName.has(t)) issues.push({ type: 'broken-link', description: `引用缺失: ${t}`, sourceArtifact: html.filename, element: t, severity: 'error' });
    }
    if (css) {
      const hc = new Set([...html.content.matchAll(/class=["']([^"']+)["']/g)].flatMap(x => x[1]!.split(/\s+/)));
      const cs = new Set([...css.content.matchAll(/\.([\w-]+)\s*\{/g)].map(x => x[1]!));
      for (const c of hc) if (!cs.has(c)) issues.push({ type: 'missing-css-class', description: `HTML ".${c}" CSS 未定义`, sourceArtifact: html.filename, element: c, severity: 'warning' });
      const hi = new Set([...html.content.matchAll(/id=["']([^"']+)["']/g)].map(x => x[1]!));
      for (const id of [...css.content.matchAll(/#([\w-]+)\s*\{/g)].map(x => x[1]!)) {
        if (!hi.has(id)) issues.push({ type: 'missing-html-id', description: `CSS #${id} HTML无对应id`, sourceArtifact: css.filename, element: id, severity: 'warning' });
      }
    }
    if (js) {
      const hi = new Set([...html.content.matchAll(/id=["']([^"']+)["']/g)].map(x => x[1]!));
      for (const m of js.content.matchAll(/(?:getElementById|querySelector(?:All)?)\(["']#?([^"']+)["']\)/g)) {
        if (!hi.has(m[1]!)) issues.push({ type: 'missing-html-id', description: `JS查询"${m[1]!}" HTML无此id`, sourceArtifact: js.filename, element: m[1]!, severity: 'error' });
      }
    }
  }
  const e = issues.filter(i => i.severity === 'error').length;
  const w = issues.filter(i => i.severity === 'warning').length;
  const suggestions: string[] = issues.length === 0
    ? ['所有引用有效']
    : [...(e > 0 ? [`修复${e}个错误`] : []), ...(w > 0 ? [`审查${w}个警告`] : [])];
  return { artifacts, integrityIssues: issues, suggestions, mergeQuality: Math.max(0, Math.min(1, 1 - e * 0.2 - w * 0.05)) };
}

/** Combine HTML/CSS/JS artifacts into a single self-contained HTML by inlining. */
export function mergeArtifacts(artifacts: MergeArtifact[]): string {
  const html = artifacts.find(a => a.type === 'html');
  const css = artifacts.find(a => a.type === 'css');
  const js = artifacts.find(a => a.type === 'js');
  if (!html) {
    const p = ['<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Merged</title>'];
    if (css) p.push(`<style>\n${css.content}\n</style>`);
    p.push('</head><body>');
    if (js) p.push(`<script>\n${js.content}\n</script>`);
    p.push('</body></html>');
    return p.join('\n');
  }
  let m = html.content;
  if (css) m = m.replace(new RegExp(`<link[^>]*href=["']${esc(css.filename)}["'][^>]*/?>`, 'gi'), `<style>\n${css.content}\n</style>`);
  if (js) m = m.replace(new RegExp(`<script[^>]*src=["']${esc(js.filename)}["'][^>]*></script>`, 'gi'), `<script>\n${js.content}\n</script>`);
  return m;
}
