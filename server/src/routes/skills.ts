import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, skills } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const skillsRouter = Router();

// GET /api/skills — list all skills, ordered by most recent
skillsRouter.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(skills)
      .orderBy(desc(skills.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/skills — create a new skill
skillsRouter.post('/', async (req, res) => {
  try {
    const { id: clientId, name, triggerCondition, description, steps, source, conversationId } = req.body;
    if (!name || !triggerCondition) {
      return res.status(400).json({ error: 'name and triggerCondition are required' });
    }
    const id = clientId ?? uuid();
    const [skill] = await db
      .insert(skills)
      .values({
        id,
        name,
        triggerCondition,
        description: description ?? null,
        steps: steps ?? [],
        source: source ?? 'manual',
        conversationId: conversationId ?? null,
      })
      .returning();
    res.status(201).json(skill);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/skills/:id — remove a skill
skillsRouter.delete('/:id', async (req, res) => {
  try {
    await db.delete(skills).where(eq(skills.id, req.params.id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
