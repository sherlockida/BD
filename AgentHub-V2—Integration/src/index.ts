// ─────────────────────────────────────────────────────────────
// index.ts — Integration Module Barrel Export
// ─────────────────────────────────────────────────────────────
// Re-exports all public API surface from the Integration module.
// ─────────────────────────────────────────────────────────────

export {
  useAppBootstrap,
} from './bootstrap';
export type {
  AppBootstrapState,
} from './bootstrap';

export {
  nodeTypes,
  edgeTypes,
  initializeV2App,
} from './wiring';
export type {
  InitializeV2AppReturn,
} from './wiring';
