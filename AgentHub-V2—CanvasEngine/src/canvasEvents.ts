import type { Node, Edge, Connection } from '@xyflow/react';

export function handleConnect(
  connection: Connection,
  addEdge: (edge: Edge) => void,
): void {
  if (!connection.source || !connection.target) return;

  const newEdge: Edge = {
    id: `edge-${connection.source}-${connection.target}`,
    source: connection.source,
    target: connection.target,
    type: 'lineage',
  };

  addEdge(newEdge);
}

export function handleNodeDragStop(
  _event: React.MouseEvent | React.TouchEvent,
  _node: Node,
): void {
  // Placeholder: drag-to-workstation or drag-to-merge logic
}

export function handleNodeDoubleClick(
  _event: React.MouseEvent | React.TouchEvent,
  _node: Node,
): void {
  // Placeholder: open detail panel or fullscreen artifact view
}

export function generateId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
