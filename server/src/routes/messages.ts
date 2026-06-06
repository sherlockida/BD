import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db, messages, conversations } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { broadcastToConversation } from '../ws/wsServer.js';

export const messagesRouter = Router({ mergeParams: false });

// We mount on: app.use('/api/conversations', messagesRouter)
// So routes here are relative to /api/conversations

// GET /api/conversations/:convId/messages — paginated messages
messagesRouter.get('/:convId/messages', async (req, res) => {
  try {
    const { convId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 200);

    // Use raw SQL — keep cursor as UUID, look up its timestamp via subquery
    // so we don't lose microsecond precision through JS Date conversion.
    let rows;
    if (cursor) {
      const result = await db.execute(
        sql`SELECT * FROM messages
            WHERE conversation_id = ${convId}::uuid
              AND created_at > (
                SELECT created_at FROM messages WHERE id = ${cursor}::uuid LIMIT 1
              )
            ORDER BY created_at ASC
            LIMIT ${limit}`,
      );
      rows = result.rows as any[];
    } else {
      const result = await db.execute(
        sql`SELECT * FROM messages
            WHERE conversation_id = ${convId}::uuid
            ORDER BY created_at ASC
            LIMIT ${limit}`,
      );
      rows = result.rows as any[];
    }

    // Camel-case the snake_case PG columns to match the rest of the API
    const formatted = rows.map(r => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderType: r.sender_type,
      senderId: r.sender_id,
      content: r.content,
      mentions: r.mentions,
      replyToMessageId: r.reply_to_message_id,
      streaming: r.streaming,
      pinned: r.pinned,
      createdAt: r.created_at,
    }));

    const nextCursor = formatted.length === limit ? formatted[formatted.length - 1]?.id : null;

    res.json({
      messages: formatted,
      nextCursor,
      hasMore: formatted.length === limit,
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
      id: clientId,
      senderType = 'user',
      senderId = 'user',
      content,
      mentions = [],
      replyToMessageId,
    } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const id = clientId ?? uuid();
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

    // Broadcast new message to subscribers
    broadcastToConversation(convId, {
      type: 'message.new',
      conversationId: convId,
      message: msg,
    });

    res.status(201).json(msg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
