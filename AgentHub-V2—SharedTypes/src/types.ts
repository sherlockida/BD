// ─────────────────────────────────────────────────────────────
// V2 Shared Types
// Re-exports all v1.1 legacy types and adds V2-specific types.
// ─────────────────────────────────────────────────────────────

// Re-export all v1.1 types
export type {
  ID,
  Agent,
  AgentCapability,
  AgentVendor,
  Conversation,
  ConversationType,
  Message,
  MessageSenderType,
  MessageContent,
  OrchestratorPlan,
  SubTask,
  SubTaskStatus,
  Artifact,
  ArtifactType,
  ArtifactVersion,
  DeployStatus,
  DiffPayload,
  DiffHunk,
  Skill,
  AgentInput,
  AgentChunk,
  IAgent,
} from '../../../agenthub-mvp/src/types';

// ────── V2 New Types ──────

/** Canvas vs classic view mode toggle */
export type ViewMode = 'canvas' | 'classic';

/** Data associated with an order node on the canvas */
export interface OrderNodeData {
  orderId: string;
  intent: string;
  acceptedBy?: string;
  acceptedAt?: number;
  status: 'pending' | 'planning' | 'dispatched' | 'done';
}

/** Workstation status indicator */
export type WorkstationStatus =
  | 'idle'
  | 'thinking'
  | 'producing'
  | 'awaiting-input'
  | 'done'
  | 'error';

/** A single step in an agent's thinking stream */
export interface ThinkingFrame {
  kind: 'read' | 'decide' | 'write';
  summary: string;
  timestamp: number;
}

/** Telemetry data for an active agent */
export interface Telemetry {
  tokensPerSec: number;
  inputTokensUsed: number;
  activeOrderId?: string;
}

/** Data associated with a workstation node on the canvas */
export interface WorkstationNodeData {
  agentId: string;
  meta: {
    id: string;
    name: string;
    avatarEmoji: string;
    avatarColor: string;
    vendor: string;
    capabilities: string[];
  };
  status: WorkstationStatus;
  thinkingStream: ThinkingFrame[];
  telemetry: Telemetry;
}

/** Data associated with an artifact tile on the canvas */
export interface ArtifactTileData {
  artifactId: string;
  versionId: string;
  type: string;
  name: string;
  thumbnail?: string;
  authorAgentId: string;
  derivedFrom?: string[];
  version: number;
}

/** V2 GenUI catalog component names */
export type CatalogComponentName =
  | 'ChoiceCards'
  | 'ColorPickerGrid'
  | 'SliderRange'
  | 'ConfirmCard';

/** Chunk that renders a GenUI component for user input */
export interface UiComponentChunk {
  type: 'ui-component';
  componentId: string;
  component: CatalogComponentName;
  props: Record<string, unknown>;
  awaitsInput: boolean;
}

/** Payload sent back when user interacts with a GenUI component */
export interface UiInputPayload {
  componentId: string;
  value: unknown;
}

/** Serialisable canvas state for persistence / replay */
export interface CanvasState {
  nodes: unknown[];
  edges: unknown[];
  viewport: { x: number; y: number; zoom: number };
  selectedIds: string[];
}

/** Slice shape for workstation state in Zustand */
export interface WorkstationSlice {
  workstationsByConv: Record<string, Record<string, WorkstationNodeData>>;
}

/** Slice shape for pending GenUI interactions in Zustand */
export interface GenUiSlice {
  pendingByComponent: Record<
    string,
    { conversationId: string; agentId: string; chunk: UiComponentChunk }
  >;
}

/** A single event in a canvas replay timeline */
export interface ReplayEvent {
  timestamp: number;
  kind:
    | 'order-created'
    | 'agent-dispatched'
    | 'artifact-dropped'
    | 'edge-drawn'
    | 'genui-shown';
  payload: Record<string, unknown>;
}
