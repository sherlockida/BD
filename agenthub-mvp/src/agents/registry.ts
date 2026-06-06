import type { Agent, IAgent } from '../types';
import { RemoteAgent } from './remoteAgent';
import { CustomAgent } from './custom';
import { ClaudeCodeAgent } from './claudeCode';
import { CodexAgent } from './codex';
import { OpenCodeAgent } from './openCode';

/**
 * Agent 注册中心：负责实例化、查找、健康检查、降级路由。
 *
 * W2 upgrade: 主流 Agent 使用 RemoteAgent（调用后端 LLM Gateway），
 * 保留 Mock Adapter 引用作为 fallback。
 */
class AgentRegistry {
  private instances = new Map<string, IAgent>();
  private useRealApi = true;  // toggle for fallback

  constructor() {
    // ── W2: 真实 API（RemoteAgent → 后端 → LLM）──
    this.register(new RemoteAgent({
      id: 'agent_claude_code',
      name: 'Claude Code',
      avatarEmoji: '🧠',
      avatarColor: 'bg-orange-500',
      vendor: 'claude-code',
      capabilities: ['code', 'plan', 'doc', 'design'],
      tagline: '严谨的全栈工程师，擅长 React/TS 组件设计与可维护代码',
      systemPrompt: '你是一位资深全栈工程师。写代码时：1) 使用现代最佳实践 2) 代码带注释 3) 输出完整可直接运行的文件 4) 先解释思路再写代码。',
      online: true,
    }));

    this.register(new RemoteAgent({
      id: 'agent_codex',
      name: 'Codex',
      avatarEmoji: '🎨',
      avatarColor: 'bg-purple-500',
      vendor: 'codex',
      capabilities: ['code', 'design'],
      tagline: 'CSS 与动效高手，擅长样式打磨与视觉设计',
      systemPrompt: '你是一位 UI/UX 设计专家，擅长 CSS、动画与响应式设计。写样式时：1) 优先使用 TailwindCSS 2) 注重细节和交互体验 3) 确保移动端适配。',
      online: true,
    }));

    this.register(new RemoteAgent({
      id: 'agent_open_code',
      name: 'OpenCode',
      avatarEmoji: '🔧',
      avatarColor: 'bg-green-500',
      vendor: 'open-code',
      capabilities: ['code', 'deploy'],
      tagline: 'DevOps 全栈，擅长部署流水线、CI/CD 配置',
      systemPrompt: '你是一位 DevOps 工程师，擅长部署、CI/CD、自动化脚本。回复简洁实用，给出可直接运行的配置和命令。',
      online: true,
    }));

    // ── 内置自建 Agent ──
    this.register(new RemoteAgent({
      id: 'agent_doc',
      name: 'DocAgent',
      avatarEmoji: '✍️',
      avatarColor: 'bg-pink-500',
      vendor: 'custom',
      capabilities: ['doc'],
      tagline: '品牌文案与文档专家（用户自建）',
      systemPrompt: '你是一位品牌文案专家，写文字克制、有故事感、有质感。',
      isCustom: true,
      online: true,
    }));

    // Keep mock references for fallback
    this._mockClaude = new ClaudeCodeAgent();
    this._mockCodex = new CodexAgent();
    this._mockOpenCode = new OpenCodeAgent();
  }

  private _mockClaude?: IAgent;
  private _mockCodex?: IAgent;
  private _mockOpenCode?: IAgent;

  register(agent: IAgent) {
    this.instances.set(agent.meta.id, agent);
  }

  /** 注册一个用户自建 Agent，返回 meta */
  createCustom(opts: {
    name: string;
    tagline: string;
    capabilities: Agent['capabilities'];
    systemPrompt: string;
    avatarEmoji?: string;
    avatarColor?: string;
  }): Agent {
    const id = `agent_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const meta: Agent = {
      id,
      name: opts.name,
      avatarEmoji: opts.avatarEmoji ?? '🤖',
      avatarColor: opts.avatarColor ?? 'bg-emerald-500',
      vendor: 'custom',
      capabilities: opts.capabilities,
      tagline: opts.tagline,
      systemPrompt: opts.systemPrompt,
      isCustom: true,
      online: true,
    };
    this.register(new RemoteAgent(meta));
    return meta;
  }

  get(id: string): IAgent | undefined {
    return this.instances.get(id);
  }

  all(): IAgent[] {
    return [...this.instances.values()];
  }

  allMeta(): Agent[] {
    return this.all().map(a => a.meta);
  }

  /** 根据能力找出最匹配的 agent，优先非 custom 的主流厂商 */
  findByCapability(cap: Agent['capabilities'][number]): IAgent | undefined {
    const candidates = this.all().filter(a => a.meta.capabilities.includes(cap) && a.meta.online);
    if (candidates.length === 0) return undefined;
    // 优先非 custom
    candidates.sort((a, b) => Number(!!a.meta.isCustom) - Number(!!b.meta.isCustom));
    return candidates[0];
  }
}

export const agentRegistry = new AgentRegistry();
