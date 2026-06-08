import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from '../src/canvasStore';
import type { Node, Edge } from '@xyflow/react';

const createOrderNode = (id: string): Node => ({
  id,
  type: 'order',
  position: { x: 0, y: 0 },
  data: { orderId: id, intent: `Order ${id}`, status: 'pending' },
});

const createWorkstationNode = (id: string): Node => ({
  id,
  type: 'workstation',
  position: { x: 100, y: 100 },
  data: {
    agentId: id,
    meta: {
      id,
      name: `Agent ${id}`,
      avatarEmoji: '🤖',
      avatarColor: '#fff',
      vendor: 'test',
      capabilities: [],
    },
    status: 'idle',
    thinkingStream: [],
    telemetry: { tokensPerSec: 0, inputTokensUsed: 0 },
  },
});

describe('canvasStore', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedIds: [],
    });
  });

  it('addNode: nodes array grows after adding a node', () => {
    const store = useCanvasStore.getState();
    store.addNode(createOrderNode('n1'));

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe('n1');
  });

  it('updateNode: updates node data correctly', () => {
    const store = useCanvasStore.getState();
    store.addNode(createOrderNode('n1'));

    useCanvasStore.getState().updateNode('n1', { intent: 'Updated intent' });

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'n1');
    expect(node?.data?.intent).toBe('Updated intent');
  });

  it('removeNode: removes node and its connected edges', () => {
    const store = useCanvasStore.getState();
    store.addNode(createOrderNode('n1'));
    store.addNode(createWorkstationNode('n2'));

    const edge: Edge = {
      id: 'e1',
      source: 'n1',
      target: 'n2',
      type: 'lineage',
    };
    store.addEdge(edge);

    expect(useCanvasStore.getState().nodes).toHaveLength(2);
    expect(useCanvasStore.getState().edges).toHaveLength(1);

    useCanvasStore.getState().removeNode('n1');

    const state = useCanvasStore.getState();
    expect(state.nodes.find((n) => n.id === 'n1')).toBeUndefined();
    expect(state.edges.find((e) => e.source === 'n1')).toBeUndefined();
    expect(state.edges.find((e) => e.target === 'n1')).toBeUndefined();
  });

  it('addEdge / removeEdge: edge CRUD works correctly', () => {
    const store = useCanvasStore.getState();
    store.addEdge({ id: 'e1', source: 'a', target: 'b', type: 'lineage' });
    expect(useCanvasStore.getState().edges).toHaveLength(1);

    useCanvasStore.getState().removeEdge('e1');
    expect(useCanvasStore.getState().edges).toHaveLength(0);
  });

  it('setViewport: viewport values update correctly', () => {
    useCanvasStore
      .getState()
      .setViewport({ x: 100, y: 200, zoom: 2 });

    const vp = useCanvasStore.getState().viewport;
    expect(vp.x).toBe(100);
    expect(vp.y).toBe(200);
    expect(vp.zoom).toBe(2);
  });
});
