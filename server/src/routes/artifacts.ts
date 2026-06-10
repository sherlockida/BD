import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, artifacts, artifactVersions } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { broadcastToConversation } from '../ws/wsServer.js';
import { generatePdf } from '../services/pdfGenerator.js';

export const artifactsRouter = Router();

// GET /api/artifacts — list artifacts, filterable by conversationId
artifactsRouter.get('/', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const rows = conversationId
      ? await db
          .select()
          .from(artifacts)
          .where(eq(artifacts.conversationId, conversationId as string))
          .orderBy(desc(artifacts.createdAt))
      : await db.select().from(artifacts).orderBy(desc(artifacts.createdAt));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const { id: clientArtId, versionId: clientVerId, conversationId, type, name, language, content, authorAgentId, commitMessage } = req.body;
    if (!type || !name || !content) {
      return res.status(400).json({ error: 'type, name, and content are required' });
    }

    const artId = clientArtId ?? uuid();
    const verId = clientVerId ?? uuid();

    // Insert artifact FIRST (parent), then version (child). FK requires parent to exist.
    // latestVersionId temporarily null; we set it right after inserting the version.
    const [artifact] = await db
      .insert(artifacts)
      .values({
        id: artId,
        conversationId: conversationId ?? null,
        type,
        name,
        language: language ?? null,
        latestVersionId: null,
        createdBy: authorAgentId ?? 'unknown',
      })
      .returning();

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

    // Backfill latestVersionId now that the version exists
    await db
      .update(artifacts)
      .set({ latestVersionId: verId })
      .where(eq(artifacts.id, artId));

    res.status(201).json({ ...artifact, latestVersionId: verId, versions: [version] });

    // Broadcast new artifact creation
    if (artifact?.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.new_version',
        artifactId: artifact.id,
        version,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/artifacts/:id/versions — add new version
artifactsRouter.post('/:id/versions', async (req, res) => {
  try {
    const artifactId = req.params.id;
    const { id: clientVerId, content, authorAgentId, commitMessage } = req.body;
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
    const verId = clientVerId ?? uuid();

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

    // Broadcast new version to subscribers
    if (artifact.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.new_version',
        artifactId,
        version: newVer,
      });
    }
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

    // Broadcast rollback event
    const [artifactForBc] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);
    if (artifactForBc?.conversationId) {
      broadcastToConversation(artifactForBc.conversationId, {
        type: 'artifact.new_version',
        artifactId,
        version: newVer,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/artifacts/:id — delete artifact and all versions (CASCADE)
artifactsRouter.delete('/:id', async (req, res) => {
  try {
    const artifactId = req.params.id;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    // artifactVersions + deploys have ON DELETE CASCADE, auto cleaned
    await db.delete(artifacts).where(eq(artifacts.id, artifactId));

    // Broadcast deletion to subscribers
    if (artifact.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.deleted',
        artifactId,
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/artifacts/:id/versions/:versionId — delete a specific version
artifactsRouter.delete('/:id/versions/:versionId', async (req, res) => {
  try {
    const { id: artifactId, versionId } = req.params;

    // Don't allow deleting the only version
    const allVersions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId));

    if (allVersions.length <= 1) {
      return res.status(400).json({
        error: 'Cannot delete the only version. Delete the artifact instead.',
      });
    }

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    const isLatest = artifact.latestVersionId === versionId;

    await db.delete(artifactVersions).where(eq(artifactVersions.id, versionId));

    // If we deleted the latest version, fix latestVersionId
    if (isLatest) {
      const [newLatest] = await db
        .select()
        .from(artifactVersions)
        .where(eq(artifactVersions.artifactId, artifactId))
        .orderBy(desc(artifactVersions.version))
        .limit(1);

      await db
        .update(artifacts)
        .set({ latestVersionId: newLatest?.id ?? null })
        .where(eq(artifacts.id, artifactId));
    }

    if (artifact.conversationId) {
      broadcastToConversation(artifact.conversationId, {
        type: 'artifact.version_deleted',
        artifactId,
        versionId,
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/artifacts/:id/export/pdf — export artifact as PDF
artifactsRouter.post('/:id/export/pdf', async (req, res) => {
  try {
    const artifactId = req.params.id;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    const [latestVersion] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1);

    if (!latestVersion || !latestVersion.content) {
      return res.status(400).json({ error: 'Artifact has no content' });
    }

    const pdfBuffer = await generatePdf(latestVersion.content, artifact.name);

    // Sanitize filename for Content-Disposition header (RFC 5987 UTF-8 encoding)
    const rawName = (artifact.name || 'document').replace(/[<>:"/\\|?*]/g, '_').replace(/\.(md|txt)$/i, '');
    const safeAscii = rawName.replace(/[^\x00-\x7F]/g, '_') || 'document';
    const encodedName = encodeURIComponent(rawName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}.pdf"; filename*=UTF-8''${encodedName}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[PDF Export] Error:', err.message);
    res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
});
