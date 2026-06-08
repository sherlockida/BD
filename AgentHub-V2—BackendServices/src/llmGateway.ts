// ─────────────────────────────────────────────────────────────
// LLM Gateway — Patch Functions
// Appends catalog instructions to LLM system prompts
// ─────────────────────────────────────────────────────────────

import { CATALOG_SYSTEM_PROMPT } from './genuiCatalog';

/**
 * Append the GenUI catalog system prompt instructions to an
 * existing system prompt.
 *
 * This is a pure function; it returns a new string and does
 * not mutate the input.
 *
 * @param systemPrompt — The original system prompt text
 * @returns The original prompt with catalog instructions appended
 */
export function patchSystemPrompt(systemPrompt: string): string {
  return systemPrompt + '\n\n' + CATALOG_SYSTEM_PROMPT;
}
