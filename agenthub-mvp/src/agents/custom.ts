import { BaseAgent } from './base';
import type { Agent, AgentChunk, AgentInput } from '../types';

/**
 * 自建 Agent 适配器
 * 接到 systemPrompt 后，根据 prompt 关键词做最简启发式回复
 * 真实接入只需把 generate() 改成把 systemPrompt + history + userPrompt 打到任意 LLM 即可。
 */
export class CustomAgent extends BaseAgent {
  meta: Agent;

  constructor(meta: Agent) {
    super();
    this.meta = meta;
  }

  protected async generate(input: AgentInput): Promise<AgentChunk[]> {
    const prompt = (input.task?.description || input.userPrompt).toLowerCase();
    const out: AgentChunk[] = [];

    // DocAgent 人设：擅长写品牌文案与文档
    if (this.meta.capabilities.includes('doc')) {
      if (/文案|copy|品牌|故事|文档|介绍|spec|prd/.test(prompt)) {
        out.push({
          type: 'text',
          delta: '我来写一段品牌故事，放在 Hero 区。\n\n',
        });
        out.push({
          type: 'artifact-draft',
          artifactType: 'doc',
          name: 'brand-copy.md',
          commitMessage: 'docs: 品牌故事文案 v1',
          content: `# 青叶茶事 · 品牌故事

> 三年前，主理人在云南古茶山找到一棵 300 年的古树。
> 一杯泡开，时间像被对折——童年外婆灶台上的那把铜壶咕嘟作响，茶香从竹席缝里钻出来。
>
> 我们想把这杯茶送到更多人手里。
> 不加任何香精、不拼配廉价底料、不做花哨概念。
> **一杯好茶，从一片叶子开始。**

## 我们承诺
- 单一山头、单一产区
- 第三方机构每批次抽检
- 七天不满意，全额退款
`,
        });
        return out;
      }
    }

    // 默认按 systemPrompt 的"人设"回一句
    out.push({
      type: 'text',
      delta: `（${this.meta.name}）已收到："${input.userPrompt.slice(0, 40)}"。我会基于我的角色（${this.meta.tagline}）来回复。`,
    });
    return out;
  }
}
