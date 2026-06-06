import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, conversations } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const conversationsRouter = Router();

// GET /api/conversations — list all (non-archived first, by last activity)
conversationsRouter.get('/', async (req, res) => {
  try {
    const includeArchived = req.query.archived === 'true';
    const rows = includeArchived
      ? await db.select().from(conversations).orderBy(desc(conversations.lastActivityAt))
      : await db
          .select()
          .from(conversations)
          .where(eq(conversations.archived, false))
          .orderBy(desc(conversations.lastActivityAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id — get single conversation
conversationsRouter.get('/:id', async (req, res) => {
  try {
    const row = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, req.params.id))
      .limit(1);
    if (!row[0]) return res.status(404).json({ error: 'Conversation not found' });
    res.json(row[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/conversations — create new conversation
conversationsRouter.post('/', async (req, res) => {
  try {
    const { id: clientId, type, title, memberAgentIds, projectId } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'type and title are required' });
    }
    // Auto-include orchestrator for group chats
    let members = [...(memberAgentIds ?? [])];
    if (type === 'group' && !members.includes('agent_orchestrator')) {
      members = ['agent_orchestrator', ...members];
    }
    const id = clientId ?? uuid();
    const [row] = await db
      .insert(conversations)
      .values({
        id,
        projectId: projectId ?? null,
        type,
        title,
        memberAgentIds: members,
        pinnedMessageIds: [],
        archived: false,
        lastActivityAt: new Date(),
      })
      .returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/conversations/:id — update conversation
conversationsRouter.patch('/:id', async (req, res) => {
  try {
    const { title, archived, pinnedMessageIds } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (archived !== undefined) updates.archived = archived;
    if (pinnedMessageIds !== undefined) updates.pinnedMessageIds = pinnedMessageIds;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const [row] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, req.params.id))
      .returning();

    if (!row) return res.status(404).json({ error: 'Conversation not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/conversations/:id — delete conversation
conversationsRouter.delete('/:id', async (req, res) => {
  try {
    await db.delete(conversations).where(eq(conversations.id, req.params.id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
