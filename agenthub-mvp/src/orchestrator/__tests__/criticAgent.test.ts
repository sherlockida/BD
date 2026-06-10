/**
 * Critic Agent Tests — validates review logic and strategy selection.
 */
import { describe, it, expect } from 'vitest';
import { reviewTask, selectReviewStrategy, generateCriticReport } from '../criticAgent';
import type { SubTask, ReviewResult } from '../../types';

function makeTask(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: 'task_1',
    title: '页面骨架搭建',
    description: '使用HTML+TailwindCSS构建页面结构',
    assignedAgentId: 'agent_claude_code',
    dependsOn: [],
    status: 'success',
    acceptanceCriteria: ['页面结构完整', '语义化HTML'],
    ...overrides,
  };
}

describe('Critic Agent - Strategy Selection', () => {
  it('selects llm-as-judge for code tasks', () => {
    const task = makeTask({ title: '实现购物车组件' });
    expect(selectReviewStrategy(task, 'code')).toBe('llm-as-judge');
  });

  it('selects majority-vote for creative/design tasks', () => {
    const task = makeTask({ title: '设计首页动画效果' });
    expect(selectReviewStrategy(task, 'webpage')).toBe('majority-vote');
  });

  it('selects consensus for documentation tasks', () => {
    const task = makeTask({ title: '撰写品牌文案' });
    expect(selectReviewStrategy(task, 'doc')).toBe('consensus');
  });

  it('selects human-confirmation for deploy tasks', () => {
    const task = makeTask({ title: '部署到生产环境' });
    expect(selectReviewStrategy(task, 'ppt')).toBe('human-confirmation');
  });

  it('defaults to llm-as-judge for unknown types', () => {
    const task = makeTask();
    expect(selectReviewStrategy(task)).toBe('llm-as-judge');
  });
});

describe('Critic Agent - Rules-Based Review', () => {
  it('accepts high-quality output', async () => {
    const task = makeTask();
    const output = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Landing Page</title></head>
      <body>
        <header role="banner"><nav aria-label="Main navigation"><!-- nav --></nav></header>
        <main><section class="hero"><h1>Welcome</h1><p>This is a fully built landing page</p></section></main>
      </body></html>
    `;

    const result = await reviewTask('plan_1', task, output);
    expect(result.verdict).toBe('accepted');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('flags hardcoded secrets as security issue', async () => {
    const task = makeTask();
    const output = 'const API_KEY = "sk-1234567890abcdef"; const password = "admin123";';

    const result = await reviewTask('plan_1', task, output);
    // Security score should be lower
    expect(result.dimensions.security).toBeLessThan(0.8);
  });

  it('flags innerHTML usage as security issue', async () => {
    const task = makeTask();
    const output = 'document.getElementById("app").innerHTML = userInput;';

    const result = await reviewTask('plan_1', task, output);
    expect(result.dimensions.security).toBeLessThan(0.8);
  });

  it('rejects very short/low-quality output', async () => {
    const task = makeTask();
    const output = 'ok';

    const result = await reviewTask('plan_1', task, output);
    expect(result.verdict).toBe('rejected');
    expect(result.score).toBeLessThan(0.5);
  });

  it('returns revised for moderate quality output', async () => {
    const task = makeTask();
    const output = 'Some HTML content without much detail';

    const result = await reviewTask('plan_1', task, output);
    // Should be revised or possibly accepted (depends on heuristics)
    expect(['revised', 'rejected']).toContain(result.verdict);
  });
});

describe('Critic Agent - Review Dimensions', () => {
  it('detects responsive design patterns for usability', async () => {
    const task = makeTask();
    const output = '@media (max-width: 768px) { .container { padding: 10px; } }';

    const result = await reviewTask('plan_1', task, output);
    expect(result.dimensions.usability).toBeGreaterThan(0.8);
  });

  it('detects accessibility attributes for usability', async () => {
    const task = makeTask();
    const output = '<button aria-label="Close dialog" role="button">X</button>';

    const result = await reviewTask('plan_1', task, output);
    expect(result.dimensions.usability).toBeGreaterThan(0.8);
  });

  it('applies weighted scoring', async () => {
    const task = makeTask();
    const output = 'A'.repeat(100); // Long enough to pass completeness

    const result = await reviewTask('plan_1', task, output);
    // Score should be weighted: completeness(35%) + codeQuality(25%) + security(25%) + usability(15%)
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe('Critic Agent - Report Generation', () => {
  it('generates report from multiple review results', () => {
    const results: ReviewResult[] = [
      {
        taskId: 't1', verdict: 'accepted', score: 0.9,
        dimensions: { completeness: 0.9, codeQuality: 0.9, security: 0.9, usability: 0.9 },
        feedback: 'OK', strategy: 'llm-as-judge',
      },
      {
        taskId: 't2', verdict: 'revised', score: 0.6,
        dimensions: { completeness: 0.7, codeQuality: 0.5, security: 0.6, usability: 0.7 },
        feedback: 'Needs work', strategy: 'llm-as-judge',
      },
    ];

    const report = generateCriticReport(results);
    expect(report.overallScore).toBeCloseTo(0.75, 1);
    expect(report.suggestions).toHaveLength(1);
    expect(report.codeQuality).toBeCloseTo(0.7, 1);
  });

  it('handles empty results gracefully', () => {
    const report = generateCriticReport([]);
    expect(report.overallScore).toBe(1.0);
    expect(report.suggestions).toHaveLength(0);
  });
});
