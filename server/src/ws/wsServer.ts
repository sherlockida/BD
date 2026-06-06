import { type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'node:url';

// ── WS event types (mirrors plan §5.5.3) ──
type WSEvent =
  | { type: 'message.new'; conversationId: string; message: unknown }
  | { type: 'message.streaming'; conversationId: string; messageId: string; delta: string }
  | { type: 'task.status_change'; planId: string; taskId: string; status: string }
  | { type: 'artifact.new_version'; artifactId: string; version: unknown }
  | { type: 'deploy.progress'; deployId: string; progress: number; step: string }
  | { type: 'typing.indicator'; conversationId: string; agentId: string; active: boolean };

// ── Room management: conversationId → Set<WebSocket>
const rooms = new Map<string, Set<WebSocket>>();

function joinRoom(ws: WebSocket, conversationId: string) {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  rooms.get(conversationId)!.add(ws);
}

function leaveRoom(ws: WebSocket, conversationId: string) {
  const room = rooms.get(conversationId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(conversationId);
  }
}

function leaveAllRooms(ws: WebSocket) {
  for (const [convId, room] of rooms) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(convId);
  }
}

/**
 * Broadcast a WS event to all clients in a conversation room.
 * Used by route handlers to push real-time updates.
 */
export function broadcastToConversation(conversationId: string, event: WSEvent) {
  const room = rooms.get(conversationId);
  if (!room) return;
  const payload = JSON.stringify(event);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/**
 * Send an event to a specific client.
 */
export function sendToClient(ws: WebSocket, event: WSEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

// ── Create WebSocket server, attached to an HTTP server ──
export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = parse(request.url ?? '/').pathname;

    // Only handle /ws path
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request) => {
    console.log(`[WS] Client connected (${wss.clients.size} total)`);

    // Parse conversation subscription from query string
    const url = parse(request.url ?? '');
    const params = new URLSearchParams(url.query ?? '');
    const convId = params.get('conversationId');

    if (convId) {
      joinRoom(ws, convId);
      console.log(`[WS] Client subscribed to conversation: ${convId}`);
    }

    // ── Handle client messages ──
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        switch (msg.type) {
          case 'subscribe':
            if (msg.conversationId) joinRoom(ws, msg.conversationId);
            break;
          case 'unsubscribe':
            if (msg.conversationId) leaveRoom(ws, msg.conversationId);
            break;
          case 'ping':
            sendToClient(ws, { type: 'typing.indicator', conversationId: '', agentId: '', active: false } as any);
            // Actually just pong
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          default:
            console.log(`[WS] Unknown message type: ${msg.type}`);
        }
      } catch {
        // Ignore non-JSON messages
      }
    });

    ws.on('close', () => {
      leaveAllRooms(ws);
      console.log(`[WS] Client disconnected (${wss.clients.size} total)`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
      leaveAllRooms(ws);
    });
  });

  console.log(`[WS] WebSocket server ready`);
  return wss;
}
