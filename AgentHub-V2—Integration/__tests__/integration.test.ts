// ─────────────────────────────────────────────────────────────
// AgentHub-V2—Integration — Cross-Module Integration Tests
// Verifies connectivity, type consistency, store data flow,
// GenUI catalog consistency, and BackendServices patch fns.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';

// ===== Module Import Connectivity (Test 1) =====
// Imports at the top-level verify that barrel exports resolve
// across module boundaries at compile time.

import type {
  ViewMode,
  WorkstationStatus,
  CatalogComponentName,
  UiComponentChunk,
} from '../../AgentHub-V2—SharedTypes/src/index';

import {
  ChoiceCardsPropsSchema,
  ChoiceCardsValueSchema,
  CatalogSchemaMap,
  validateCatalogProps,
} from '../../AgentHub-V2—SharedTypes/src/index';

import { useCanvasStore } from '../../AgentHub-V2—CanvasEngine/src/index';
import { parseUiFence } from '../../AgentHub-V2—GenUI/src/index';
import {
  BenchWall,
  TimelineRail,
  CommandBar,
  CommandPalette,
} from '../../AgentHub-V2—Panels/src/index';
import {
  CATALOG_SYSTEM_PROMPT,
  patchSystemPrompt,
  parseAgentChunkForGenUI,
} from '../../AgentHub-V2—BackendServices/src/index';

// ─────────────────────────────────────────────────────────────
// Test 1: Module Import Connectivity
// ─────────────────────────────────────────────────────────────
// Verifies that types, schemas, stores, utilities, and
// components can be imported across module boundaries.
// The imports above are the primary compile-time check; the
// runtime assertions below confirm the imported values exist
// and have the correct shape.

describe('Module import connectivity', () => {
  it('can import types from SharedTypes', () => {
    // TypeScript-level: ViewMode, WorkstationStatus, and
    // CatalogComponentName resolve from SharedTypes barrel.
    // At runtime, verify the types are compatible by assigning
    // representative values.
    const mode: ViewMode = 'canvas';
    expect(mode).toBe('canvas');

    const other: ViewMode = 'classic';
    expect(other).toBe('classic');

    const status: WorkstationStatus = 'idle';
    expect(status).toBe('idle');

    const comp: CatalogComponentName = 'ChoiceCards';
    expect(comp).toBe('ChoiceCards');
  });

  it('can import catalog schemas from SharedTypes', () => {
    // Zod schemas — verify they are constructible and usable
    expect(ChoiceCardsPropsSchema).toBeDefined();
    expect(ChoiceCardsValueSchema).toBeDefined();

    const result = ChoiceCardsPropsSchema.safeParse({
      title: 'Schema Import Test',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('can import canvasStore from CanvasEngine', () => {
    // Zustand store — verify the store hook is a function
    expect(useCanvasStore).toBeDefined();
    expect(typeof useCanvasStore).toBe('function');
    // Calling getState should return the store shape
    const state = useCanvasStore.getState();
    expect(state).toHaveProperty('nodes');
    expect(state).toHaveProperty('edges');
    expect(state).toHaveProperty('addNode');
    expect(state).toHaveProperty('addEdge');
  });

  it('can import parseUiFence from GenUI', () => {
    expect(parseUiFence).toBeDefined();
    expect(typeof parseUiFence).toBe('function');
  });

  it('can import Panel components from Panels', () => {
    expect(BenchWall).toBeDefined();
    expect(TimelineRail).toBeDefined();
    expect(CommandBar).toBeDefined();
    expect(CommandPalette).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────
// Test 2: Type System Consistency
// ─────────────────────────────────────────────────────────────
// Ensures that type definitions cross the module boundary
// consistently. SharedTypes defines the canonical ViewMode,
// WorkstationStatus, and CatalogComponentName; downstream
// modules must agree.

describe('Type system consistency', () => {
  it('ViewMode values are "canvas" and "classic"', () => {
    // SharedTypes: ViewMode = 'canvas' | 'classic'
    // Verify assignment works for both values
    const modes: ViewMode[] = ['canvas', 'classic'];
    expect(modes).toHaveLength(2);
    expect(modes).toContain('canvas');
    expect(modes).toContain('classic');
  });

  it('WorkstationStatus has all 6 values', () => {
    // SharedTypes: WorkstationStatus has 6 literal values:
    // 'idle' | 'thinking' | 'producing' | 'awaiting-input' | 'done' | 'error'
    const allStatuses: WorkstationStatus[] = [
      'idle',
      'thinking',
      'producing',
      'awaiting-input',
      'done',
      'error',
    ];
    expect(allStatuses).toHaveLength(6);
    // Status set contains no duplicates
    expect(new Set(allStatuses).size).toBe(6);
  });

  it('CatalogComponentName has all 4 values', () => {
    // SharedTypes: CatalogComponentName is a union of 4 component names.
    // Verify at runtime via CatalogSchemaMap keys.
    const names: CatalogComponentName[] = [
      'ChoiceCards',
      'ColorPickerGrid',
      'SliderRange',
      'ConfirmCard',
    ];
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);

    // Cross-check: CatalogSchemaMap must have exactly these keys
    const schemaKeys = Object.keys(CatalogSchemaMap) as CatalogComponentName[];
    expect(schemaKeys.sort()).toEqual([...names].sort());
  });
});

// ─────────────────────────────────────────────────────────────
// Test 3: Zod Schema Cross-Module Validation
// ─────────────────────────────────────────────────────────────
// Validates that Zod schemas from SharedTypes can be used by
// GenUI's parseUiFence to process agent output.

describe('Zod schema cross-module validation', () => {
  it('ChoiceCards schema validates correctly', () => {
    // Valid props — 2 options
    let r = ChoiceCardsPropsSchema.safeParse({
      title: 'Choose style',
      options: [
        { id: 'minimal', label: 'Minimal' },
        { id: 'glass', label: 'Glass' },
      ],
    });
    expect(r.success).toBe(true);

    // Missing title
    r = ChoiceCardsPropsSchema.safeParse({
      options: [{ id: 'a', label: 'A' }],
    });
    expect(r.success).toBe(false);

    // More than 6 options
    r = ChoiceCardsPropsSchema.safeParse({
      title: 'Too many',
      options: [
        { id: '1', label: '1' },
        { id: '2', label: '2' },
        { id: '3', label: '3' },
        { id: '4', label: '4' },
        { id: '5', label: '5' },
        { id: '6', label: '6' },
        { id: '7', label: '7' },
      ],
    });
    expect(r.success).toBe(false);

    // Valid value
    r = ChoiceCardsValueSchema.safeParse({ chosenId: 'minimal' });
    expect(r.success).toBe(true);
  });

  it('parseUiFence from GenUI can process a valid ui fence', () => {
    // Simulate an LLM output with a ```ui fence
    const agentOutput = [
      'I recommend the minimal style:',
      '',
      '```ui',
      JSON.stringify({
        component: 'ChoiceCards',
        props: {
          title: 'Which style?',
          options: [
            { id: 'minimal', label: 'Minimal', preview: 'a' },
            { id: 'glass', label: 'Glass', preview: 'b' },
          ],
        },
      }),
      '```',
    ].join('\n');

    const result = parseUiFence(agentOutput);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ChoiceCards');
    expect(result.props).toBeDefined();
    expect((result.props as Record<string, unknown>)?.title).toBe(
      'Which style?',
    );
    expect(result.error).toBeUndefined();
  });

  it('parseUiFence returns found=false for plain text', () => {
    const result = parseUiFence('Hello, this is plain text.');
    expect(result.found).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Test 4: Store Data Flow
// ─────────────────────────────────────────────────────────────
// Verifies that the Zustand canvasStore (CanvasEngine) correctly
// manages nodes and edges as data flows through the system.

describe('Store data flow', () => {
  beforeEach(() => {
    // Reset the store to a clean state before each test
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedIds: [],
    });
  });

  it('canvasStore.addNode creates a node', () => {
    const store = useCanvasStore.getState();

    const orderNode: Node = {
      id: 'order-1',
      type: 'order',
      position: { x: 100, y: 200 },
      data: { orderId: 'order-1', intent: 'Create homepage', status: 'pending' },
    };

    store.addNode(orderNode);

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe('order-1');
    expect(state.nodes[0].type).toBe('order');
    expect(state.nodes[0].data).toMatchObject({
      intent: 'Create homepage',
    });
  });

  it('canvasStore.addEdge connects two nodes', () => {
    const store = useCanvasStore.getState();

    // Add source and target nodes first
    store.addNode({
      id: 'order-1',
      type: 'order',
      position: { x: 0, y: 0 },
      data: { orderId: 'order-1', intent: 'Build', status: 'pending' },
    });

    store.addNode({
      id: 'ws-1',
      type: 'workstation',
      position: { x: 300, y: 0 },
      data: {
        agentId: 'ws-1',
        meta: {
          id: 'ws-1',
          name: 'PMO',
          avatarEmoji: 'P',
          avatarColor: '#6366f1',
          vendor: 'deepseek',
          capabilities: [],
        },
        status: 'idle',
        thinkingStream: [],
        telemetry: { tokensPerSec: 0, inputTokensUsed: 0 },
      },
    });

    // Connect them with a lineage edge
    const lineageEdge: Edge = {
      id: 'e1',
      source: 'order-1',
      target: 'ws-1',
      type: 'lineage',
    };
    store.addEdge(lineageEdge);

    const state = useCanvasStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].source).toBe('order-1');
    expect(state.edges[0].target).toBe('ws-1');
    expect(state.edges[0].type).toBe('lineage');

    // Nodes are unchanged by adding an edge
    expect(state.nodes).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// Test 5: GenUI Catalog Consistency
// ─────────────────────────────────────────────────────────────
// Ensures that the GenUI catalog schema map (SharedTypes) and
// the validateCatalogProps helper are consistent across modules.

describe('GenUI catalog consistency', () => {
  it('all 4 component names are in CatalogSchemaMap', () => {
    const keys = Object.keys(CatalogSchemaMap);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('ChoiceCards');
    expect(keys).toContain('ColorPickerGrid');
    expect(keys).toContain('SliderRange');
    expect(keys).toContain('ConfirmCard');
  });

  it('validateCatalogProps works for ChoiceCards', () => {
    const r = validateCatalogProps('ChoiceCards', {
      title: 'Test',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('validateCatalogProps works for ColorPickerGrid', () => {
    const r = validateCatalogProps('ColorPickerGrid', {
      title: 'Pick color',
      suggested: ['#FF0000', '#00FF00'],
    });
    expect(r.success).toBe(true);
  });

  it('validateCatalogProps works for SliderRange', () => {
    const r = validateCatalogProps('SliderRange', {
      title: 'Size',
      min: 0,
      max: 100,
      step: 1,
    });
    expect(r.success).toBe(true);
  });

  it('validateCatalogProps works for ConfirmCard', () => {
    const r = validateCatalogProps('ConfirmCard', {
      title: 'Sure?',
      body: 'This action is irreversible.',
      danger: true,
    });
    expect(r.success).toBe(true);
  });

  it('validateCatalogProps rejects unknown component', () => {
    const r = validateCatalogProps('UnknownComponent', {});
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Test 6: BackendServices Patch Consistency
// ─────────────────────────────────────────────────────────────
// Validates that backend services correctly reference all
// GenUI catalog components, patch system prompts, and parse
// agent output for UI fences.

describe('BackendServices patch consistency', () => {
  it('CATALOG_SYSTEM_PROMPT contains all 4 component names', () => {
    expect(CATALOG_SYSTEM_PROMPT).toContain('ChoiceCards');
    expect(CATALOG_SYSTEM_PROMPT).toContain('ColorPickerGrid');
    expect(CATALOG_SYSTEM_PROMPT).toContain('SliderRange');
    expect(CATALOG_SYSTEM_PROMPT).toContain('ConfirmCard');
  });

  it('patchSystemPrompt appends catalog instructions correctly', () => {
    const original = 'You are a helpful assistant.';
    const patched = patchSystemPrompt(original);

    // Patched prompt should contain the original content
    expect(patched).toContain(original);
    // Patched prompt should contain the catalog system prompt
    expect(patched).toContain('交互组件能力');
    // Patched prompt should be strictly longer than original
    // (separator + catalog prompt appended — not prepended)
    expect(patched.length).toBeGreaterThan(original.length);
    // The catalog prompt content should appear AFTER the original
    expect(patched.indexOf(original)).toBeLessThan(
      patched.indexOf('交互组件能力'),
    );
  });

  it('parseAgentChunkForGenUI detects ui fence and returns component', () => {
    const chunk = [
      'Let me ask you something:',
      '',
      '```ui',
      JSON.stringify({
        component: 'ChoiceCards',
        props: {
          title: 'Your choice?',
          options: [
            { id: 'a', label: 'Option A' },
            { id: 'b', label: 'Option B' },
          ],
        },
      }),
      '```',
    ].join('\n');

    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.component).toBe('ChoiceCards');
    expect(result.props).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('parseAgentChunkForGenUI returns isGenUI=false for plain text', () => {
    const result = parseAgentChunkForGenUI('Hello world');
    expect(result.isGenUI).toBe(false);
  });

  it('parseAgentChunkForGenUI rejects non-string input', () => {
    const result = parseAgentChunkForGenUI(42);
    expect(result.isGenUI).toBe(false);
  });

  it('parseAgentChunkForGenUI detects invalid JSON in ui fence', () => {
    const chunk = '```ui\n{ invalid json }\n```';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toContain('Invalid JSON');
  });

  it('parseAgentChunkForGenUI detects unknown catalog component', () => {
    const chunk = [
      '```ui',
      JSON.stringify({
        component: 'NonExistentComponent',
        props: {},
      }),
      '```',
    ].join('\n');

    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toContain('Unknown catalog component');
  });

  it('createWakeupMessage returns correctly structured message', async () => {
    // createWakeupMessage is exported from BackendServices but
    // it's stable — verify it exists and is a function
    const { createWakeupMessage } = await import(
      '../../AgentHub-V2—BackendServices/src/index'
    );

    expect(createWakeupMessage).toBeDefined();
    expect(typeof createWakeupMessage).toBe('function');

    const msg = createWakeupMessage('cmp-1', { chosenId: 'a' });
    expect(msg.role).toBe('system');
    expect(msg.content).toContain('cmp-1');
    expect(msg.content).toContain('chosenId');
  });
});
