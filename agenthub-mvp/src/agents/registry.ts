import type { Agent, IAgent } from '../types';
import { ClaudeCodeAgent } from './claudeCode';
import { CodexAgent } from './codex';
import { OpenCodeAgent } from './openCode';
import { CustomAgent } from './custom';

/**
 * Agent 注册中心：负责实例化、查找、健康检查、降级路由
 */
class AgentRegistry {
  private instances = new Map<string, IAgent>();

  constructor() {
    // 内置 3 个主流 Agent
    this.register(new ClaudeCodeAgent());
    this.register(new CodexAgent());
    this.register(new OpenCodeAgent());

    // 内置 1 个示例自建 Agent
    this.register(
      new CustomAgent({
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
      }),
    );
  }

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
    this.register(new CustomAgent(meta));
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
