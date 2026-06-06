import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, artifacts, artifactVersions } from '../db/index.js';
import { v4 as uuid } from 'uuid';

export const artifactsRouter = Router();

// GET /api/artifacts/:id — get artifact with all versions
artifactsRouter.get('/:id', async (req, res) => {
  try {
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, req.params.id))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    const versions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifact.id))
      .orderBy(desc(artifactVersions.version));

    res.json({ ...artifact, versions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/artifacts/:id/versions — get version history
artifactsRouter.get('/:id/versions', async (req, res) => {
  try {
    const versions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, req.params.id))
      .orderBy(desc(artifactVersions.version));

    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/artifacts — create artifact with initial version
artifactsRouter.post('/', async (req, res) => {
  try {
    const { conversationId, type, name, language, content, authorAgentId, commitMessage } = req.body;
    if (!type || !name || !content) {
      return res.status(400).json({ error: 'type, name, and content are required' });
    }

    const artId = uuid();
    const verId = uuid();

    // Insert initial version first
    const [version] = await db
      .insert(artifactVersions)
      .values({
        id: verId,
        artifactId: artId,
        version: 1,
        content,
        authorAgentId: authorAgentId ?? 'unknown',
        commitMessage: commitMessage ?? 'Initial version',
      })
      .returning();

    // Insert artifact
    const [artifact] = await db
      .insert(artifacts)
      .values({
        id: artId,
        conversationId: conversationId ?? null,
        type,
        name,
        language: language ?? null,
        latestVersionId: verId,
        createdBy: authorAgentId ?? 'unknown',
      })
      .returning();

    res.status(201).json({ ...artifact, versions: [version] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/artifacts/:id/versions — add new version
artifactsRouter.post('/:id/versions', async (req, res) => {
  try {
    const artifactId = req.params.id;
    const { content, authorAgentId, commitMessage } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    // Get current max version
    const [latestVer] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1);

    const nextVersion = (latestVer?.version ?? 0) + 1;
    const verId = uuid();

    const [newVer] = await db
      .insert(artifactVersions)
      .values({
        id: verId,
        artifactId,
        version: nextVersion,
        content,
        authorAgentId: authorAgentId ?? 'unknown',
        commitMessage: commitMessage ?? `v${nextVersion}`,
      })
      .returning();

    // Update latestVersionId
    await db
      .update(artifacts)
      .set({ latestVersionId: verId })
      .where(eq(artifacts.id, artifactId));

    res.status(201).json(newVer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/artifacts/:id/rollback — rollback to a specific version
artifactsRouter.post('/:id/rollback', async (req, res) => {
  try {
    const artifactId = req.params.id;
    const { versionId } = req.body;
    if (!versionId) return res.status(400).json({ error: 'versionId is required' });

    const [targetVer] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.id, versionId))
      .limit(1);

    if (!targetVer) return res.status(404).json({ error: 'Version not found' });

    // Create a new version with the target content (rollback = new version)
    const [latestVer] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1);

    const nextVersion = (latestVer?.version ?? 0) + 1;
    const verId = uuid();

    const [newVer] = await db
      .insert(artifactVersions)
      .values({
        id: verId,
        artifactId,
        version: nextVersion,
        content: targetVer.content,
        authorAgentId: 'user',
        commitMessage: `revert: 回滚到 v${targetVer.version}`,
      })
      .returning();

    await db
      .update(artifacts)
      .set({ latestVersionId: verId })
      .where(eq(artifacts.id, artifactId));

    res.status(201).json(newVer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
