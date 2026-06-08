// ─────────────────────────────────────────────────────────────
// Barrel Export — AgentHub-V2—BackendServices
// ─────────────────────────────────────────────────────────────

export {
  CatalogSchemaMap,
  validateCatalogProps,
  validateCatalogValue,
  CATALOG_SYSTEM_PROMPT,
} from './genuiCatalog';

export { patchSystemPrompt } from './llmGateway';

export {
  parseAgentChunkForGenUI,
  createWakeupMessage,
} from './plannerService';
export type { ParseGenUIResult } from './plannerService';

export { uiInputHandler } from './routes-agents';
export type { UiInputDeps } from './routes-agents';
