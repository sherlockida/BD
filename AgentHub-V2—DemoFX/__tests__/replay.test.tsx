import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReplay } from '../src/ReplayDirector';
import type { ReplayEvent } from '../../AgentHub-V2—SharedTypes/src/types';

function makeEvent(
  kind: ReplayEvent['kind'],
  timestamp: number,
  payload: Record<string, unknown> = {},
): ReplayEvent {
  return { kind, timestamp, payload };
}

describe('useReplay', () => {
  const sampleEvents: ReplayEvent[] = [
    makeEvent('order-created', 1000, {
      id: 'order-1',
      intent: 'Build a dashboard',
    }),
    makeEvent('agent-dispatched', 1500, { agentId: 'agent-1', orderId: 'order-1' }),
    makeEvent('artifact-dropped', 3000, {
      id: 'art-1',
      name: 'Dashboard code',
      authorAgentId: 'agent-1',
    }),
    makeEvent('edge-drawn', 3200, { source: 'order-1', target: 'agent-1' }),
  ];

  it('initializes with isPlaying=false', () => {
    const { result } = renderHook(() => useReplay(sampleEvents));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  it('play() sets isPlaying to true', () => {
    const { result } = renderHook(() => useReplay(sampleEvents));
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('pause() sets isPlaying back to false after play', () => {
    const { result } = renderHook(() => useReplay(sampleEvents));
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('setSpeed(10) updates speed to 10', () => {
    const { result } = renderHook(() => useReplay(sampleEvents));
    act(() => {
      result.current.setSpeed(10);
    });
    expect(result.current.speed).toBe(10);
  });

  it('does not error when events array is empty', () => {
    const empty: ReplayEvent[] = [];
    const { result } = renderHook(() => useReplay(empty));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);

    // These should not throw
    act(() => {
      result.current.play();
    });
    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.pause();
    });
    expect(result.current.isPlaying).toBe(false);

    act(() => {
      result.current.setSpeed(10);
    });
    expect(result.current.speed).toBe(10);
  });
});
