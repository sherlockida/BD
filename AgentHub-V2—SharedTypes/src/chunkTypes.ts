// ─────────────────────────────────────────────────────────────
// V2 Extended AgentChunk types + type guards
// ─────────────────────────────────────────────────────────────

import type { AgentChunk } from '../../../agenthub-mvp/src/types';
import type { UiComponentChunk } from './types';

/**
 * V2 union of all possible chunk types.
 * Includes legacy v1.1 chunks, the new GenUI component chunk,
 * and a lightweight user-input acknowledgment chunk.
 */
export type AgentChunkV2 =
  | AgentChunk
  | UiComponentChunk
  | { type: 'ui-input'; componentId: string; value: unknown };

// ────── Type Guards ──────

export function isUiComponent(chunk: AgentChunkV2): chunk is UiComponentChunk {
  return chunk.type === 'ui-component';
}

export function isTextChunk(
  chunk: AgentChunkV2,
): chunk is AgentChunk & { type: 'text' } {
  return chunk.type === 'text';
}

export function isArtifactDraft(
  chunk: AgentChunkV2,
): chunk is AgentChunk & { type: 'artifact-draft' } {
  return chunk.type === 'artifact-draft';
}

export function isCodeChunk(
  chunk: AgentChunkV2,
): chunk is AgentChunk & { type: 'code' } {
  return chunk.type === 'code';
}

export function isDoneChunk(
  chunk: AgentChunkV2,
): chunk is AgentChunk & { type: 'done' } {
  return chunk.type === 'done';
}

export function isErrorChunk(
  chunk: AgentChunkV2,
): chunk is AgentChunk & { type: 'error' } {
  return chunk.type === 'error';
}
