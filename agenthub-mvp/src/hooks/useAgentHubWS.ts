import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import type { ID } from '../types';

/**
 * WebSocket hook — connects to AgentHub WS server and dispatches events to Zustand store.
 * Real-time sync for: messages, artifacts, deploy progress across tabs/devices.
 *
 * Usage: call once in App.tsx; it auto-subscribes to activeConversation changes.
 */

const WS_URL = 'ws://localhost:3001/ws';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30_000;

// ── WS event type (matches server WSEvent) ──
type WSEvent =
  | { type: 'message.new'; conversationId: string; message: any }
  | { type: 'message.streaming'; conversationId: string; messageId: string; delta: string }
  | { type: 'task.status_change'; planId: string; taskId: string; status: string }
  | { type: 'artifact.new_version'; artifactId: string; version: any }
  | { type: 'deploy.progress'; deployId: string; progress: number; step: string; url?: string }
  | { type: 'typing.indicator'; conversationId: string; agentId: string; active: boolean }
  | { type: 'pong' };

export function useAgentHubWS() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_DELAY_MS);
  const subscribedConvRef = useRef<ID | null>(null);
  const intentionallyClosed = useRef(false);

  const activeConversationId = useAppStore(s => s.activeConversationId);
  const handleWSMessage = useAppStore(s => s.handleWSMessage);
  const handleWSArtifact = useAppStore(s => s.handleWSArtifact);
  const handleWSDeployProgress = useAppStore(s => s.handleWSDeployProgress);

  useEffect(() => {
    function connect() {
      if (intentionallyClosed.current) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        reconnectDelay.current = RECONNECT_DELAY_MS; // reset on success

        // Re-subscribe to current conversation if any
        if (subscribedConvRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', conversationId: subscribedConvRef.current }));
        }
      };

      ws.onmessage = (raw) => {
        try {
          const event: WSEvent = JSON.parse(raw.data as string);
          switch (event.type) {
            case 'message.new':
              handleWSMessage(event.conversationId, event.message);
              break;
            case 'message.streaming':
              handleWSMessage(event.conversationId, {
                id: event.messageId,
                delta: event.delta,
                streaming: true,
              });
              break;
            case 'artifact.new_version':
              handleWSArtifact(event.artifactId, event.version);
              break;
            case 'deploy.progress':
              handleWSDeployProgress(event.deployId, event.step, event.progress, event.url);
              break;
            case 'pong':
              // heartbeat response — no action needed
              break;
            default:
              // Ignore unknown event types
              break;
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        wsRef.current = null;

        // Auto-reconnect with exponential backoff
        if (!intentionallyClosed.current) {
          reconnectTimer.current = setTimeout(() => {
            console.log(`[WS] Reconnecting in ${reconnectDelay.current}ms...`);
            connect();
            reconnectDelay.current = Math.min(
              reconnectDelay.current * 1.5,
              MAX_RECONNECT_DELAY_MS
            );
          }, reconnectDelay.current);
        }
      };

      ws.onerror = (err) => {
        console.warn('[WS] Connection error:', err);
        // onclose will fire after this, triggering reconnect
      };
    }

    connect();

    return () => {
      intentionallyClosed.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // Only connect once on mount; active conv changes handled by the second effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe/unsubscribe when active conversation changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Store intended subscription — will be applied on reconnect
      subscribedConvRef.current = activeConversationId;
      return;
    }

    // Unsubscribe from previous conversation
    if (subscribedConvRef.current) {
      ws.send(JSON.stringify({ type: 'unsubscribe', conversationId: subscribedConvRef.current }));
    }

    // Subscribe to new conversation
    if (activeConversationId) {
      ws.send(JSON.stringify({ type: 'subscribe', conversationId: activeConversationId }));
      console.log(`[WS] Subscribed to ${activeConversationId}`);
    }

    subscribedConvRef.current = activeConversationId;
  }, [activeConversationId]);

  // Heartbeat — keep connection alive every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);
}
