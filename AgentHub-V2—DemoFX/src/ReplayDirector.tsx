import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import type { ReplayEvent } from '../../AgentHub-V2—SharedTypes/src/types';
import { useCanvasStore } from '../../AgentHub-V2—CanvasEngine/src/canvasStore';

// ────── Event Merging ──────
// Merge consecutive events whose timestamps differ by less than 100ms
// into the same frame so they render together.

function mergeEventGroups(events: ReplayEvent[]): ReplayEvent[][] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const groups: ReplayEvent[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.timestamp - prev.timestamp < 100) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups;
}

// ────── Subtitle helpers ──────

const EVENT_LABELS: Record<string, string> = {
  'order-created': 'Order Arrived',
  'agent-dispatched': 'Agent Dispatched',
  'artifact-dropped': 'Artifact Ready',
  'edge-drawn': 'Connection Established',
  'genui-shown': 'Interactive Component Shown',
};

const EVENT_COLORS: Record<string, string> = {
  'order-created': '#6366f1',
  'agent-dispatched': '#f59e0b',
  'artifact-dropped': '#10b981',
  'edge-drawn': '#8b5cf6',
  'genui-shown': '#06b6d4',
};

function subtitleForGroup(group: ReplayEvent[]): string {
  const kinds = group.map((e) => EVENT_LABELS[e.kind] ?? e.kind);
  return kinds.join(' + ');
}

// ────── Canvas integration helpers ──────

function applyReplayEvent(event: ReplayEvent): void {
  const store = useCanvasStore.getState();

  switch (event.kind) {
    case 'order-created': {
      const id = (event.payload.id as string) ?? `order-${Date.now()}`;
      const intent = (event.payload.intent as string) ?? 'Unknown';
      store.addNode({
        id,
        type: 'order',
        position: { x: 200, y: 50 },
        data: { orderId: id, intent, status: 'pending' },
      });
      break;
    }
    case 'agent-dispatched': {
      const agentId = (event.payload.agentId as string) ?? `agent-${Date.now()}`;
      const orderId = (event.payload.orderId as string) ?? '';
      store.updateNode(agentId, { status: 'thinking' });
      if (orderId) {
        store.updateNode(orderId, { status: 'dispatched', acceptedBy: agentId });
      }
      break;
    }
    case 'artifact-dropped': {
      const id = (event.payload.id as string) ?? `artifact-${Date.now()}`;
      const name = (event.payload.name as string) ?? 'Artifact';
      const authorAgentId = (event.payload.authorAgentId as string) ?? '';
      store.addNode({
        id,
        type: 'artifactTile',
        position: { x: 350 + Math.random() * 100, y: 300 + Math.random() * 100 },
        data: {
          artifactId: id,
          versionId: `v1-${id}`,
          type: (event.payload.type as string) ?? 'unknown',
          name,
          authorAgentId,
          derivedFrom: [],
          version: 1,
          thumbnail: undefined,
        },
      });
      break;
    }
    case 'edge-drawn': {
      const source = event.payload.source as string;
      const target = event.payload.target as string;
      if (source && target) {
        store.addEdge({
          id: `edge-${source}-${target}`,
          source,
          target,
          type: 'lineage',
        });
      }
      break;
    }
    case 'genui-shown':
      // GenUI shown — no canvas mutation needed for replay
      break;
  }
}

// ────── useReplay Hook ──────

export interface UseReplayReturn {
  isPlaying: boolean;
  currentIndex: number;
  progress: number;
  speed: number;
  play: () => void;
  pause: () => void;
  setSpeed: (newSpeed: number) => void;
}

/**
 * useReplay — drives the replay index via requestAnimationFrame.
 * Events with timestamps < 100ms apart are merged into a single frame.
 * The total replay targets ~20 s of compressed animation at 1x speed.
 */
export function useReplay(
  events: ReplayEvent[],
  onComplete?: () => void,
): UseReplayReturn {
  const groups = useMemo(() => mergeEventGroups(events), [events]);
  const totalGroups = groups.length;
  const TARGET_DURATION_MS = 20_000; // 20 seconds at 1x

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeedState] = useState(5);

  const rafRef = useRef<number>(0);
  const accumulatedRef = useRef(0);
  const indexRef = useRef(0);
  const lastTimeRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const progress = totalGroups > 0 ? indexRef.current / totalGroups : 0;

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  // Reset when events change
  useEffect(() => {
    setCurrentIndex(0);
    indexRef.current = 0;
    accumulatedRef.current = 0;
    setIsPlaying(false);
    lastTimeRef.current = 0;
  }, [events]);

  // rAF loop — advances the replay position
  useEffect(() => {
    if (!isPlaying || totalGroups === 0) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatedRef.current += delta * speed;

      const normalizedPos = Math.min(
        accumulatedRef.current / TARGET_DURATION_MS,
        1,
      );
      const newIndex = Math.min(
        Math.floor(normalizedPos * totalGroups),
        totalGroups,
      );

      // Fire events for newly reached groups
      const start = indexRef.current;
      for (let i = start; i < newIndex && i < totalGroups; i++) {
        groups[i].forEach((ev) => applyReplayEvent(ev));
      }
      indexRef.current = newIndex;
      setCurrentIndex(newIndex);

      if (newIndex >= totalGroups) {
        setIsPlaying(false);
        onCompleteRef.current?.();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, groups, speed, TARGET_DURATION_MS, totalGroups]);

  return { isPlaying, currentIndex, progress, speed, play, pause, setSpeed };
}

// ────── Director Sub-component: Animation Steps ──────

interface StepIndicatorProps {
  kind: string;
  index: number;
  active: boolean;
  done: boolean;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({
  kind,
  index,
  active,
  done,
}) => {
  const color = EVENT_COLORS[kind] ?? '#6b7280';
  return (
    <div
      data-testid={`step-${index}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: done ? 600 : 400,
        background: active
          ? `${color}22`
          : done
            ? `${color}11`
            : 'transparent',
        border: `1px solid ${active ? color : done ? `${color}44` : 'transparent'}`,
        transition: 'all 0.3s',
        animation: active ? 'replayStepPulse 0.6s ease-in-out infinite' : 'none',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: done ? color : active ? color : '#555',
          opacity: done ? 1 : active ? 1 : 0.4,
        }}
      />
      <span style={{ color: done || active ? color : '#888', whiteSpace: 'nowrap' }}>
        {EVENT_LABELS[kind] ?? kind}
      </span>
    </div>
  );
};

// ────── ReplayDirector Component ──────

interface ReplayDirectorProps {
  events: ReplayEvent[];
  onComplete?: () => void;
  speed?: number;
}

/**
 * ReplayDirector — renders a full-width animation overlay showing
 * the canvas replay with subtitles, progress bar, and playback controls.
 */
export const ReplayDirector: React.FC<ReplayDirectorProps> = ({
  events,
  onComplete,
  speed: initialSpeed,
}) => {
  const { isPlaying, currentIndex, progress, speed, play, pause, setSpeed } =
    useReplay(events, onComplete);

  const groups = useMemo(() => mergeEventGroups(events), [events]);

  // Derive which unique event kinds have played so far and which is current
  const doneEvents = useMemo(() => {
    const seen = new Set<string>();
    for (let i = 0; i < currentIndex && i < groups.length; i++) {
      groups[i].forEach((e) => seen.add(e.kind));
    }
    return seen;
  }, [currentIndex, groups]);

  const currentGroup = currentIndex < groups.length ? groups[currentIndex] : null;
  const currentKinds: Set<string> = new Set(currentGroup?.map((e) => e.kind) ?? []);

  const allKinds = useMemo(() => {
    const s = new Set<string>();
    events.forEach((e) => s.add(e.kind));
    return [...s];
  }, [events]);

  return (
    <div
      data-testid="replay-director"
      style={{
        position: 'relative',
        width: '100%',
        background: '#0f0f1a',
        borderRadius: 12,
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Timeline / animation area */}
      <div
        style={{
          padding: '20px 16px',
          minHeight: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Step indicators */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {allKinds.map((kind, i) => (
            <StepIndicator
              key={kind}
              kind={kind}
              index={i}
              active={currentKinds.has(kind)}
              done={doneEvents.has(kind)}
            />
          ))}
        </div>

        {/* Subtitle */}
        <div
          data-testid="replay-subtitle"
          style={{
            padding: '8px 14px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 14,
            lineHeight: 1.5,
            minHeight: 40,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {currentGroup ? subtitleForGroup(currentGroup) : 'Waiting for replay...'}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 4,
            background: '#1e1e2e',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="replay-progress"
            style={{
              width: `${(progress * 100).toFixed(1)}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
              borderRadius: 2,
              transition: 'width 0.05s linear',
            }}
          />
        </div>
      </div>

      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.3)',
        }}
      >
        {/* Play / Pause */}
        <button
          data-testid="replay-play-btn"
          onClick={isPlaying ? pause : play}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: '#6366f1',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '||' : '▶'}
        </button>

        {/* Speed selector */}
        {[1, 2, 5, 10].map((s) => (
          <button
            key={s}
            data-testid={`speed-${s}x`}
            onClick={() => setSpeed(s)}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: `1px solid ${speed === s ? '#6366f1' : 'rgba(255,255,255,0.15)'}`,
              background: speed === s ? '#6366f122' : 'transparent',
              color: speed === s ? '#a78bfa' : '#94a3b8',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: speed === s ? 600 : 400,
            }}
          >
            {s}x
          </button>
        ))}

        {/* Progress text */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: '#64748b',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {currentIndex}/{groups.length}
        </span>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes replayStepPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};
