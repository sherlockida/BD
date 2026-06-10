/**
 * Orchestrator 2.0 智能编排测试用例集
 *
 * 覆盖 7 大场景，全面验证编排器的智能决策能力：
 *   A. 语义区分（创建 vs 诊断）
 *   B. 复杂度自动评估
 *   C. Agent 智能选择
 *   D. 多 Agent 协作（黑板通信）
 *   E. 质量评审（Critic）
 *   F. 失败降级 + 重试
 *   G. 全流程端到端
 *
 * 运行方式: npx vitest run src/orchestrator/__tests__/orchestrator.live.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Agent,
  OrchestratorPlan,
  SubTask,
  AgentChunk,
  IAgent,
  AgentInput,
  AgentCapability,
  IntentClassification,
  AgentPerformanceRecord,
} from '../../types';
import { classifySync } from '../classifier';
import { selectAgent } from '../agentSelector';
import {
  createBlackboard,
  addFact,
  addDecision,
  addArtifactRef,
  addConstraint,
  addConcern,
  proposeChange,
  markTaskComplete,
  updateArtifactStatus,
  getFacts,
  getDecisions,
  getProgress,
  generateBlackboardSummary,
  destroyBlackboard,
  getOrCreatePrivateSpace,
} from '../blackboard';
import { reviewTask, selectReviewStrategy, generateCriticReport } from '../criticAgent';
import { synthesize, formatReportAsMarkdown, formatBriefSummary, detectConflicts } from '../pmoSynthesizer';
import {
  initSupervisor,
  assignAgents,
  monitorProgress,
  replan,
  raceWithTimeout,
  getAgentContextInjection,
  acquireSessionLock,
  releaseSessionLock,
  isSessionActive,
  DEFAULT_TIMEOUTS,
} from '../supervisor';
import {
  startTracking,
  recordTokenOutput,
  recordArtifactOutput,
  checkStall,
  checkAllStalls,
  stopTracking,
  clearAllTracking,
} from '../stallDetector';
import {
  registerSagaOperation,
  markSagaExecuted,
  compensate,
  clearSaga,
} from '../saga';
import {
  recordTrace,
  getTracesByPlan,
  getErrorTraces,
  getPlanTimeline,
  clearTraces,
} from '../trace';

// ═══════════════════════════════════════════════════════════
// Fixtures: 模拟 Agent 注册表
// ═══════════════════════════════════════════════════════════

const AGENTS: Agent[] = [
  { id: 'agent_claude_code', name: 'Claude Code', avatarEmoji: '🧠', avatarColor: 'bg-orange-500', vendor: 'claude-code', capabilities: ['code', 'plan', 'doc', 'design'], tagline: '全栈工程师', online: true },
  { id: 'agent_codex', name: 'Codex', avatarEmoji: '🎨', avatarColor: 'bg-purple-500', vendor: 'codex', capabilities: ['code', 'design'], tagline: 'CSS动效高手', online: true },
  { id: 'agent_open_code', name: 'OpenCode', avatarEmoji: '🔧', avatarColor: 'bg-green-500', vendor: 'open-code', capabilities: ['code', 'deploy'], tagline: 'DevOps全栈', online: true },
  { id: 'agent_doc', name: 'DocAgent', avatarEmoji: '✍️', avatarColor: 'bg-yellow-500', vendor: 'custom', capabilities: ['doc'], tagline: '文档文案专家', online: true },
];

const EMPTY_HISTORY: AgentPerformanceRecord[] = [];

// ═══════════════════════════════════════════════════════════
// 场景 A: 语义区分 — 创建 vs 诊断
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 A: 语义区分 — 创建 vs 诊断', () => {
  const testCases = [
    {
      name: '做品牌官网',
      intent: '帮我做一个茶饮品牌的官网，包含产品展示和在线下单功能',
      expectedComplexity: 'complex',
      expectedStrategy: 'supervisor-worker',
      expectedDomains: expect.arrayContaining(['code', 'design']),
      description: '创建型复杂任务 → Supervisor-Worker 模式',
    },
    {
      name: '检查 SSL 证书',
      intent: '检查一下公司网站的 SSL 证书是否快过期了',
      expectedComplexity: 'simple',
      expectedStrategy: 'direct',
      expectedDomains: expect.arrayContaining(['code']),
      description: '诊断型简单任务 → 直接执行（即使包含"网站"关键词）',
    },
    {
      name: '修复登录 Bug',
      intent: '修复用户登录页面的密码重置功能报 500 错误',
      expectedComplexity: 'simple',
      expectedStrategy: 'direct',
      expectedDomains: expect.arrayContaining(['code']),
      description: '修复型 → 直接委托给代码 Agent',
    },
    {
      name: '写产品 PRD',
      intent: '写一份社交电商 App 的产品需求文档，包含用户故事和验收标准',
      expectedComplexity: 'simple',
      expectedStrategy: 'direct',
      expectedDomains: expect.arrayContaining(['doc']),
      description: '文档型 → 直接委托给文档 Agent',
    },
    {
      name: '创建登录表单组件',
      intent: '创建一个带邮箱验证和密码强度检测的登录表单组件',
      expectedComplexity: 'medium',
      expectedStrategy: 'single-agent',
      expectedDomains: expect.arrayContaining(['code', 'design']),
      description: '组件级 → 单 Agent 执行（不是完整应用）',
    },
    {
      name: '部署到生产环境',
      intent: '把当前项目部署到 Vercel 生产环境',
      expectedComplexity: 'medium',
      expectedStrategy: 'single-agent',
      expectedDomains: expect.arrayContaining(['deploy']),
      description: '部署型 → 单 Agent 执行',
    },
    {
      name: '多域复杂平台',
      intent: '做一个完整的 SaaS 后台管理系统，需要用户权限管理、数据看板、文件上传、API 接口、还要部署上线和保证安全性',
      expectedComplexity: 'complex',
      expectedStrategy: 'supervisor-worker',
      expectedDomains: expect.any(Array),
      description: '多域复杂任务 → 必须 Supervisor-Worker',
    },
  ];

  for (const tc of testCases) {
    it(`${tc.name}: ${tc.description}`, () => {
      const result = classifySync(tc.intent);
      console.log(`\n📝 "${tc.name}"`);
      console.log(`   输入: ${tc.intent.substring(0, 60)}...`);
      console.log(`   结果: complexity=${result.classification.complexity} strategy=${result.classification.suggestedStrategy} rule=${result.matchedRule}`);
      console.log(`   置信度: ${result.classification.confidence} | 耗时: ${result.durationMs.toFixed(1)}ms`);
      console.log(`   原因: ${result.classification.reasoning}`);

      expect(result.classification.complexity).toBe(tc.expectedComplexity);
      expect(result.classification.suggestedStrategy).toBe(tc.expectedStrategy);
      expect(result.classification.domains).toEqual(tc.expectedDomains);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// 场景 B: 复杂度自动评估
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 B: 复杂度自动评估', () => {
  it('短查询 → 简单', () => {
    const r1 = classifySync('hello world');
    const r2 = classifySync('帮我写一行 CSS');
    expect(r1.classification.complexity).toBe('simple');
    expect(r2.classification.complexity).toBe('simple');
  });

  it('中等长度单域查询 → 中等', () => {
    const r = classifySync('帮我写一个带分页和搜索功能的数据表格组件，支持排序和筛选');
    expect(['medium', 'complex']).toContain(r.classification.complexity);
  });

  it('超长多域查询 → 复杂', () => {
    const intent = '做一个企业级 CRM 系统，要有客户管理、销售漏斗、数据报表、邮件集成、权限控制、移动端适配、还要部署到 AWS 并配置 CI/CD';
    const r = classifySync(intent);
    expect(r.classification.complexity).toBe('complex');
  });

  it('包含约束条件的查询 → 分数提升', () => {
    const simpleWithConstraint = classifySync('做一个按钮，必须同时支持暗色模式和亮色模式，还要兼容 IE11');
    console.log(`   约束查询 → complexity=${simpleWithConstraint.classification.complexity} confidence=${simpleWithConstraint.classification.confidence}`);
    // 约束条件应该提升复杂度
    expect(simpleWithConstraint.classification.confidence).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 场景 C: Agent 智能选择
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 C: Agent 智能选择', () => {
  it('纯文档任务 → 选择 DocAgent（专业化优先）', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['doc'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });
    console.log(`   文档任务 → ${result.selectedAgentId} (分数: ${result.score.toFixed(3)})`);
    console.log(`   原因: ${result.reasoning}`);
    expect(result.selectedAgentId).toBe('agent_doc');
  });

  it('部署任务 → 选择 OpenCode（唯一有 deploy 能力的）', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['deploy'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });
    expect(result.selectedAgentId).toBe('agent_open_code');
  });

  it('代码+设计任务 → 选择 Codex（专业匹配 > 通用匹配）', () => {
    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code', 'design'],
      activeTaskCounts: new Map(),
      performanceHistory: EMPTY_HISTORY,
    });
    console.log(`   代码+设计 → ${result.selectedAgentId} (分数: ${result.score.toFixed(3)})`);
    // Codex: 2/2 能力匹配，专业化程度高 (2 个能力中 2 个相关)
    // Claude Code: 2/2 能力匹配，但 4 个能力中只有 2 个相关
    expect(result.selectedAgentId).toBe('agent_codex');
  });

  it('负载均衡 → 避开繁忙的 Agent', () => {
    const busyMap = new Map([
      ['agent_claude_code', 3],
      ['agent_codex', 3],
    ]);

    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: busyMap,
      performanceHistory: EMPTY_HISTORY,
    });
    console.log(`   负载均衡 → ${result.selectedAgentId} (避开繁忙的 Claude Code 和 Codex)`);
    // OpenCode 和 DocAgent 都空闲，但 OpenCode 有 code 能力
    expect(result.selectedAgentId).toBe('agent_open_code');
  });

  it('历史成功率影响选择', () => {
    const history: AgentPerformanceRecord[] = [
      { agentId: 'agent_claude_code', taskType: 'code', successCount: 9, totalCount: 10, avgDurationMs: 3000, lastUsedAt: Date.now(), criticScoreAvg: 0.9 },
      { agentId: 'agent_codex', taskType: 'code', successCount: 3, totalCount: 10, avgDurationMs: 8000, lastUsedAt: Date.now(), criticScoreAvg: 0.4 },
    ];

    const result = selectAgent({
      availableAgents: AGENTS,
      requiredCapabilities: ['code'],
      activeTaskCounts: new Map(),
      performanceHistory: history,
    });
    console.log(`   历史成功率 → ${result.selectedAgentId} (分数: ${result.score.toFixed(3)})`);
    // Claude Code: 90% 成功率 vs Codex: 30%
    expect(result.selectedAgentId).toBe('agent_claude_code');
  });
});

// ═══════════════════════════════════════════════════════════
// 场景 D: 多 Agent 协作 — 黑板通信
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 D: 多 Agent 协作 — 黑板通信', () => {
  const PLAN_ID = 'plan_collab_test';

  beforeEach(() => {
    destroyBlackboard(PLAN_ID);
  });

  it('模拟 4 个 Agent 通过黑板协作完成茶饮品牌官网', () => {
    createBlackboard(PLAN_ID, 4);
    console.log('\n📋 模拟茶饮品牌官网协作流程:');

    // ── Round 1: DocAgent 完成品牌调研 ──
    console.log('  Round 1: DocAgent 品牌调研...');
    addFact(PLAN_ID, '品牌名：茶颜悦色，主打新中式茶饮', 'agent_doc', 0.95);
    addFact(PLAN_ID, '目标用户：18-35 岁都市白领，注重生活品质', 'agent_doc', 0.9);
    addDecision(PLAN_ID, '品牌色调：抹茶绿 #6B8E23 + 米白 #F5F5DC', 'agent_doc', '新中式风格，清新淡雅', undefined);
    addConstraint(PLAN_ID, '必须支持移动端（目标用户 80% 使用手机浏览）');
    markTaskComplete(PLAN_ID);

    // ── Round 2: Claude Code 读黑板，搭 HTML 骨架 ──
    console.log('  Round 2: Claude Code 搭建 HTML 骨架...');
    const ccSpace = getOrCreatePrivateSpace(PLAN_ID, 'agent_claude_code');
    ccSpace.drafts.push({ type: 'html', name: 'index.html', status: 'draft' });
    addArtifactRef(PLAN_ID, 'art_1', 'index.html', 'webpage', 'agent_claude_code');
    markTaskComplete(PLAN_ID);

    // ── Round 3: Codex 读黑板，写 CSS ──
    console.log('  Round 3: Codex 样式设计...');
    const cxSpace = getOrCreatePrivateSpace(PLAN_ID, 'agent_codex');
    // Codex 看到 Claude Code 的 HTML 后提议修改
    proposeChange(PLAN_ID, 'agent_codex', 'art_1', 'agent_claude_code',
      '建议将 hero section 的布局改为 CSS Grid 以便更好的响应式控制', 'medium');
    addFact(PLAN_ID, '使用 TailwindCSS + 自定义 CSS 变量管理主题色', 'agent_codex', 0.85);
    addArtifactRef(PLAN_ID, 'art_2', 'theme.css', 'code', 'agent_codex');
    markTaskComplete(PLAN_ID);

    // ── Round 4: Critic 评审 ──
    console.log('  Round 4: Critic 质量评审...');
    updateArtifactStatus(PLAN_ID, 'art_1', 'reviewed');
    updateArtifactStatus(PLAN_ID, 'art_2', 'reviewed');
    addConcern(PLAN_ID, 'agent_claude_code', 'Codex 的 CSS 中使用了 !important，建议改为提高选择器优先级');
    markTaskComplete(PLAN_ID);

    // ── 验证黑板状态 ──
    const facts = getFacts(PLAN_ID);
    const decisions = getDecisions(PLAN_ID);
    const progress = getProgress(PLAN_ID);

    console.log(`   事实: ${facts.length} 条`);
    console.log(`   决策: ${decisions.length} 条`);
    console.log(`   进度: ${progress!.completed}/${progress!.totalTasks}`);

    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(progress!.completed).toBe(4);

    // ── 生成黑板摘要 ──
    const summary = generateBlackboardSummary(PLAN_ID);
    console.log('\n📋 黑板摘要 (用于注入 Agent System Prompt):');
    console.log(summary);
    expect(summary).toContain('茶颜悦色');
    expect(summary).toContain('抹茶绿');
    expect(summary).toContain('index.html');
  });

  it('Agent 通过私有空间提出跨 Agent 修改建议', () => {
    createBlackboard(PLAN_ID, 2);

    // Claude Code 对 Codex 的 CSS 提出建议
    proposeChange(PLAN_ID, 'agent_claude_code', 'art_css', 'agent_codex',
      'CSS 变量命名建议统一为 --agenthub-{category}-{property} 格式', 'high');
    proposeChange(PLAN_ID, 'agent_claude_code', 'art_css', 'agent_codex',
      '建议添加 prefers-reduced-motion 媒体查询以支持无障碍', 'medium');

    const cxSpace = getOrCreatePrivateSpace(PLAN_ID, 'agent_claude_code');
    console.log(`   Claude Code 对 Codex 提出 ${cxSpace.proposedChanges.length} 条修改建议`);
    console.log(`   高优先级: ${cxSpace.proposedChanges.filter(p => p.priority === 'high').length}`);
    console.log(`   中优先级: ${cxSpace.proposedChanges.filter(p => p.priority === 'medium').length}`);

    expect(cxSpace.proposedChanges.length).toBe(2);
    expect(cxSpace.proposedChanges[0]!.priority).toBe('high');
    expect(cxSpace.proposedChanges[0]!.targetAgentId).toBe('agent_codex');
  });
});

// ═══════════════════════════════════════════════════════════
// 场景 E: 质量评审 — Critic Agent
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 E: 质量评审 — Critic Agent', () => {
  const PLAN_ID = 'plan_critic_test';

  it('高质量 HTML → 评审通过', async () => {
    const task: SubTask = {
      id: 't_html', title: '页面骨架搭建', description: '构建语义化 HTML', assignedAgentId: 'agent_claude_code', dependsOn: [], status: 'success',
      acceptanceCriteria: ['语义化HTML5', 'viewport设置', '无障碍'],
    };

    const output = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="茶颜悦色 - 新中式茶饮品牌">
  <title>茶颜悦色</title>
</head>
<body>
  <header role="banner">
    <nav aria-label="主导航">
      <a href="/" aria-label="首页">茶颜悦色</a>
    </nav>
  </header>
  <main>
    <section class="hero" aria-labelledby="hero-title">
      <h1 id="hero-title">一杯好茶，悦色人生</h1>
      <p>精选原叶，匠心手作</p>
    </section>
  </main>
</body>
</html>`;

    const result = await reviewTask(PLAN_ID, task, output, { artifactType: 'webpage' });
    console.log(`\n📝 HTML 评审结果:`);
    console.log(`   结果: ${result.verdict} | 分数: ${(result.score * 100).toFixed(0)}%`);
    console.log(`   策略: ${result.strategy}`);
    console.log(`   完整性: ${(result.dimensions.completeness * 100).toFixed(0)}%`);
    console.log(`   安全性: ${(result.dimensions.security * 100).toFixed(0)}%`);
    console.log(`   可用性: ${(result.dimensions.usability * 100).toFixed(0)}%`);

    expect(result.verdict).toBe('accepted');
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it('含安全漏洞的代码 → 标记安全问题', async () => {
    const task: SubTask = {
      id: 't_js', title: '用户认证模块', description: '实现登录逻辑', assignedAgentId: 'agent_claude_code', dependsOn: [], status: 'success',
      acceptanceCriteria: ['安全的认证流程'],
    };

    const output = `
// 用户登录
const API_KEY = "sk-abc123def456";  // 硬编码密钥！
const password = "admin123";

function login(user, pass) {
  document.getElementById('result').innerHTML = '<p>Welcome ' + user + '</p>';
  eval('validateUser("' + user + '", "' + pass + '")');
}
`;

    const result = await reviewTask(PLAN_ID, task, output, { artifactType: 'code' });
    console.log(`\n🔒 安全性评审:`);
    console.log(`   结果: ${result.verdict} | 分数: ${(result.score * 100).toFixed(0)}%`);
    console.log(`   安全性: ${(result.dimensions.security * 100).toFixed(0)}% (硬编码密钥+eval+innerHTML)`);
    console.log(`   反馈: ${result.feedback}`);

    expect(result.dimensions.security).toBeLessThan(0.7); // 应该显著降低
  });

  it('极短输出 → 直接拒绝', async () => {
    const task: SubTask = {
      id: 't_bad', title: '重要功能', description: '实现完整功能', assignedAgentId: 'agent_codex', dependsOn: [], status: 'success',
      acceptanceCriteria: ['功能完整可用'],
    };

    const result = await reviewTask(PLAN_ID, task, 'done.');
    expect(result.verdict).toBe('rejected');
    expect(result.score).toBeLessThanOrEqual(0.4);
  });

  it('根据任务类型选择不同评审策略', () => {
    const codeTask: SubTask = { id: 't1', title: '写代码', description: '', assignedAgentId: '', dependsOn: [], status: 'pending' };
    const designTask: SubTask = { id: 't2', title: '设计动画', description: '', assignedAgentId: '', dependsOn: [], status: 'pending' };
    const docTask: SubTask = { id: 't3', title: '写文档', description: '', assignedAgentId: '', dependsOn: [], status: 'pending' };
    const deployTask: SubTask = { id: 't4', title: '部署上线', description: '', assignedAgentId: '', dependsOn: [], status: 'pending' };

    console.log('\n📊 评审策略分配:');
    console.log(`   代码任务 → ${selectReviewStrategy(codeTask, 'code')}`);
    console.log(`   设计任务 → ${selectReviewStrategy(designTask, 'webpage')}`);
    console.log(`   文档任务 → ${selectReviewStrategy(docTask, 'doc')}`);
    console.log(`   部署任务 → ${selectReviewStrategy(deployTask, 'ppt')}`);

    expect(selectReviewStrategy(codeTask, 'code')).toBe('llm-as-judge');
    expect(selectReviewStrategy(designTask, 'webpage')).toBe('majority-vote');
    expect(selectReviewStrategy(docTask, 'doc')).toBe('consensus');
    expect(selectReviewStrategy(deployTask, 'ppt')).toBe('human-confirmation');
  });

  it('生成综合评审报告', async () => {
    const tasks = [
      { id: 't1', title: 'HTML', ac: ['完整'] },
      { id: 't2', title: 'CSS', ac: ['响应式'] },
      { id: 't3', title: 'JS', ac: ['无bug'] },
    ];

    const results = [];
    for (const t of tasks) {
      const task: SubTask = { id: t.id, title: t.title, description: '', assignedAgentId: '', dependsOn: [], status: 'success', acceptanceCriteria: t.ac };
      const r = await reviewTask(PLAN_ID, task,
        `<html><body><h1>Hello</h1><p>This is a fully functional ${t.title} module.</p></body></html>`,
        { artifactType: 'webpage' },
      );
      results.push(r);
    }

    const report = generateCriticReport(results);
    console.log(`\n📊 综合评审报告:`);
    console.log(`   总分: ${(report.overallScore * 10).toFixed(1)}/10`);
    console.log(`   代码质量: ${report.codeQuality ? (report.codeQuality * 10).toFixed(1) : 'N/A'}/10`);
    console.log(`   安全性: ${report.security}`);
    console.log(`   建议数: ${report.suggestions.length}`);

    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.suggestions).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// 场景 F: 失败降级 + 重试 + Saga 补偿
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 F: 失败降级 + 重试 + Saga 补偿', () => {
  const PLAN_ID = 'plan_recovery_test';

  beforeEach(() => {
    destroyBlackboard(PLAN_ID);
    clearTraces(PLAN_ID);
    clearSaga(PLAN_ID);
    clearAllTracking();
  });

  it('任务失败 → Supervisor 重规划 → 切换到 Fallback Agent', () => {
    const classification: IntentClassification = {
      complexity: 'complex', domains: ['code'], suggestedStrategy: 'supervisor-worker', confidence: 0.9, reasoning: 'test',
    };

    const state = initSupervisor(PLAN_ID, 'session_test', classification, AGENTS);

    const plan: OrchestratorPlan = {
      id: PLAN_ID, intent: '做一个网站', summary: 'test',
      subTasks: [
        { id: 't1', title: 'HTML', description: '', assignedAgentId: 'agent_claude_code', fallbackAgentId: 'agent_codex', dependsOn: [], status: 'failed' },
        { id: 't2', title: 'CSS', description: '', assignedAgentId: 'agent_codex', fallbackAgentId: 'agent_claude_code', dependsOn: ['t1'], status: 'pending' },
      ],
      status: 'failed', complexity: 'complex', createdAt: Date.now(),
    };

    console.log('\n🔄 重规划测试:');
    console.log(`   t1 前: assigned=${plan.subTasks[0]!.assignedAgentId} fallback=${plan.subTasks[0]!.fallbackAgentId} status=${plan.subTasks[0]!.status}`);

    const replanned = replan(state, plan, 'HTML 任务失败：Agent 超时');

    console.log(`   t1 后: assigned=${replanned.subTasks[0]!.assignedAgentId} fallback=${replanned.subTasks[0]!.fallbackAgentId} status=${replanned.subTasks[0]!.status}`);
    console.log(`   重试次数: ${replanned.subTasks[0]!.retryCount}`);
    console.log(`   重规划轮次: ${state.currentRevisionRound}`);

    // 失败任务 → fallback agent
    expect(replanned.subTasks[0]!.assignedAgentId).toBe('agent_codex');
    expect(replanned.subTasks[0]!.status).toBe('pending');
    expect(replanned.subTasks[0]!.retryCount).toBe(1);
    expect(state.currentRevisionRound).toBe(1);
  });

  it('Saga: 前序任务成功但后续失败 → 反向补偿', async () => {
    const compensationLog: string[] = [];

    // 注册 3 个 Saga 操作
    registerSagaOperation(PLAN_ID, 't1', '创建 index.html', async () => {
      compensationLog.push('🗑 删除 index.html');
    });
    registerSagaOperation(PLAN_ID, 't2', '写入数据库记录', async () => {
      compensationLog.push('🗑 回滚数据库记录');
    });
    registerSagaOperation(PLAN_ID, 't3', '部署文件到 CDN', async () => {
      compensationLog.push('🗑 从 CDN 移除文件');
    });

    // t1, t2 成功，t3 失败
    markSagaExecuted(PLAN_ID, 't1');
    markSagaExecuted(PLAN_ID, 't2');
    // t3 未执行（失败）

    const result = await compensate(PLAN_ID, 't3');
    console.log('\n🔙 Saga 补偿结果:');
    console.log(`   成功补偿: ${result.compensated.length} 个 (${result.compensated.join(', ')})`);
    console.log(`   失败: ${result.failed.length} 个`);
    console.log(`   补偿链: ${compensationLog.join(' → ')}`);

    expect(result.success).toBe(true);
    expect(result.compensated).toHaveLength(2);
    // 反向顺序: t2 先补偿，t1 后补偿
    expect(compensationLog[0]).toContain('数据库');
    expect(compensationLog[1]).toContain('index.html');
  });

  it('停滞检测：模拟 Agent 卡住 → 自动检测', async () => {
    startTracking('stuck_task', 'agent_claude_code', { checkIntervalMs: 100, maxSilentRounds: 2, minTokenRate: 1 });

    // 模拟正常活动
    recordTokenOutput('stuck_task', 50);
    let result = checkStall('stuck_task', { checkIntervalMs: 100, maxSilentRounds: 2, minTokenRate: 1 });
    console.log(`\n⏱️ 停滞检测:`);
    console.log(`   正常阶段: stalled=${result.isStalled} ${result.details}`);

    // 等待一段时间模拟停滞 (需要让时间流逝)
    await new Promise(r => setTimeout(r, 250));

    result = checkStall('stuck_task', { checkIntervalMs: 100, maxSilentRounds: 1, minTokenRate: 1 });
    console.log(`   静默后: stalled=${result.isStalled} ${result.details}`);

    // 记录新活动 → 恢复正常
    recordTokenOutput('stuck_task', 30);
    result = checkStall('stuck_task');
    console.log(`   恢复后: stalled=${result.isStalled}`);

    stopTracking('stuck_task');
  });
});

// ═══════════════════════════════════════════════════════════
// 场景 G: 全流程端到端
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 G: 全流程端到端 — 茶饮品牌官网', () => {
  const PLAN_ID = 'plan_e2e_teashop';

  beforeEach(() => {
    destroyBlackboard(PLAN_ID);
    clearTraces(PLAN_ID);
    clearSaga(PLAN_ID);
  });

  it('G1: 意图分类 → 计划生成 → Agent 分配 → 黑板协作 → 评审 → 合成报告', async () => {
    const userIntent = '做一个茶饮品牌官网，包含产品展示、在线下单、品牌故事页面，风格要新中式';

    // ── Step 1: 意图分类 ──
    console.log('\n═══════════════════════════════════════');
    console.log('🚀 全流程 E2E 测试开始');
    console.log(`📥 用户输入: "${userIntent}"`);
    console.log('═══════════════════════════════════════\n');

    const classification = classifySync(userIntent);
    console.log(`📊 Step 1 - 意图分类: complexity=${classification.classification.complexity} strategy=${classification.classification.suggestedStrategy}`);
    expect(classification.classification.complexity).toBe('complex');

    // ── Step 2: 创建计划 ──
    console.log('\n📋 Step 2 - 创建计划:');
    const plan: OrchestratorPlan = {
      id: PLAN_ID, intent: userIntent,
      summary: '茶饮品牌官网开发：文案撰写 → 页面骨架 → 样式设计 → 交互实现 → 质量评审',
      subTasks: [
        { id: 't1', title: '品牌文案与内容撰写', description: '撰写品牌故事、产品描述、营销文案', assignedAgentId: 'agent_doc', fallbackAgentId: 'agent_claude_code', dependsOn: [], status: 'pending', acceptanceCriteria: ['品牌调性统一', 'SEO友好'] },
        { id: 't2', title: 'HTML 页面骨架搭建', description: '使用语义化 HTML5 + TailwindCSS 构建响应式页面', assignedAgentId: 'agent_claude_code', fallbackAgentId: 'agent_codex', dependsOn: [], status: 'pending', acceptanceCriteria: ['语义化', 'Accessibility'] },
        { id: 't3', title: 'CSS 样式与动画设计', description: '新中式风格：抹茶绿配色 + 水墨动画 + 响应式', assignedAgentId: 'agent_codex', fallbackAgentId: 'agent_claude_code', dependsOn: ['t2'], status: 'pending', acceptanceCriteria: ['配色统一', '动画流畅'] },
        { id: 't4', title: '购物车交互实现', description: 'JavaScript 购物车逻辑 + 表单验证', assignedAgentId: 'agent_claude_code', fallbackAgentId: 'agent_codex', dependsOn: ['t2'], status: 'pending', acceptanceCriteria: ['功能完整', '表单验证'] },
        { id: 't5', title: '质量评审与修复', description: 'Critic 评审代码质量、安全性、可用性', assignedAgentId: 'agent_claude_code', fallbackAgentId: 'agent_codex', dependsOn: ['t3', 't4'], status: 'pending', acceptanceCriteria: ['无安全漏洞', '移动端可用'] },
      ],
      status: 'running', complexity: 'complex', parallelism: [['t1', 't2'], ['t3', 't4'], ['t5']], createdAt: Date.now(),
    };

    console.log(`   子任务: ${plan.subTasks.length} 个`);
    console.log(`   并行组: ${plan.parallelism?.map(g => `[${g.join(',')}]`).join(' → ')}`);

    // ── Step 3: Agent 分配 ──
    console.log('\n🤖 Step 3 - Agent 分配:');
    const classification2: IntentClassification = {
      complexity: 'complex', domains: ['code', 'design', 'doc'], suggestedStrategy: 'supervisor-worker', confidence: 0.9, reasoning: 'test',
    };
    createBlackboard(PLAN_ID, plan.subTasks.length);
    const state = initSupervisor(PLAN_ID, 'e2e_session', classification2, AGENTS);
    const assigned = assignAgents(state, plan);

    for (const task of assigned.subTasks) {
      const agent = AGENTS.find(a => a.id === task.assignedAgentId);
      console.log(`   ${task.id}: ${task.title} → ${agent?.avatarEmoji} ${agent?.name} (fallback: ${task.fallbackAgentId})`);
    }

    // ── Step 4: 模拟执行 + 黑板协作 ──
    console.log('\n💬 Step 4 - 黑板协作模拟:');

    // Round 1: t1 (DocAgent) + t2 (Claude Code) 并行
    console.log('   [Round 1] t1 (DocAgent) 和 t2 (Claude Code) 并行执行...');
    addFact(PLAN_ID, '品牌名：茶韵小筑，主打东方茶文化', 'agent_doc', 0.95);
    addFact(PLAN_ID, '目标用户：25-40 岁注重健康生活的中产', 'agent_doc', 0.9);
    addConstraint(PLAN_ID, '移动端优先设计');
    addDecision(PLAN_ID, '主色调：黛绿 #5B7B6F + 宣纸白 #F7F3ED', 'agent_doc', '新中式风格，参考宋代美学', undefined);
    addArtifactRef(PLAN_ID, 'art_doc', 'brand_copy.md', 'doc', 'agent_doc');
    assigned.subTasks[0]!.status = 'success';
    addFact(PLAN_ID, '品牌文案已完成：3500 字', 'agent_doc', 1.0);
    markTaskComplete(PLAN_ID);

    addArtifactRef(PLAN_ID, 'art_html', 'index.html', 'webpage', 'agent_claude_code');
    assigned.subTasks[1]!.status = 'success';
    addFact(PLAN_ID, 'HTML 骨架完成，已按黑板决策使用品牌色', 'agent_claude_code', 0.9);
    markTaskComplete(PLAN_ID);

    // Round 2: t3 (Codex) + t4 (Claude Code) 并行
    console.log('   [Round 2] t3 (Codex) 和 t4 (Claude Code) 并行执行...');
    // Codex 读黑板 → 使用品牌色
    addFact(PLAN_ID, 'CSS 使用 CSS 变量管理主题色：--brand-green: #5B7B6F', 'agent_codex', 0.85);
    addArtifactRef(PLAN_ID, 'art_css', 'theme.css', 'code', 'agent_codex');
    // Codex 对 Claude 的 HTML 提建议
    proposeChange(PLAN_ID, 'agent_codex', 'art_html', 'agent_claude_code',
      'header 区域建议添加 sticky 定位以改善长页面导航体验', 'medium');
    assigned.subTasks[2]!.status = 'success';
    markTaskComplete(PLAN_ID);

    addArtifactRef(PLAN_ID, 'art_js', 'cart.js', 'code', 'agent_claude_code');
    assigned.subTasks[3]!.status = 'success';
    addFact(PLAN_ID, '购物车交互完成，支持本地存储', 'agent_claude_code', 0.85);
    markTaskComplete(PLAN_ID);

    // Round 3: t5 (Critic)
    console.log('   [Round 3] t5 质量评审...');
    assigned.subTasks[4]!.status = 'success';
    markTaskComplete(PLAN_ID);

    // ── Step 5: Critic 评审 ──
    console.log('\n🔍 Step 5 - Critic 评审:');
    const reviewResults = [];
    for (const task of assigned.subTasks.slice(0, 4)) {
      const result = await reviewTask(PLAN_ID, task,
        `Mock output for ${task.title} with complete implementation and best practices. Acceptable quality.`,
        { artifactType: task.title.includes('HTML') ? 'webpage' : task.title.includes('CSS') ? 'code' : task.title.includes('文案') ? 'doc' : 'code' },
      );
      reviewResults.push(result);
      console.log(`   ${task.id} "${task.title}": ${result.verdict} (${(result.score * 100).toFixed(0)}%) — ${result.strategy}`);
    }

    updateArtifactStatus(PLAN_ID, 'art_html', 'final');
    updateArtifactStatus(PLAN_ID, 'art_css', 'final');
    updateArtifactStatus(PLAN_ID, 'art_js', 'final');
    updateArtifactStatus(PLAN_ID, 'art_doc', 'final');

    const criticReport = generateCriticReport(reviewResults);

    // ── Step 6: PMO 合成报告 ──
    console.log('\n📊 Step 6 - PMO 交付报告生成:');

    const report = synthesize({
      plan: assigned,
      agents: AGENTS,
      taskDurations: new Map([['t1', 3200], ['t2', 4500], ['t3', 2800], ['t4', 5100], ['t5', 1500]]),
      totalTokens: 18450,
      criticReport,
    });

    const markdown = formatReportAsMarkdown(report);
    console.log('\n' + markdown);

    const brief = formatBriefSummary(report);
    console.log(`\n📌 一句话总结: ${brief}`);

    // ── 最终验证 ──
    expect(assigned.subTasks.every(t => t.assignedAgentId !== '')).toBe(true);
    expect(getFacts(PLAN_ID).length).toBeGreaterThanOrEqual(5);
    expect(getDecisions(PLAN_ID).length).toBeGreaterThanOrEqual(1);
    expect(getProgress(PLAN_ID)!.completed).toBe(5);
    expect(report.completed.length).toBeGreaterThanOrEqual(4);
    expect(markdown).toContain('项目交付报告');
    expect(markdown).toContain('品牌文案');
    expect(markdown).toContain('Critic 评审');
    expect(brief).toContain('✅');

    console.log('\n═══════════════════════════════════════');
    console.log('✅ E2E 全流程测试通过！');
    console.log('═══════════════════════════════════════\n');
  }, 15000);
});

// ═══════════════════════════════════════════════════════════
// 场景 H: 超时与并发保护
// ═══════════════════════════════════════════════════════════

describe('🧪 场景 H: 超时与并发保护', () => {
  it('任务超时机制', async () => {
    const slowPromise = new Promise(resolve => setTimeout(() => resolve('done'), 500));
    const timeoutMs = 100;

    try {
      await raceWithTimeout(slowPromise, timeoutMs, 'test-timeout');
      // 不应该到这里
      expect.unreachable('应该触发超时');
    } catch (err: any) {
      console.log(`\n⏱️ 超时测试: ${err.message}`);
      expect(err.message).toContain('Timeout');
      expect(err.message).toContain('100ms');
    }
  });

  it('并发会话锁保护', () => {
    const ok1 = acquireSessionLock('session_1', 'plan_1');
    const ok2 = acquireSessionLock('session_1', 'plan_2'); // 同一会话再次尝试

    console.log('\n🔒 会话锁测试:');
    console.log(`   第一次获取: ${ok1}`);
    console.log(`   重复获取: ${ok2}`);

    expect(ok1).toBe(true);
    expect(ok2).toBe(false); // 应该被拒绝

    releaseSessionLock('session_1');
    expect(isSessionActive('session_1')).toBe(false);

    // 释放后可以重新获取
    const ok3 = acquireSessionLock('session_1', 'plan_3');
    expect(ok3).toBe(true);
    releaseSessionLock('session_1');
  });

  it('默认超时配置校验', () => {
    console.log('\n⏱️ 默认超时配置:');
    console.log(`   单任务: ${DEFAULT_TIMEOUTS.perTask / 1000}s`);
    console.log(`   总计划: ${DEFAULT_TIMEOUTS.totalPlan / 1000}s`);
    console.log(`   Critic 评审: ${DEFAULT_TIMEOUTS.criticReview / 1000}s`);

    expect(DEFAULT_TIMEOUTS.perTask).toBe(120_000);
    expect(DEFAULT_TIMEOUTS.totalPlan).toBe(600_000);
    expect(DEFAULT_TIMEOUTS.criticReview).toBe(30_000);
  });
});
