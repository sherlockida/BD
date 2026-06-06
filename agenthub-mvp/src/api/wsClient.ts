/**
 * WebSocket client — real-time event bus for AgentHub.
 *
 * Events (mirrors server wsServer.ts):
 * - message.new        → new message in conversation
 * - message.streaming  → streaming delta for a message
 * - task.status_change → orchestrator task status update
 * - artifact.new_version → new artifact version
 * - deploy.progress    → deployment progress
 * - typing.indicator   → agent typing status
 */

type WSEventHandler = (event: WSEvent) => void;
type WSEvent = {
  type: string;
  conversationId?: string;
  messageId?: string;
  message?: unknown;
  delta?: string;
  planId?: string;
  taskId?: string;
  status?: string;
  artifactId?: string;
  version?: unknown;
  deployId?: string;
  progress?: number;
  step?: string;
  agentId?: string;
  active?: boolean;
};

const WS_URL = `ws://${window.location.hostname}:3001/ws`;

export class AgentHubWSClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WSEventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribedConversations = new Set<string>();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      // Re-subscribe to previous conversations
      for (const convId of this.subscribedConversations) {
        this.send({ type: 'subscribe', conversationId: convId });
      }
    };

    this.ws.onmessage = (msg) => {
      try {
        const event: WSEvent = JSON.parse(msg.data as string);
        for (const handler of this.handlers) {
          handler(event);
        }
      } catch {
        // ignore non-JSON
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 3s...');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(conversationId: string) {
    this.subscribedConversations.add(conversationId);
    this.send({ type: 'subscribe', conversationId });
  }

  unsubscribe(conversationId: string) {
    this.subscribedConversations.delete(conversationId);
    this.send({ type: 'unsubscribe', conversationId });
  }

  onEvent(handler: WSEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

// Singleton
export const wsClient = new AgentHubWSClient();
