import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Viewport,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';

export interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
  selectedIds: string[];

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  addNode: (node: Node) => void;
  updateNode: (id: string, data: Partial<Record<string, unknown>>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setViewport: (viewport: Viewport) => void;
  setSelection: (ids: string[]) => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedIds: [],

  onNodesChange: (changes: NodeChange[]) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  addNode: (node: Node) => {
    set((state) => ({ nodes: [...state.nodes, node] }));
  },

  updateNode: (id: string, data: Partial<Record<string, unknown>>) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    }));
  },

  removeNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter(
        (e) => e.source !== id && e.target !== id,
      ),
    }));
  },

  addEdge: (edge: Edge) => {
    set((state) => ({ edges: [...state.edges, edge] }));
  },

  removeEdge: (id: string) => {
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    }));
  },

  setViewport: (viewport: Viewport) => {
    set({ viewport });
  },

  setSelection: (ids: string[]) => {
    set({ selectedIds: ids });
  },
}));
