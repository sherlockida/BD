import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { config } from './config.js';
import { dbHealthCheck, closeDb } from './db/index.js';
import { createWsServer } from './ws/wsServer.js';

// ── Route imports ──
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { agentsRouter, preloadCustomAgents } from './routes/agents.js';
import { artifactsRouter } from './routes/artifacts.js';
import { skillsRouter } from './routes/skills.js';
import { deployRouter } from './routes/deploy.js';

// ── Middleware imports ──
import { rateLimiter } from './middleware/rateLimit.js';

// ────────────────────────────────────────────────────────────
// Express app setup
// ────────────────────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// ── Health check ──
app.get('/api/health', async (_req, res) => {
  const dbOk = await dbHealthCheck();
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk,
    uptime: process.uptime(),
    version: '1.1.0',
  });
});

// ── API routes ──
app.use('/api/conversations', conversationsRouter);
app.use('/api/conversations', messagesRouter);       // nested: /api/conversations/:id/messages
app.use('/api/agents', agentsRouter);
app.use('/api/artifacts', artifactsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/deploy', deployRouter);

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// ────────────────────────────────────────────────────────────
// HTTP + WebSocket server
// ────────────────────────────────────────────────────────────
const httpServer = createServer(app);

// WebSocket attached to the same HTTP server
createWsServer(httpServer);

// Preload custom agents from DB before listening
preloadCustomAgents().then(() => {
  httpServer.listen(config.port, () => {
    console.log(`\n🚀 AgentHub server running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket ready on ws://localhost:${config.port}/ws`);
    console.log(`🗄️  PostgreSQL: ${config.db.url.replace(/\/\/.*@/, '//***@')}`);
    console.log(`📦 Redis: ${config.redis.url}\n`);
  });
});

// ── Graceful shutdown ──
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down...`);
  await closeDb();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
