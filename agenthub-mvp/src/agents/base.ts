import type { IAgent, AgentInput, AgentChunk, Agent } from '../types';
import { sleep } from '../utils/id';

/**
 * BaseAgent — 通用流式骨架。
 * 子类只需要：
 *   - 提供 meta
 *   - 实现 generate(input): Promise<AgentChunk[]>  返回完整 chunk 序列
 * BaseAgent 会按字模拟流式吐字（仅对 text/code 类型）
 */
export abstract class BaseAgent implements IAgent {
  abstract meta: Agent;
  protected abstract generate(input: AgentInput): Promise<AgentChunk[]>;

  /** 模拟流式：按字 yield */
  async *chat(input: AgentInput): AsyncIterable<AgentChunk> {
    let chunks: AgentChunk[];
    try {
      chunks = await this.generate(input);
    } catch (e: any) {
      yield { type: 'error', error: e?.message ?? String(e) };
      return;
    }

    for (const chunk of chunks) {
      if (chunk.type === 'text') {
        // 把整段 text 拆成 5~9 字符为一组 yield，模拟流式
        const delta = chunk.delta;
        const step = 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < delta.length; i += step) {
          yield { type: 'text', delta: delta.slice(i, i + step) };
          // 留点节奏感
          await sleep(20 + Math.random() * 25);
        }
      } else {
        yield chunk;
        await sleep(120 + Math.random() * 80);
      }
    }
    yield { type: 'done' };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
