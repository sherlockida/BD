import type { Agent, OrchestratorPlan, SubTask } from '../types';
import { uid } from '../utils/id';
import { agentRegistry } from '../agents/registry';

/**
 * Planner — 任务拆解
 *
 * 真实接入：把 intent + 可用 agents 喂给 LLM，让它输出符合 JSON Schema 的 DAG。
 * MVP：用关键词启发式 + 内置 4~5 种"剧本"，覆盖典型场景。
 */
export function plan(intent: string, availableAgents: Agent[]): OrchestratorPlan {
  const lower = intent.toLowerCase();
  const planId = uid('plan');
  const has = (id: string) => availableAgents.some(a => a.id === id);
  const pick = (preferIds: string[], cap: Agent['capabilities'][number]) => {
    for (const id of preferIds) if (has(id)) return id;
    // 回落：注册中心找
    const fb = agentRegistry.findByCapability(cap);
    return fb?.meta.id ?? availableAgents[0]?.id ?? 'agent_open_code';
  };

  // 场景 A：做落地页 / H5 / 官网（最复杂，4 个子任务）
  if (/落地页|官网|网站|网页|h5|页面|站点/.test(lower)) {
    const docAgent = pick(['agent_doc', 'agent_open_code'], 'doc');
    const claude = pick(['agent_claude_code'], 'code');
    const codex = pick(['agent_codex'], 'design');
    const deploy = pick(['agent_open_code'], 'deploy');

    const t1: SubTask = {
      id: uid('task'),
      title: '撰写品牌文案',
      description: `根据用户意图撰写品牌故事 / Hero 文案 / 卖点：${intent}`,
      assignedAgentId: docAgent,
      fallbackAgentId: 'agent_open_code',
      dependsOn: [],
      status: 'pending',
    };
    const t2: SubTask = {
      id: uid('task'),
      title: '搭建页面骨架',
      description: `用 React/HTML 输出落地页骨架（Hero / Features / Footer / 表单）：${intent}`,
      assignedAgentId: claude,
      fallbackAgentId: 'agent_open_code',
      dependsOn: [],
      status: 'pending',
    };
    const t3: SubTask = {
      id: uid('task'),
      title: '样式与动效',
      description: `为落地页打磨配色与入场动画`,
      assignedAgentId: codex,
      fallbackAgentId: 'agent_open_code',
      dependsOn: [t2.id],
      status: 'pending',
    };
    const t4: SubTask = {
      id: uid('task'),
      title: '部署上线',
      description: `把落地页部署到 Vercel / 本地预览`,
      assignedAgentId: deploy,
      dependsOn: [t3.id],
      status: 'pending',
    };

    return {
      id: planId,
      intent,
      summary: '已拆解为 4 个子任务：3 个并行（文案/骨架/样式）+ 1 个串行（部署）',
      subTasks: [t1, t2, t3, t4],
      status: 'planning',
    };
  }

  // 场景 B：写一个表单 / 组件
  if (/表单|form|组件|component|留资/.test(lower)) {
    const claude = pick(['agent_claude_code'], 'code');
    const codex = pick(['agent_codex'], 'design');
    const t1: SubTask = {
      id: uid('task'),
      title: '实现组件代码',
      description: intent,
      assignedAgentId: claude,
      fallbackAgentId: 'agent_open_code',
      dependsOn: [],
      status: 'pending',
    };
    const t2: SubTask = {
      id: uid('task'),
      title: '样式优化',
      description: `为「${intent}」打磨样式与交互细节`,
      assignedAgentId: codex,
      fallbackAgentId: 'agent_open_code',
      dependsOn: [t1.id],
      status: 'pending',
    };
    return {
      id: planId,
      intent,
      summary: '拆解为 2 个子任务：组件实现（Claude Code）→ 样式优化（Codex）',
      subTasks: [t1, t2],
      status: 'planning',
    };
  }

  // 场景 C：部署
  if (/部署|deploy|上线/.test(lower)) {
    const deploy = pick(['agent_open_code'], 'deploy');
    return {
      id: planId,
      intent,
      summary: '部署任务，单 agent 执行',
      subTasks: [{
        id: uid('task'),
        title: '部署',
        description: intent,
        assignedAgentId: deploy,
        dependsOn: [],
        status: 'pending',
      }],
      status: 'planning',
    };
  }

  // 场景 D：写文档
  if (/文档|文案|说明|spec|prd|介绍|确认\s*spec/i.test(lower)) {
    const docAgent = pick(['agent_doc', 'agent_open_code'], 'doc');
    return {
      id: planId,
      intent,
      summary: '文档撰写任务',
      subTasks: [{
        id: uid('task'),
        title: '撰写文档',
        description: intent,
        assignedAgentId: docAgent,
        // 防御：DocAgent 在后端历史版本里未注册时，降级到 OpenCode 完成
        fallbackAgentId: 'agent_open_code',
        dependsOn: [],
        status: 'pending',
      }],
      status: 'planning',
    };
  }

  // 默认：用 Claude Code 接手
  return {
    id: planId,
    intent,
    summary: '通用任务：单 agent 执行',
    subTasks: [{
      id: uid('task'),
      title: '响应用户请求',
      description: intent,
      assignedAgentId: pick(['agent_claude_code'], 'code'),
      fallbackAgentId: 'agent_open_code',
      dependsOn: [],
      status: 'pending',
    }],
    status: 'planning',
  };
}
