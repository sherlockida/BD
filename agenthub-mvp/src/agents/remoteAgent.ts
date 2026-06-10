/**
 * RemoteAgent — real LLM agent via backend SSE proxy.
 *
 * Replaces Mock BaseAgent.generate() with actual network calls to
 * POST /api/agents/chat (SSE streaming).
 *
 * Migration path:
 *   1. Import RemoteAgent instead of Mock adapters
 *   2. Pass the same meta object (vendor mapped to LLM provider by backend)
 *   3. chat() yields real LLM streaming chunks through the SSE pipeline
 *
 * W3 fix（T4/T5/T6）：后端只吐 text delta，不会主动产 artifact-draft。
 * 这里在前端用 fenceExtractor 解析 ```lang ... ``` 围栏，
 * 把代码块抽成 artifact-draft，让右侧产物面板正常出现 Code/Diff/Preview。
 */
import type { IAgent, Agent, AgentInput, AgentChunk } from '../types';
import { streamAgentChat } from '../api/client';
import { createFenceExtractor } from './fenceExtractor';

export class RemoteAgent implements IAgent {
  meta: Agent;

  constructor(meta: Agent) {
    this.meta = meta;
  }

  async *chat(input: AgentInput): AsyncIterable<AgentChunk> {
    const history = input.history ?? [];

    // Convert frontend Message[] to backend message format
    const messages = history
      .filter(m => m.senderType !== 'system' || m.content.kind === 'text')
      .map(m => ({
        role: m.senderType === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content.kind === 'text' ? m.content.text : JSON.stringify(m.content),
      }));

    // Phase 2: inject upstream context into system prompt
    const upstreamCtx = input.upstreamContext;
    const effectiveSystemPrompt = upstreamCtx
      ? (this.meta.systemPrompt ?? '') + `\n\n## 上游任务上下文\n${upstreamCtx}`
      : this.meta.systemPrompt;
    const extractor = createFenceExtractor();

    try {
      for await (const chunk of streamAgentChat(
        this.meta.id,
        input.userPrompt,
        messages,
        effectiveSystemPrompt,
      )) {
        // Map API chunk types to frontend AgentChunk types
        switch (chunk.type) {
          case 'text': {
            // 把流式 text delta 喂给围栏解析器；它会决定哪些转成 artifact-draft
            for (const ch of extractor.feed(chunk.delta ?? '')) {
              yield ch;
            }
            break;
          }
          case 'code':
            // 后端如果已经显式给了 code chunk，直接透传（保留旧接口兼容）
            yield {
              type: 'code',
              language: chunk.language ?? 'text',
              filename: chunk.filename,
              code: chunk.code ?? '',
            };
            break;
          case 'artifact-draft':
            yield {
              type: 'artifact-draft',
              artifactType: (chunk.artifactType as any) ?? 'code',
              name: chunk.name ?? 'untitled',
              language: chunk.language,
              content: chunk.content ?? '',
              commitMessage: chunk.commitMessage ?? 'Agent update',
            };
            break;
          case 'tool-call':
            yield { type: 'tool-call', tool: chunk.tool ?? '', args: chunk.args };
            break;
          case 'ui-component':
            // Phase 3: forward GenUI component from backend (ChoiceCards etc.)
            yield {
              type: 'ui-component',
              component: (chunk as any).component ?? 'unknown',
              props: (chunk as any).props ?? {},
            };
            break;
          case 'error':
            // flush 剩余缓冲再退出，避免吞掉用户已经看到的内容
            for (const ch of extractor.flush()) yield ch;
            yield { type: 'error', error: chunk.error ?? 'Unknown error' };
            return;
          case 'done':
            for (const ch of extractor.flush()) yield ch;
            yield { type: 'done' };
            return;
        }
      }
      for (const ch of extractor.flush()) yield ch;
      yield { type: 'done' };
    } catch (err: any) {
      yield { type: 'error', error: `Connection error: ${err.message}` };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch('/api/agents');
      return res.ok;
    } catch {
      return false;
    }
  }
}
