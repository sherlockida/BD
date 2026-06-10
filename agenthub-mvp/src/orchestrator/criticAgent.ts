/**
 * Critic Agent — quality review for agent outputs.
 *
 * Evaluates artifacts against acceptance criteria using the appropriate
 * review strategy based on task type (research shows different strategies
 * work better for different task types — ACL 2025).
 *
 * Review strategies:
 *   - majority-vote: Best for reasoning/creative tasks (+13.2% accuracy)
 *   - consensus: Best for factual/knowledge tasks (+2.8% accuracy)
 *   - llm-as-judge: Best for code generation (Anthropic-verified)
 *   - human-confirmation: Best for critical decisions
 */
import type {
  ReviewVerdict,
  ReviewStrategy,
  CriticReport,
  SubTask,
  ArtifactType,
} from '../types';
import { recordTrace } from './trace';

// ────────────────────────────────────────────────────────────
// Review Result Types
// ────────────────────────────────────────────────────────────

export interface ReviewResult {
  taskId: string;
  verdict: ReviewVerdict;
  score: number;              // 0-1
  dimensions: ReviewDimensions;
  feedback: string;
  suggestedRevision?: string;
  strategy: ReviewStrategy;
}

export interface ReviewDimensions {
  completeness: number;       // 0-1: does it meet acceptance criteria?
  codeQuality: number;        // 0-1: lintable? standards-compliant?
  security: number;           // 0-1: no XSS/injection/secret leaks
  usability: number;          // 0-1: mobile-friendly? accessible?
}

// ────────────────────────────────────────────────────────────
// Strategy Selection
// ────────────────────────────────────────────────────────────

/**
 * Select review strategy based on task type.
 * Based on ACL 2025 and Anthropic research findings.
 */
export function selectReviewStrategy(
  task: SubTask,
  artifactType?: ArtifactType,
): ReviewStrategy {
  // Code generation → LLM-as-Judge (most reliable per Anthropic)
  if (artifactType === 'code' || task.title.match(/代码|code|实现|implement|build|开发/)) {
    return 'llm-as-judge';
  }

  // Design/creative → Majority vote (preserves diversity)
  if (artifactType === 'webpage' || task.title.match(/设计|design|样式|style|动画|animation|创意/)) {
    return 'majority-vote';
  }

  // Documentation/facts → Consensus
  if (artifactType === 'doc' || task.title.match(/文档|doc|文案|说明|copy|内容/)) {
    return 'consensus';
  }

  // Deployment/critical → Human confirmation
  if (artifactType === 'ppt' || task.title.match(/部署|deploy|上线|发布/)) {
    return 'human-confirmation';
  }

  return 'llm-as-judge'; // Default
}

// ────────────────────────────────────────────────────────────
// Review Execution
// ────────────────────────────────────────────────────────────

/**
 * Review a task's output using the appropriate strategy.
 *
 * @param task - The subtask to review
 * @param output - The agent's output text
 * @param artifactContent - Optional: the artifact content for deeper review
 * @param llmJudge - Optional: LLM-based judge function for llm-as-judge strategy
 */
export async function reviewTask(
  planId: string,
  task: SubTask,
  output: string,
  options?: {
    artifactContent?: string;
    artifactType?: ArtifactType;
    llmJudge?: (task: SubTask, output: string, artifactContent?: string) => Promise<ReviewDimensions>;
  },
): Promise<ReviewResult> {
  const strategy = selectReviewStrategy(task, options?.artifactType);

  let dimensions: ReviewDimensions;
  let verdict: ReviewVerdict;
  let feedback: string;
  let suggestedRevision: string | undefined;

  switch (strategy) {
    case 'llm-as-judge':
      if (options?.llmJudge) {
        dimensions = await options.llmJudge(task, output, options.artifactContent);
      } else {
        dimensions = rulesBasedReview(task, output, options?.artifactContent);
      }
      break;
    case 'majority-vote':
    case 'consensus':
    default:
      // For non-LLM strategies, use rules-based review with adjusted thresholds
      dimensions = rulesBasedReview(task, output, options?.artifactContent);
      break;
  }

  const score = computeOverallScore(dimensions);

  // Hard rejection: if completeness is extremely low, auto-reject
  if (dimensions.completeness < 0.3) {
    return {
      taskId: task.id,
      verdict: 'rejected',
      score: Math.min(score, 0.4),
      dimensions,
      feedback: `Insufficient output (completeness: ${(dimensions.completeness * 100).toFixed(0)}%). The agent produced negligible content.`,
      strategy,
    };
  }

  if (score >= 0.8) {
    verdict = 'accepted';
    feedback = 'All acceptance criteria met.';
  } else if (score >= 0.5) {
    verdict = 'revised';
    feedback = generateRevisionFeedback(dimensions, task);
    suggestedRevision = feedback;
  } else {
    verdict = 'rejected';
    feedback = `Quality too low (score: ${(score * 100).toFixed(0)}%). Consider reassigning to a different agent.`;
  }

  recordTrace({
    planId,
    taskId: task.id,
    step: `Critic review: ${verdict}`,
    phase: 'review',
    output: { verdict, score, dimensions },
    durationMs: 0,
  });

  return {
    taskId: task.id,
    verdict,
    score,
    dimensions,
    feedback,
    suggestedRevision,
    strategy,
  };
}

// ────────────────────────────────────────────────────────────
// Rules-Based Review (fast path, no LLM needed)
// ────────────────────────────────────────────────────────────

function rulesBasedReview(
  task: SubTask,
  output: string,
  artifactContent?: string,
): ReviewDimensions {
  const content = artifactContent ?? output;

  // Completeness: did the agent produce something?
  const completeness = content.length > 100 ? 0.9 : content.length > 50 ? 0.7 : content.length > 10 ? 0.5 : 0.2;

  // Code quality heuristics (when applicable)
  let codeQuality = 0.8; // Default neutral
  if (content.includes('function') || content.includes('class') || content.includes('const ') || content.includes('import ')) {
    // Looks like code
    codeQuality = 0.7;
    // Check for basic patterns
    if (content.includes('//') || content.includes('/*')) codeQuality += 0.1; // Has comments
    if (content.includes('export ') || content.includes('module.exports')) codeQuality += 0.05; // Modular
    if (/^[a-zA-Z]+\s*\(/.test(content)) codeQuality += 0.05; // Has functions
    codeQuality = Math.min(codeQuality, 1.0);
  }

  // Security heuristics
  let security = 0.9; // Start optimistic
  const securityRedFlags = [
    /API[_-]?KEY\s*=\s*['"][^'"]{8,}['"]/gi,    // Hardcoded API keys
    /password\s*=\s*['"][^'"]+['"]/gi,           // Hardcoded passwords
    /eval\s*\(/gi,                                 // eval() usage
    /innerHTML\s*=/gi,                             // innerHTML assignment
    /document\.write\s*\(/gi,                      // document.write
    /secret\s*=\s*['"][^'"]+['"]/gi,              // Secrets
  ];
  for (const flag of securityRedFlags) {
    if (flag.test(content)) {
      security -= 0.3;
    }
  }
  security = Math.max(security, 0.1);

  // Usability heuristics
  let usability = 0.8;
  if (content.includes('responsive') || content.includes('@media')) usability += 0.1;
  if (content.includes('aria-') || content.includes('role=')) usability += 0.1; // Accessibility
  if (content.includes('viewport')) usability += 0.05;
  usability = Math.min(usability, 1.0);

  return { completeness, codeQuality, security, usability };
}

// ────────────────────────────────────────────────────────────
// Scoring
// ────────────────────────────────────────────────────────────

function computeOverallScore(d: ReviewDimensions): number {
  // Weighted average — completeness is most important
  return (
    d.completeness * 0.35 +
    d.codeQuality * 0.25 +
    d.security * 0.25 +
    d.usability * 0.15
  );
}

function generateRevisionFeedback(d: ReviewDimensions, task: SubTask): string {
  const issues: string[] = [];

  if (d.completeness < 0.8) {
    issues.push(`Completeness: ${(d.completeness * 100).toFixed(0)}% — missing required content`);
  }
  if (d.codeQuality < 0.7) {
    issues.push(`Code quality: ${(d.codeQuality * 100).toFixed(0)}% — needs better structure/comments`);
  }
  if (d.security < 0.7) {
    issues.push(`Security: ${(d.security * 100).toFixed(0)}% — potential vulnerabilities detected`);
  }
  if (d.usability < 0.7) {
    issues.push(`Usability: ${(d.usability * 100).toFixed(0)}% — improve responsiveness/accessibility`);
  }

  const acStr = task.acceptanceCriteria?.length
    ? `\n\nAcceptance criteria to meet:\n${task.acceptanceCriteria.map(ac => `- ${ac}`).join('\n')}`
    : '';

  return `Revision needed for task "${task.title}":\n${issues.join('\n')}${acStr}`;
}

// ────────────────────────────────────────────────────────────
// Critic Report Generator
// ────────────────────────────────────────────────────────────

export function generateCriticReport(
  results: ReviewResult[],
): CriticReport {
  if (results.length === 0) {
    return {
      overallScore: 1.0,
      suggestions: [],
      reviewStrategy: 'llm-as-judge',
    };
  }

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const suggestions = results
    .filter(r => r.verdict !== 'accepted')
    .map(r => r.feedback);

  const avgCodeQuality = results.reduce((sum, r) => sum + r.dimensions.codeQuality, 0) / results.length;
  const securityIssues = results.filter(r => r.dimensions.security < 0.8);

  return {
    overallScore: avgScore,
    codeQuality: avgCodeQuality,
    security: securityIssues.length === 0 ? '通过' : `${securityIssues.length} issue(s) found`,
    suggestions,
    reviewStrategy: results[0]?.strategy ?? 'llm-as-judge',
  };
}
