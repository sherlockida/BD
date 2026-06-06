/**
 * AgentHub API client — thin wrapper around fetch for backend REST + SSE endpoints.
 *
 * Backend base URL: http://localhost:3001 (configurable via env / Vite proxy)
 */

const API_BASE = '/api';

// ── Types ──
export interface ConversationDTO {
  id: string;
  type: 'single' | 'group';
  title: string;
  memberAgentIds: string[];
  pinnedMessageIds: string[];
  archived: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderType: 'user' | 'agent' | 'system';
  senderId: string;
  content: Record<string, unknown>;
  mentions: string[];
  replyToMessageId: string | null;
  streaming: boolean;
  pinned: boolean;
  createdAt: string;
}

export interface AgentMeta {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  vendor: string;
  capabilities: string[];
  tagline: string;
  systemPrompt?: string;
  online: boolean;
}

// ── Conversations ──
export async function listConversations(archived = false): Promise<ConversationDTO[]> {
  const res = await fetch(`${API_BASE}/conversations?archived=${archived}`);
  if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
  return res.json();
}

export async function createConversation(body: {
  type: 'single' | 'group';
  title: string;
  memberAgentIds: string[];
}): Promise<ConversationDTO> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  return res.json();
}

// ── Messages ──
export async function listMessages(
  convId: string,
  cursor?: string,
  limit = 50,
): Promise<{ messages: MessageDTO[]; nextCursor: string | null; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${API_BASE}/conversations/${convId}/messages?${params}`);
  if (!res.ok) throw new Error(`Failed to list messages: ${res.status}`);
  return res.json();
}

export async function postMessage(
  convId: string,
  body: {
    senderType?: 'user' | 'agent';
    senderId?: string;
    content: Record<string, unknown>;
    mentions?: string[];
    replyToMessageId?: string;
  },
): Promise<MessageDTO> {
  const res = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to post message: ${res.status}`);
  return res.json();
}

// ── Agents ──
export async function listAgents(): Promise<AgentMeta[]> {
  const res = await fetch(`${API_BASE}/agents`);
  if (!res.ok) throw new Error(`Failed to list agents: ${res.status}`);
  return res.json();
}

export async function getAvailableProviders(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/agents/providers`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.providers ?? [];
}

// ── Custom Agent ──
export async function createCustomAgent(body: {
  name: string;
  tagline: string;
  capabilities: string[];
  systemPrompt: string;
  avatarEmoji?: string;
  avatarColor?: string;
}): Promise<AgentMeta> {
  const res = await fetch(`${API_BASE}/agents/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create custom agent: ${res.status}`);
  return res.json();
}

// ── Agent Chat (SSE streaming) ──
export interface AgentChunk {
  type: 'text' | 'code' | 'artifact-draft' | 'tool-call' | 'done' | 'error';
  delta?: string;
  language?: string;
  filename?: string;
  code?: string;
  artifactType?: string;
  name?: string;
  content?: string;
  commitMessage?: string;
  tool?: string;
  args?: unknown;
  error?: string;
}

/**
 * Stream agent chat via SSE. Returns an async iterable of AgentChunk.
 */
export async function* streamAgentChat(
  agentId: string,
  userPrompt: string,
  messages: Array<{ role: string; content: string }> = [],
  systemPrompt?: string,
): AsyncIterable<AgentChunk> {
  const res = await fetch(`${API_BASE}/agents/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, userPrompt, messages, systemPrompt }),
  });

  if (!res.ok) {
    const err = await res.text();
    yield { type: 'error', error: `API error ${res.status}: ${err}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const chunk: AgentChunk = JSON.parse(line.slice(6));
            yield chunk;
            if (chunk.type === 'done' || chunk.type === 'error') return;
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Planner ──
export async function planTasks(intent: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/agents/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent }),
  });
  if (!res.ok) throw new Error(`Failed to plan: ${res.status}`);
  return res.json();
}
