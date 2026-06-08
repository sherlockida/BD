import { describe, it, expect } from 'vitest';
import { autoLayout } from '../src/layout';
import type { Node, Edge } from '@xyflow/react';

describe('autoLayout', () => {
  it('3 connected nodes do not overlap after layout', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {} },
      { id: 'c', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'bc', source: 'b', target: 'c' },
    ];

    const result = autoLayout(nodes, edges);

    const posKeys = result.nodes.map(
      (n) => `${n.position.x.toFixed(1)},${n.position.y.toFixed(1)}`,
    );
    const unique = new Set(posKeys);
    expect(unique.size).toBe(3);
  });

  it('empty arrays does not throw', () => {
    expect(() => autoLayout([], [])).not.toThrow();
  });

  it('returns empty result for empty input', () => {
    const result = autoLayout([], []);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('nodes are laid out in TB (top-to-bottom) direction', () => {
    const nodes: Node[] = [
      { id: 'a', position: { x: 0, y: 0 }, data: {} },
      { id: 'b', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [{ id: 'ab', source: 'a', target: 'b' }];

    const result = autoLayout(nodes, edges);

    const nodeA = result.nodes.find((n) => n.id === 'a')!;
    const nodeB = result.nodes.find((n) => n.id === 'b')!;
    expect(nodeA.position.y).toBeLessThan(nodeB.position.y);
  });
});
