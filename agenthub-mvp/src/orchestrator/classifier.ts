/**
 * IntentClassifier — 3-stage intent classification engine.
 *
 * Stage 1: Keyword fast-classify (deterministic, <10ms)
 * Stage 2: Complexity scoring via rule engine (<50ms)
 * Stage 3: LLM semantic understanding (~1-2s, when needed)
 *
 * Replaces the old keyword-only matching in planner.ts.
 */
import type { IntentClassification, IntentComplexity, AgentCapability } from '../types';

// ────────────────────────────────────────────────────────────
// Stage 1: Keyword Fast Classification
// ────────────────────────────────────────────────────────────

interface KeywordRule {
  keywords: RegExp;
  domains: AgentCapability[];
  complexity: IntentComplexity;
  strategy: IntentClassification['suggestedStrategy'];
  label: string;
}

const KEYWORD_RULES: KeywordRule[] = [
  // Specific patterns first (more specific beats generic)
  // Landing page — specific enough to be before generic creation
  {
    keywords: /落地页|landing\s*page/i,
    domains: ['code', 'design'],
    complexity: 'complex',
    strategy: 'supervisor-worker',
    label: 'landing-page',
  },
  // Official site / homepage
  {
    keywords: /官网|首页|门户网站/i,
    domains: ['code', 'design', 'doc'],
    complexity: 'complex',
    strategy: 'supervisor-worker',
    label: 'official-site',
  },
  // Diagnostic/checking — must come BEFORE creation to distinguish
  // "检查网站SSL" (diagnostic) from "做网站" (creation)
  {
    keywords: /检查|check|查看|诊断|debug|排查.*(错误|问题|bug|漏洞|证书|ssl|配置)/i,
    domains: ['code'],
    complexity: 'simple',
    strategy: 'direct',
    label: 'diagnostic',
  },
  // Complex creation tasks → supervisor-worker (MUST come before medium/simple patterns)
  // Requires BOTH a creation verb AND a target
  {
    keywords: /(?:做|创建|搭建|开发|构建|建立|生成|帮我|写一个).*(?:网站|网页|页面|应用|app|平台|系统|商城|后台|项目)/i,
    domains: ['code', 'design'],
    complexity: 'complex',
    strategy: 'supervisor-worker',
    label: 'complex-creation',
  },
  // Medium — component-level work
  {
    keywords: /组件|component|按钮|button|表单|form|modal|弹窗|卡片|card|表格|table|导航|navbar/i,
    domains: ['code', 'design'],
    complexity: 'medium',
    strategy: 'single-agent',
    label: 'component',
  },
  // Medium — deploy (only match when deploy is the primary focus, not part of a larger task)
  {
    keywords: /^.{0,60}(?:部署|deploy|上线|发布|publish).{0,30}$/i,
    domains: ['deploy'],
    complexity: 'medium',
    strategy: 'single-agent',
    label: 'deploy',
  },
  // Simple — documentation
  {
    keywords: /文档|文案|说明|spec|prd|readme|介绍|规则|rule|确认\s*spec/i,
    domains: ['doc'],
    complexity: 'simple',
    strategy: 'direct',
    label: 'documentation',
  },
  // Data tasks
  {
    keywords: /数据|sql|查询|统计|分析|报表|chart|图/i,
    domains: ['data'],
    complexity: 'medium',
    strategy: 'single-agent',
    label: 'data',
  },
  // Generic repair/fix (simple)
  {
    keywords: /修复|fix|bug|问题|报错|错误/i,
    domains: ['code'],
    complexity: 'simple',
    strategy: 'direct',
    label: 'repair',
  },
];

function stage1KeywordClassify(intent: string): KeywordRule | null {
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.test(intent)) {
      return rule;
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Stage 2: Complexity Scoring (Rule Engine)
// ────────────────────────────────────────────────────────────

interface ComplexityScore {
  score: number;
  factors: string[];
}

function stage2ComplexityScore(intent: string): ComplexityScore {
  const factors: string[] = [];
  let score = 0;

  // Length-based complexity
  const len = intent.length;
  if (len > 100) { score += 2; factors.push(`long-query(${len}chars)`); }
  else if (len > 50) { score += 1; factors.push(`medium-query(${len}chars)`); }

  // Keyword count (more keywords = more complex intent)
  const words = intent.split(/[\s,，、。；;]+/).filter(Boolean);
  if (words.length > 20) { score += 2; factors.push(`many-words(${words.length})`); }
  else if (words.length > 10) { score += 1; factors.push(`moderate-words(${words.length})`); }

  // Multi-domain indicators
  const domainIndicators: [RegExp, string][] = [
    [/前端|frontend|页面|ui|样式|css|动画|动画效果/, 'frontend'],
    [/后端|backend|api|数据库|database|server|服务/, 'backend'],
    [/部署|deploy|上线|发布|vercel|服务器/, 'deploy'],
    [/设计|design|颜色|字体|排版|布局|layout/, 'design'],
    [/文案|内容|copy|文字|品牌/, 'content'],
    [/移动|mobile|响应式|responsive|手机|平板/, 'mobile'],
    [/安全|security|加密|auth|权限|ssl/, 'security'],
    [/测试|test|e2e|单元测试|集成测试/, 'testing'],
  ];

  const hitDomains = domainIndicators.filter(([re]) => re.test(intent));
  if (hitDomains.length >= 3) { score += 3; factors.push(`multi-domain(${hitDomains.map(d => d[1]).join(',')})`); }
  else if (hitDomains.length >= 2) { score += 1; factors.push(`dual-domain(${hitDomains.map(d => d[1]).join(',')})`); }

  // Constraint indicators
  if (/必须|must|要求|需要.*同时|and also|还要|外加|包括|包含.*和/.test(intent)) {
    score += 1;
    factors.push('has-constraints');
  }

  // Conditional logic
  if (/如果|if|when|根据|取决于|depends|条件/.test(intent)) {
    score += 1;
    factors.push('conditional-logic');
  }

  return { score, factors };
}

function scoreToComplexity(score: number): IntentComplexity {
  if (score >= 6) return 'complex';
  if (score >= 3) return 'medium';
  return 'simple';
}

// ────────────────────────────────────────────────────────────
// Stage 3: LLM Semantic Understanding
// ────────────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a multi-agent platform. Analyze the user's request and output JSON:

{
  "isCreation": true/false,
  "primaryDomain": "code"|"design"|"doc"|"data"|"deploy"|"plan",
  "secondaryDomains": [],
  "complexity": "simple"|"medium"|"complex",
  "suggestedStrategy": "direct"|"single-agent"|"supervisor-worker",
  "requiresCoordination": true/false,
  "estimatedSubtaskCount": 1-6,
  "reasoning": "brief explanation"
}

Key distinctions:
- "make/build/create a website" → creation, complex, supervisor-worker
- "check/debug/fix the SSL on my site" → diagnostic, simple, direct
- "add a button to the page" → modification, medium, single-agent
- "design a complete brand + build site + deploy" → creation, complex, supervisor-worker

Only output the JSON, no markdown fences or extra text.`;

/**
 * LLM-based deep intent understanding. Used when keyword + rules can't confidently classify.
 */
export async function stage3LlmClassify(
  intent: string,
  llmCall: (systemPrompt: string, userMessage: string) => Promise<string>,
): Promise<IntentClassification | null> {
  try {
    const raw = await llmCall(CLASSIFIER_SYSTEM_PROMPT, intent);
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      complexity: parsed.complexity ?? 'medium',
      domains: [parsed.primaryDomain, ...(parsed.secondaryDomains ?? [])].filter(Boolean),
      suggestedStrategy: parsed.suggestedStrategy ?? 'single-agent',
      confidence: 0.7,
      reasoning: parsed.reasoning ?? 'LLM classification',
    };
  } catch (err) {
    console.error('[Classifier] LLM stage failed:', err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export interface ClassifyResult {
  classification: IntentClassification;
  matchedRule: string | null;
  usedStages: number[];       // Which stages were used
  durationMs: number;
}

/**
 * Classify user intent through progressive stages.
 * Returns early if a stage has high confidence.
 */
export function classifyIntent(
  intent: string,
  options?: {
    forceLlm?: boolean;
    llmCall?: (systemPrompt: string, userMessage: string) => Promise<string>;
  },
): ClassifyResult | Promise<ClassifyResult> {
  const startTime = performance.now();

  // Stage 1: Keyword match
  const kwMatch = stage1KeywordClassify(intent);
  if (kwMatch && kwMatch.complexity === 'simple') {
    // High confidence simple match → no need for further stages
    return {
      classification: {
        complexity: kwMatch.complexity,
        domains: kwMatch.domains,
        suggestedStrategy: kwMatch.strategy,
        confidence: 0.9,
        reasoning: `Keyword matched: ${kwMatch.label}`,
      },
      matchedRule: kwMatch.label,
      usedStages: [1],
      durationMs: performance.now() - startTime,
    };
  }

  // Stage 2: Complexity scoring
  const { score, factors } = stage2ComplexityScore(intent);
  const complexity = scoreToComplexity(score);

  // If keyword match agrees with complexity score → use combined result
  // If they disagree (e.g., keyword says complex but score says simple) → go to stage 3
  const keywordAndScoreAgree =
    (kwMatch?.complexity === 'simple' && complexity === 'simple') ||
    (kwMatch?.complexity === 'medium' && (complexity === 'simple' || complexity === 'medium')) ||
    (kwMatch?.complexity === 'complex' && complexity === 'complex');

  if (kwMatch && keywordAndScoreAgree) {
    return {
      classification: {
        complexity: kwMatch.complexity,
        domains: kwMatch.domains,
        suggestedStrategy: kwMatch.strategy,
        confidence: 0.75,
        reasoning: `Keyword: ${kwMatch.label} | Score: ${score} (${factors.join(', ')})`,
      },
      matchedRule: kwMatch.label,
      usedStages: [1, 2],
      durationMs: performance.now() - startTime,
    };
  }

  // Stage 3: LLM — needed for complex/ambiguous intents
  if (options?.llmCall || options?.forceLlm) {
    // Returns a Promise — caller handles async
    const llmPromise = (options.llmCall
      ? stage3LlmClassify(intent, options.llmCall)
      : Promise.resolve(null)
    ).then(llmResult => {
      if (llmResult) {
        return {
          classification: llmResult,
          matchedRule: kwMatch?.label ?? null,
          usedStages: [1, 2, 3],
          durationMs: performance.now() - startTime,
        };
      }
      // LLM failed → fall back to rules-based
      return {
        classification: {
          complexity,
          domains: kwMatch?.domains ?? ['code'],
          suggestedStrategy: (complexity === 'complex' ? 'supervisor-worker' : 'single-agent') as IntentClassification['suggestedStrategy'],
          confidence: 0.5,
          reasoning: `Rules-based fallback | Score: ${score} (${factors.join(', ')})`,
        },
        matchedRule: kwMatch?.label ?? null,
        usedStages: [1, 2],
        durationMs: performance.now() - startTime,
      };
    });

    return llmPromise;
  }

  // No LLM available → rules-based result
  // When keyword match exists, trust its complexity judgment over pure scoring
  const finalComplexity = kwMatch ? kwMatch.complexity : complexity;
  const strategy: IntentClassification['suggestedStrategy'] =
    finalComplexity === 'complex' ? 'supervisor-worker' :
    finalComplexity === 'medium' ? 'single-agent' : 'direct';

  return {
    classification: {
      complexity: finalComplexity,
      domains: kwMatch?.domains ?? ['code'],
      suggestedStrategy: strategy,
      confidence: kwMatch ? 0.7 : 0.5,
      reasoning: `Rules-based | Score: ${score} (${factors.join(', ')}) | Keyword: ${kwMatch?.label ?? 'none'}`,
    },
    matchedRule: kwMatch?.label ?? null,
    usedStages: [1, 2],
    durationMs: performance.now() - startTime,
  };
}

/**
 * Synchronous classify — returns rules-based result without LLM.
 */
export function classifySync(intent: string): ClassifyResult {
  const result = classifyIntent(intent);
  if (result instanceof Promise) {
    // Should not happen when no llmCall option
    throw new Error('Unexpected async classify');
  }
  return result;
}
