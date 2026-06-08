// ─────────────────────────────────────────────────────────────
// bootstrap.ts — Application Startup Initialization
// ─────────────────────────────────────────────────────────────
// React hook that performs startup hydration from the backend,
// establishes the WebSocket connection for real-time canvas
// updates, and reports ready/error state to the caller.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from 'react';
import { useCanvasStore } from '../../AgentHub-V2—CanvasEngine/src/index';

// ────── Types ──────

export interface AppBootstrapState {
  /** true when hydration + WebSocket connection are complete */
  ready: boolean;
  /** Human-readable error message if any step failed */
  error?: string;
}

/** Shape returned by GET /api/canvas/state */
interface CanvasStateResponse {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  viewport?: { x: number; y: number; zoom: number };
}

/** Shape of a WebSocket canvas event */
interface CanvasWsMessage {
  type: string;
  nodes?: unknown[];
  edges?: unknown[];
}

// ────── Hook ──────

/**
 * useAppBootstrap — application startup hook.
 *
 * Call once at the root component level:
 * ```ts
 * const { ready, error } = useAppBootstrap();
 * if (!ready) return <LoadingScreen error={error} />;
 * ```
 *
 * Effects (run once on mount):
 *  1. Hydrate canvas state from GET /api/canvas/state
 *  2. Open a WebSocket to receive real-time canvas updates
 *  3. Set ready = true when both steps succeed (or degrade gracefully)
 *
 * Cleanup on unmount: closes the WebSocket.
 */
export function useAppBootstrap(): AppBootstrapState {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const cancelledRef = useRef(false);

  // Tear down WebSocket when the hook unmounts
  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;

    const init = async (): Promise<void> => {
      try {
        // ── Step 1: Hydrate canvas state from backend ──
        const response = await fetch('/api/canvas/state');

        if (cancelled) return;

        if (response.ok) {
          const canvasState: CanvasStateResponse = await response.json();
          const store = useCanvasStore.getState();

          if (Array.isArray(canvasState.nodes)) {
            for (const node of canvasState.nodes) {
              store.addNode(node as any);
            }
          }

          if (Array.isArray(canvasState.edges)) {
            for (const edge of canvasState.edges) {
              store.addEdge(edge as any);
            }
          }

          if (canvasState.viewport) {
            store.setViewport(canvasState.viewport);
          }

          console.log(
            `[bootstrap] Hydrated ${canvasState.nodes?.length ?? 0} nodes, ` +
              `${canvasState.edges?.length ?? 0} edges`,
          );
        } else if (response.status !== 404) {
          // 404 is acceptable — no saved canvas state yet
          console.warn(
            `[bootstrap] Canvas state hydration returned ${response.status}`,
          );
        }

        if (cancelled) return;

        // ── Step 2: Open WebSocket for real-time updates ──
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) {
            ws.close();
            return;
          }
          console.log('[bootstrap] WebSocket connected');
        };

        ws.onmessage = (event: MessageEvent) => {
          try {
            const msg: CanvasWsMessage = JSON.parse(event.data as string);

            switch (msg.type) {
              case 'canvas:update': {
                const store = useCanvasStore.getState();
                if (Array.isArray(msg.nodes)) {
                  for (const node of msg.nodes) {
                    store.addNode(node as any);
                  }
                }
                if (Array.isArray(msg.edges)) {
                  for (const edge of msg.edges) {
                    store.addEdge(edge as any);
                  }
                }
                break;
              }
              case 'canvas:clear': {
                // Future: reset canvas from backend signal
                break;
              }
              default:
                // Unknown message types are silently ignored
                break;
            }
          } catch {
            // Non-JSON messages (e.g. heartbeat pings) are ignored
          }
        };

        ws.onerror = () => {
          console.warn('[bootstrap] WebSocket connection error');
        };

        ws.onclose = () => {
          console.log('[bootstrap] WebSocket disconnected');
        };

        // ── Step 3: Mark as ready ──
        if (!cancelled) {
          setReady(true);
        }
      } catch (err: unknown) {
        if (cancelled) return;

        const message =
          err instanceof Error ? err.message : 'Unknown initialization error';
        console.error('[bootstrap] Initialization failed:', message);
        setError(message);

        // Still mark as ready so the UI renders with whatever state it has
        setReady(true);
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [cleanup]);

  return { ready, error };
}
