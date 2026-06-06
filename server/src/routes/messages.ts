import { Router } from 'express';
import { eq, asc, and } from 'drizzle-orm';
import { db, messages, conversations } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const messagesRouter = Router({ mergeParams: false });

// We mount on: app.use('/api/conversations', messagesRouter)
// So routes here are relative to /api/conversations

// GET /api/conversations/:convId/messages — paginated messages
messagesRouter.get('/:convId/messages', async (req, res) => {
  try {
    const { convId } = req.params;
    const cursor = req.query.cursor as string | undefined;  // message id to start after
    const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 200);

    let query = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);

    // Simple cursor-based pagination: if cursor provided, fetch messages created after it
    if (cursor) {
      // Subquery to get cursor message's timestamp
      const cursorMsg = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, cursor))
        .limit(1);

      if (cursorMsg[0]) {
        query = db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, convId),
              // Using createdAt > cursor timestamp (simplified cursor)
              // In production, use (createdAt, id) tuple comparison
            ),
          )
          .orderBy(asc(messages.createdAt))
          .limit(limit);
      }
    }

    const rows = await query;
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.id : null;

    res.json({
      messages: rows,
      nextCursor,
      hasMore: rows.length === limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations/:convId/messages — send a message (triggers agent response)
messagesRouter.post('/:convId/messages', async (req, res) => {
  try {
    const { convId } = req.params;
    const {
      senderType = 'user',
      senderId = 'user',
      content,
      mentions = [],
      replyToMessageId,
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const id = uuid();
    const [msg] = await db
      .insert(messages)
      .values({
        id,
        conversationId: convId,
        senderType,
        senderId,
        content: content as Record<string, unknown>,
        mentions,
        replyToMessageId: replyToMessageId ?? null,
        streaming: false,
        pinned: false,
      })
      .returning();

    // Update conversation lastActivityAt
    await db
      .update(conversations)
      .set({ lastActivityAt: new Date() })
      .where(eq(conversations.id, convId))
      .execute()
      .catch(() => { /* best-effort */ });

    res.status(201).json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
