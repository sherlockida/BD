import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db, artifacts, artifactVersions, deploys } from '../db/index.js';
import { v4 as uuid } from 'uuid';
import { broadcastToConversation } from '../ws/wsServer.js';
import { deployHtml, type DeployProgress } from '../services/vercelDeployService.js';

export const deployRouter = Router();

// POST /api/deploy — trigger deployment for an artifact (async, real Vercel or local fallback)
deployRouter.post('/', async (req, res) => {
  try {
    const { artifactId } = req.body;
    if (!artifactId) return res.status(400).json({ error: 'artifactId is required' });

    // Load artifact
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    // Load latest version content
    const [latestVersion] = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1);

    if (!latestVersion) {
      return res.status(404).json({ error: 'Artifact has no versions to deploy' });
    }

    const htmlContent = latestVersion.content;
    const artifactName = artifact.name;

    // Create deploy record
    const deployId = uuid();
    const [deploy] = await db
      .insert(deploys)
      .values({
        id: deployId,
        artifactId,
        step: 'building',
        progress: 10,
        message: '初始化部署...',
        startedAt: new Date(),
      })
      .returning();

    // Return immediately — deployment proceeds asynchronously
    res.status(201).json(deploy);

    // Broadcast initial progress
    const convId = artifact.conversationId;
    if (convId) {
      broadcastToConversation(convId, {
        type: 'deploy.progress',
        deployId,
        progress: 10,
        step: 'building',
      });
    }

    // ── Async deployment ──
    const onProgress = async (p: DeployProgress) => {
      // Update DB
      try {
        await db
          .update(deploys)
          .set({
            step: p.step,
            progress: p.progress,
            message: p.message,
            url: p.url ?? null,
            ...(p.step === 'live' || p.step === 'failed' ? { finishedAt: new Date() } : {}),
          })
          .where(eq(deploys.id, deployId));
      } catch (dbErr: any) {
        console.warn('[Deploy] DB update failed:', dbErr.message);
      }

      // Broadcast via WebSocket
      if (convId) {
        broadcastToConversation(convId, {
          type: 'deploy.progress',
          deployId,
          progress: p.progress,
          step: p.step,
        });
      }
    };

    // Fire deployment in background (don't await — let it run)
    deployHtml(artifactName, htmlContent, onProgress)
      .then(finalUrl => {
        if (finalUrl && convId) {
          broadcastToConversation(convId, {
            type: 'deploy.progress',
            deployId,
            progress: 100,
            step: 'live',
          });
        }
      })
      .catch(err => {
        console.error('[Deploy] Background deployment failed:', err.message);
        if (convId) {
          broadcastToConversation(convId, {
            type: 'deploy.progress',
            deployId,
            progress: 0,
            step: 'failed',
          });
        }
      });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deploy/:id/status — get deployment status (polling fallback)
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
