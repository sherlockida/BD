// ─────────────────────────────────────────────────────────────
// Planner State Machine — Backend Patch Functions
// Parses GenUI fence chunks and creates wake-up messages
// ─────────────────────────────────────────────────────────────

import {
  CatalogSchemaMap,
  validateCatalogProps,
} from '@shared/catalog';
import type { CatalogComponentName } from '@shared/types';

const CATALOG_NAMES: CatalogComponentName[] = [
  'ChoiceCards',
  'ColorPickerGrid',
  'SliderRange',
  'ConfirmCard',
];

export interface ParseGenUIResult {
  isGenUI: boolean;
  component?: string;
  props?: Record<string, unknown>;
  error?: string;
}

/**
 * Parse a ```ui ... ``` fence from an agent text chunk.
 *
 * Pure function — no side effects.
 * Returns { isGenUI: false } when no ui fence is present.
 * Returns { isGenUI: true, error: string } on parse or validation failure.
 * Returns { isGenUI: true, component, props } on success.
 *
 * @param chunk — The agent output chunk (expected to be a string)
 */
export function parseAgentChunkForGenUI(chunk: unknown): ParseGenUIResult {
  // Only strings can contain fences
  if (typeof chunk !== 'string') {
    return { isGenUI: false };
  }

  // Match ```ui ... ``` fence
  const fenceRegex = /```ui\n([\s\S]*?)```/;
  const match = chunk.match(fenceRegex);

  if (!match) {
    return { isGenUI: false };
  }

  const jsonStr = match[1].trim();

  // Try to parse JSON content inside the fence
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { isGenUI: true, error: 'Invalid JSON in ui fence' };
  }

  // Validate JSON structure: must be a plain object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { isGenUI: true, error: 'Invalid JSON structure in ui fence' };
  }

  const obj = parsed as Record<string, unknown>;

  // Must have a 'component' field
  if (!obj.component || typeof obj.component !== 'string') {
    return {
      isGenUI: true,
      error: 'Missing component field in ui fence JSON',
    };
  }

  const componentName = obj.component;

  // Component must be in the catalog
  if (!CATALOG_NAMES.includes(componentName as CatalogComponentName)) {
    return {
      isGenUI: true,
      error: `Unknown catalog component: ${componentName}`,
    };
  }

  // Validate props against the catalog schema
  const props = (obj.props ?? {}) as Record<string, unknown>;
  const validationResult = validateCatalogProps(componentName, props);

  if (!validationResult.success) {
    const message =
      validationResult.error instanceof Error
        ? validationResult.error.message
        : 'Props validation failed';
    return { isGenUI: true, error: message };
  }

  return {
    isGenUI: true,
    component: componentName,
    props: validationResult.data as Record<string, unknown>,
  };
}

/**
 * Generate a system message that wakes up an agent after the user
 * interacts with a GenUI component.
 *
 * @param componentId — The ID of the component the user interacted with
 * @param value — The value submitted by the user
 * @returns A system message object ready for insertion into conversation history
 */
export function createWakeupMessage(
  componentId: string,
  value: unknown,
): { role: 'system'; content: string } {
  return {
    role: 'system',
    content: `用户已对组件 ${componentId} 做出选择: ${JSON.stringify(value)}。请继续完成未完成的任务。`,
  };
}
