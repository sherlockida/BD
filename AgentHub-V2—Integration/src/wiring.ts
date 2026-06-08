// ─────────────────────────────────────────────────────────────
// wiring.ts — Module Dependency Injection & Composition
// ─────────────────────────────────────────────────────────────
// Imports all custom ReactFlow node/edge types from CanvasEngine,
// registers them as nodeTypes/edgeTypes, and returns wiring
// helpers that connect canvas events, GenUI handlers, etc.
// ─────────────────────────────────────────────────────────────

import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import {
  OrderNode,
  WorkstationNode,
  ArtifactTileNode,
  MergeNode,
  GenUiNode,
  LineageEdge,
  useCanvasStore,
  handleConnect,
  generateId,
} from '../../AgentHub-V2—CanvasEngine/src/index';
import { submitUiInput } from '../../AgentHub-V2—GenUI/src/handlers';

// ────── ReactFlow Type Registrations ──────

/**
 * All custom ReactFlow node types.
 * Used as the `nodeTypes` prop on <ReactFlow />.
 */
export const nodeTypes: NodeTypes = {
  order: OrderNode,
  workstation: WorkstationNode,
  artifactTile: ArtifactTileNode,
  merge: MergeNode,
  genui: GenUiNode,
};

/**
 * All custom ReactFlow edge types.
 * Used as the `edgeTypes` prop on <ReactFlow />.
 */
export const edgeTypes: EdgeTypes = {
  lineage: LineageEdge,
};

// ────── App Wiring ──────

export interface InitializeV2AppReturn {
  /** Registered custom ReactFlow node types */
  nodeTypes: NodeTypes;
  /** Registered custom ReactFlow edge types */
  edgeTypes: EdgeTypes;
  helpers: {
    /** Connect two nodes on the canvas by creating a lineage edge */
    connectToCanvas: (source: string, target: string) => void;
    /** Submit a GenUI component interaction back to the server */
    handleGenUiSubmit: (
      conversationId: string,
      componentId: string,
      value: unknown,
    ) => Promise<void>;
    /** Generate a unique ID for canvas elements */
    generateId: () => string;
  };
}

/**
 * Initialize all V2 application wiring.
 *
 * Call this once at app startup to:
 * - Register ReactFlow custom node/edge types
 * - Wire canvas event handlers to the Zustand store
 * - Wire GenUI submit handlers to the backend API
 *
 * Returns nodeTypes, edgeTypes, and helper functions for use
 * throughout the application.
 */
export function initializeV2App(): InitializeV2AppReturn {
  // Wire canvas store: connect event handler creates a lineage edge
  const connectToCanvas = (source: string, target: string): void => {
    const store = useCanvasStore.getState();
    handleConnect(
      { source, target, sourceHandle: null, targetHandle: null },
      store.addEdge,
    );
  };

  // Wire GenUI handler: submit user interaction to server
  const handleGenUiSubmit = async (
    conversationId: string,
    componentId: string,
    value: unknown,
  ): Promise<void> => {
    await submitUiInput(conversationId, componentId, value);
  };

  return {
    nodeTypes,
    edgeTypes,
    helpers: {
      connectToCanvas,
      handleGenUiSubmit,
      generateId,
    },
  };
}
