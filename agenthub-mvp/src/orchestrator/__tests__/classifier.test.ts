/**
 * IntentClassifier Tests — validates 3-stage classification engine.
 */
import { describe, it, expect } from 'vitest';
import { classifySync, classifyIntent } from '../classifier';

describe('IntentClassifier - Stage 1 (Keyword)', () => {
  it('classifies landing page as complex with supervisor-worker strategy', () => {
    const result = classifySync('帮我做一个茶饮品牌的落地页');
    expect(result.classification.complexity).toBe('complex');
    expect(result.classification.suggestedStrategy).toBe('supervisor-worker');
    expect(result.classification.domains).toContain('code');
    expect(result.classification.domains).toContain('design');
    expect(result.matchedRule).toBe('landing-page');
    expect(result.usedStages).toContain(1);
  });

  it('classifies official site as complex', () => {
    const result = classifySync('做一个公司官网');
    expect(result.classification.complexity).toBe('complex');
    expect(result.matchedRule).toBe('official-site');
  });

  it('classifies component task as medium with single-agent strategy', () => {
    const result = classifySync('创建一个登录表单组件');
    expect(result.classification.complexity).toBe('medium');
    expect(result.classification.suggestedStrategy).toBe('single-agent');
    expect(result.matchedRule).toBe('component');
  });

  it('classifies deploy task as medium', () => {
    const result = classifySync('部署到Vercel');
    expect(result.classification.complexity).toBe('medium');
    expect(result.matchedRule).toBe('deploy');
  });

  it('classifies documentation as simple with direct strategy', () => {
    const result = classifySync('写一份产品需求文档');
    expect(result.classification.complexity).toBe('simple');
    expect(result.classification.suggestedStrategy).toBe('direct');
    expect(result.matchedRule).toBe('documentation');
  });

  it('classifies diagnostic/checking as simple (NOT creation)', () => {
    const result = classifySync('检查网站SSL证书是否过期');
    expect(result.classification.complexity).toBe('simple');
    expect(result.classification.suggestedStrategy).toBe('direct');
    expect(result.matchedRule).toBe('diagnostic');
    // This is the key fix: "检查网站" should NOT match "网站" from complex patterns
    // It should match "检查" → diagnostic
  });

  it('distinguishes creation from checking — semantic difference', () => {
    const create = classifySync('做一个网站，带产品列表');
    const check = classifySync('检查网站有没有安全漏洞');

    // Creation → complex
    expect(create.matchedRule).toBe('complex-creation');
    expect(create.classification.complexity).toBe('complex');

    // Checking → simple/diagnostic
    expect(check.matchedRule).toBe('diagnostic');
    expect(check.classification.complexity).toBe('simple');
  });
});

describe('IntentClassifier - Stage 2 (Complexity Scoring)', () => {
  it('scores short simple queries as simple', () => {
    const result = classifySync('hello');
    expect(result.classification.complexity).toBe('simple');
    expect(result.usedStages).toContain(2);
  });

  it('scores long multi-domain queries as complex', () => {
    const result = classifySync(
      '做一个完整的电商平台，包含用户注册登录、商品列表、购物车、下单支付，还要有管理后台，支持数据统计和报表，部署到生产环境，确保移动端适配和安全性',
    );
    expect(result.classification.complexity).toBe('complex');
    expect(result.classification.confidence).toBeGreaterThan(0.4);
  });

  it('scores moderate queries as medium', () => {
    const result = classifySync('在现有页面基础上添加一个数据可视化图表');
    expect(['medium', 'complex']).toContain(result.classification.complexity);
  });
});

describe('IntentClassifier - Stage 3 (LLM fallback)', () => {
  it('returns async result when llmCall is provided', () => {
    const result = classifyIntent('做一个复杂的企业级SaaS平台', {
      llmCall: async (sp, msg) => JSON.stringify({
        isCreation: true,
        primaryDomain: 'code',
        secondaryDomains: ['design', 'deploy'],
        complexity: 'complex',
        suggestedStrategy: 'supervisor-worker',
        requiresCoordination: true,
        estimatedSubtaskCount: 5,
        reasoning: 'Full SaaS platform needs multiple components',
      }),
    });

    expect(result).toBeInstanceOf(Promise);
  });

  it('falls back to rules when LLM returns invalid JSON', async () => {
    const result = await classifyIntent('做一个网站', {
      llmCall: async () => 'invalid json {{{',
    });

    expect(result.classification).toBeDefined();
    expect(result.classification.confidence).toBeGreaterThan(0);
    expect(result.usedStages).toContain(1); // At minimum stage 1 ran
  });
});

describe('IntentClassifier - Edge cases', () => {
  it('handles empty intent gracefully', () => {
    const result = classifySync('');
    expect(result.classification.complexity).toBe('simple');
    expect(result.classification.domains).toContain('code'); // Default
  });

  it('handles mixed Chinese-English intent', () => {
    const result = classifySync('Create a React component with TailwindCSS styling and deploy to Vercel');
    expect(result.classification.domains).toBeDefined();
  });

  it('returns consistent results for equivalent intents', () => {
    const r1 = classifySync('做一个落地页');
    const r2 = classifySync('做一个落地页');
    expect(r1.matchedRule).toBe(r2.matchedRule);
    expect(r1.classification.complexity).toBe(r2.classification.complexity);
  });

  it('includes durationMs in all results', () => {
    const result = classifySync('test');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');
  });
});
