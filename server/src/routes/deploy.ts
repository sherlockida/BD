import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, artifacts, deploys } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const deployRouter = Router();

// POST /api/deploy — trigger deployment for an artifact
deployRouter.post('/', async (req, res) => {
  try {
    const { artifactId } = req.body;
    if (!artifactId) return res.status(400).json({ error: 'artifactId is required' });

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    const deployId = uuid();
    const [deploy] = await db
      .insert(deploys)
      .values({
        id: deployId,
        artifactId,
        step: 'building',
        progress: 0,
        startedAt: new Date(),
      })
      .returning();

    // In v1.1 W4: actual Vercel/Netlify deployment
    // For W1, return the deploy record — client polls for status updates
    res.status(201).json(deploy);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deploy/:id/status — get deployment status
deployRouter.get('/:id/status', async (req, res) => {
  try {
    const [deploy] = await db
      .select()
      .from(deploys)
      .where(eq(deploys.id, req.params.id))
      .limit(1);

    if (!deploy) return res.status(404).json({ error: 'Deploy not found' });
    res.json(deploy);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
