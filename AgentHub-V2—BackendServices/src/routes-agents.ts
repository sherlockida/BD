// ─────────────────────────────────────────────────────────────
// Agents Route Handlers — Patch Functions
// POST /api/agents/ui-input handler for GenUI component interaction
// ─────────────────────────────────────────────────────────────

import { createWakeupMessage } from './plannerService';

/**
 * Dependency interface for uiInputHandler.
 * Callers must inject concrete implementations for DB and agent orchestration.
 */
export interface UiInputDeps {
  /** Fetch a conversation by its ID */
  getConversation: (id: string) => Promise<{ id: string } | null>;
  /** Insert a system message into a conversation's message history */
  insertMessage: (
    conversationId: string,
    message: { senderType: string; content: { role: string; content: string } },
  ) => Promise<void>;
  /** Find the last agent in the conversation that was awaiting user input */
  findLastAwaitingInputAgent: (
    conversationId: string,
  ) => Promise<{ id: string } | null>;
  /** Resume a chat session with an agent */
  chatWithAgent: (
    agent: { id: string },
    options: {
      conversation: { id: string };
      history: unknown[];
      resumeFromAwaitingInput: boolean;
    },
  ) => Promise<void>;
}

/**
 * Handle a POST /api/agents/ui-input request.
 *
 * Accepts user interaction data from a GenUI component, creates a
 * wake-up system message, inserts it into the conversation history,
 * and resumes the awaiting agent.
 *
 * All database and orchestration dependencies are injected via `deps`
 * to keep this function testable and side-effect-free.
 *
 * @param body — Request body with conversationId, componentId, and value
 * @param deps — Injected dependencies for DB and agent operations
 * @returns { success: true } on success
 * @throws Error if validation fails, conversation is not found, or no awaiting agent
 */
export async function uiInputHandler(
  body: { conversationId: string; componentId: string; value: unknown },
  deps: UiInputDeps,
): Promise<{ success: boolean }> {
  // 1. Validate required fields
  if (!body.conversationId || !body.componentId || body.value === undefined) {
    throw new Error(
      'Missing required fields: conversationId, componentId, value',
    );
  }

  // 2. Find conversation
  const conversation = await deps.getConversation(body.conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${body.conversationId}`);
  }

  // 3. Create wakeup message
  const wakeupMsg = createWakeupMessage(body.componentId, body.value);

  // 4. Insert wakeup message into conversation history
  await deps.insertMessage(body.conversationId, {
    senderType: 'system',
    content: wakeupMsg,
  });

  // 5. Find the agent that was awaiting input and resume it
  const lastAwaitingAgent = await deps.findLastAwaitingInputAgent(
    body.conversationId,
  );
  if (!lastAwaitingAgent) {
    throw new Error(
      `No agent awaiting input found for conversation: ${body.conversationId}`,
    );
  }

  await deps.chatWithAgent(lastAwaitingAgent, {
    conversation: { id: body.conversationId },
    history: [wakeupMsg],
    resumeFromAwaitingInput: true,
  });

  return { success: true };
}
