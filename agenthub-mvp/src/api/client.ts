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

/** Extract error message from backend JSON response, fallback to HTTP status */
async function readError(res: Response, fallback: string): Promise<Error> {
  try {
    const body = await res.json();
    const msg = body?.error ?? body?.message ?? fallback;
    return new Error(msg);
  } catch {
    return new Error(fallback);
  }
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
    id?: string;
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

// ── Artifacts ──
export interface ArtifactDTO {
  id: string;
  conversationId: string | null;
  type: string;
  name: string;
  language: string | null;
  latestVersionId: string | null;
  createdBy: string | null;
  createdAt: string;
  versions?: ArtifactVersionDTO[];
}

export interface ArtifactVersionDTO {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  authorAgentId: string;
  commitMessage: string;
  createdAt: string;
}

export async function listArtifacts(conversationId?: string): Promise<ArtifactDTO[]> {
  const url = conversationId
    ? `${API_BASE}/artifacts?conversationId=${encodeURIComponent(conversationId)}`
    : `${API_BASE}/artifacts`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

export async function getArtifact(id: string): Promise<ArtifactDTO | null> {
  const res = await fetch(`${API_BASE}/artifacts/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createArtifact(body: {
  id?: string;
  versionId?: string;
  conversationId?: string;
  type: string;
  name: string;
  language?: string;
  content: string;
  authorAgentId: string;
  commitMessage: string;
}): Promise<ArtifactDTO> {
  const res = await fetch(`${API_BASE}/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, `Failed to create artifact: ${res.status}`);
  return res.json();
}

export async function addArtifactVersion(
  artifactId: string,
  body: { id?: string; content: string; authorAgentId: string; commitMessage: string },
): Promise<ArtifactVersionDTO> {
  const res = await fetch(`${API_BASE}/artifacts/${artifactId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, `Failed to add version: ${res.status}`);
  return res.json();
}

export async function rollbackArtifact(artifactId: string, versionId: string): Promise<ArtifactVersionDTO> {
  const res = await fetch(`${API_BASE}/artifacts/${artifactId}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId }),
  });
  if (!res.ok) throw await readError(res, `Failed to rollback: ${res.status}`);
  return res.json();
}

// ── Delete artifact ──
export async function deleteArtifact(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/artifacts/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await readError(res, `Failed to delete artifact: ${res.status}`);
}

export async function deleteArtifactVersion(artifactId: string, versionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/artifacts/${artifactId}/versions/${versionId}`, { method: 'DELETE' });
  if (!res.ok) throw await readError(res, `Failed to delete version: ${res.status}`);
}

// ── Skills ──
export interface SkillDTO {
  id: string;
  name: string;
  triggerCondition: string;
  description: string | null;
  steps: string[] | null;
  source: string;
  conversationId: string | null;
  createdAt: string;
}

export async function listSkills(): Promise<SkillDTO[]> {
  const res = await fetch(`${API_BASE}/skills`);
  if (!res.ok) return [];
  return res.json();
}

export async function createSkill(body: {
  id?: string;
  name: string;
  triggerCondition: string;
  description?: string;
  steps?: string[];
  source?: string;
  conversationId?: string;
}): Promise<SkillDTO> {
  const res = await fetch(`${API_BASE}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to create skill: ${res.status}`);
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

// ── Deploy ──
export interface DeployDTO {
  id: string;
  artifactId: string;
  step: string;
  progress: number;
  url: string | null;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export async function triggerDeploy(artifactId: string): Promise<DeployDTO> {
  const res = await fetch(`${API_BASE}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifactId }),
  });
  if (!res.ok) throw new Error(`Failed to trigger deploy: ${res.status}`);
  return res.json();
}

export async function getDeployStatus(deployId: string): Promise<DeployDTO> {
  const res = await fetch(`${API_BASE}/deploy/${deployId}/status`);
  if (!res.ok) throw new Error(`Failed to get deploy status: ${res.status}`);
  return res.json();
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
