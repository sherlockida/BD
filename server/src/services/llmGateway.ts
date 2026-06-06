/**
 * LLM Gateway — unified streaming interface over Anthropic / OpenAI / DeepSeek.
 * Each method returns AsyncIterable<AgentChunk>, matching the frontend IAgent contract.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';

// ── AgentChunk types (mirrors frontend types.ts) ──
export type AgentChunk =
  | { type: 'text'; delta: string }
  | { type: 'code'; language: string; filename?: string; code: string }
  | { type: 'artifact-draft'; artifactType: string; name: string; language?: string; content: string; commitMessage: string }
  | { type: 'tool-call'; tool: string; args: unknown }
  | { type: 'done' }
  | { type: 'error'; error: string };

// ── Message format ──
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmChatParams {
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

// ── Vendor → LLM mapping ──
// 开发阶段全部走 DeepSeek（唯一有 Key 的 provider）
// 生产环境按 vendor 分流：claude-code→anthropic, codex→openai, 其余→deepseek
export type LlmVendor = 'claude-code' | 'codex' | 'open-code' | 'custom' | 'orchestrator';

function mapVendorToProvider(vendor: LlmVendor): 'anthropic' | 'openai' | 'deepseek' {
  // DEV: 全部走 DeepSeek
  if (config.nodeEnv === 'development') return 'deepseek';

  // PROD: 按厂商分流
  switch (vendor) {
    case 'claude-code': return 'anthropic';
    case 'codex':         return 'openai';
    case 'open-code':     return 'deepseek';
    case 'custom':        return 'deepseek';
    case 'orchestrator':  return 'deepseek';
  }
}

// ── Lazy client initialisation ──
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
let _deepseek: OpenAI | null = null;   // DeepSeek uses OpenAI-compatible API

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!config.llm.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    _anthropic = new Anthropic({ apiKey: config.llm.anthropicApiKey });
  }
  return _anthropic;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!config.llm.openaiApiKey) throw new Error('OPENAI_API_KEY not configured');
    _openai = new OpenAI({ apiKey: config.llm.openaiApiKey });
  }
  return _openai;
}

function getDeepSeek(): OpenAI {
  if (!_deepseek) {
    if (!config.llm.deepseekApiKey) throw new Error('DEEPSEEK_API_KEY not configured');
    _deepseek = new OpenAI({
      apiKey: config.llm.deepseekApiKey,
      baseURL: config.llm.deepseekBaseUrl,
    });
  }
  return _deepseek;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/** Main entry: route to the correct provider based on agent vendor. */
export async function* chatWithAgent(
  vendor: LlmVendor,
  params: LlmChatParams,
): AsyncIterable<AgentChunk> {
  const primary = mapVendorToProvider(vendor);

  // Check if primary provider is available
  const available = availableProviders();
  if (!available.includes(primary)) {
    // Smart fallback: use any available provider
    if (available.length === 0) {
      yield { type: 'error', error: 'No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY in .env' };
      return;
    }
    const fallback = available[0]!;
    console.log(`[LLM] ${vendor} → primary ${primary} unavailable, fallback to ${fallback}`);
    yield* chatWithProvider(fallback, params, vendor);
    return;
  }

  yield* chatWithProvider(primary, params, vendor);
}

async function* chatWithProvider(
  provider: string,
  params: LlmChatParams,
  vendor: LlmVendor,
): AsyncIterable<AgentChunk> {
  switch (provider) {
    case 'anthropic': yield* chatWithClaude(params); break;
    case 'openai':    yield* chatWithGPT(params); break;
    case 'deepseek':  yield* chatWithDeepSeek(params); break;
  }
}

/** Check which providers are available (have API keys configured). */
export function availableProviders(): string[] {
  const providers: string[] = [];
  if (config.llm.deepseekApiKey) providers.push('deepseek');
  if (config.llm.openaiApiKey) providers.push('openai');
  if (config.llm.anthropicApiKey) providers.push('anthropic');
  return providers;
}

// ────────────────────────────────────────────────────────────
// Provider implementations
// ────────────────────────────────────────────────────────────

async function* chatWithClaude(params: LlmChatParams): AsyncIterable<AgentChunk> {
  const client = getAnthropic();
  const systemPrompt = params.systemPrompt;

  // Convert our messages to Anthropic format (no 'system' role in messages array)
  const anthropicMessages = params.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', delta: event.delta.text };
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        yield {
          type: 'tool-call',
          tool: event.content_block.name,
          args: event.content_block.input,
        };
      }
    }
    yield { type: 'done' };
  } catch (err: any) {
    yield { type: 'error', error: `Claude API error: ${err.message}` };
  }
}

async function* chatWithGPT(params: LlmChatParams): AsyncIterable<AgentChunk> {
  const client = getOpenAI();
  const gptMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (params.systemPrompt) {
    gptMessages.push({ role: 'system', content: params.systemPrompt });
  }
  for (const m of params.messages) {
    gptMessages.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content });
  }

  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-5',
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages: gptMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: 'text', delta };
      }
    }
    yield { type: 'done' };
  } catch (err: any) {
    yield { type: 'error', error: `OpenAI API error: ${err.message}` };
  }
}

async function* chatWithDeepSeek(params: LlmChatParams): AsyncIterable<AgentChunk> {
  const client = getDeepSeek();
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  for (const m of params.messages) {
    messages.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content });
  }

  try {
    const stream = await client.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: 'text', delta };
      }
    }
    yield { type: 'done' };
  } catch (err: any) {
    yield { type: 'error', error: `DeepSeek API error: ${err.message}` };
  }
}

// ────────────────────────────────────────────────────────────
// Non-streaming chat (for Planner, Aggregator, etc.)
// ────────────────────────────────────────────────────────────

export async function chatWithAgentSync(
  vendor: LlmVendor,
  params: LlmChatParams,
): Promise<string> {
  const primary = mapVendorToProvider(vendor);
  const available = availableProviders();
  const provider = available.includes(primary) ? primary
    : available.length > 0 ? available[0]!
    : (() => { throw new Error('No LLM provider configured'); })();

  if (provider === 'anthropic') {
    const client = getAnthropic();
    const anthropicMessages = params.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      system: params.systemPrompt,
      messages: anthropicMessages,
    });
    const block = response.content.find(b => b.type === 'text');
    return block?.type === 'text' ? block.text : '';
  }

  // OpenAI / DeepSeek (both use OpenAI-compatible API)
  const client = provider === 'openai' ? getOpenAI() : getDeepSeek();
  const model = provider === 'openai' ? 'gpt-5' : 'deepseek-chat';

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  for (const m of params.messages) {
    messages.push({ role: m.role as 'user' | 'assistant' | 'system', content: m.content });
  }

  const response = await client.chat.completions.create({
    model,
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.3,
    messages,
  });

  return response.choices[0]?.message?.content ?? '';
}
