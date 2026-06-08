import { validateCatalogProps } from '@shared/catalog';
import type { CatalogComponentName } from '@shared/types';

const CATALOG_NAMES: CatalogComponentName[] = [
  'ChoiceCards',
  'ColorPickerGrid',
  'SliderRange',
  'ConfirmCard',
];

export interface ParseUiFenceResult {
  found: boolean;
  component?: CatalogComponentName;
  props?: Record<string, unknown>;
  error?: string;
}

/**
 * Parse a ```ui ... ``` fence from agent text output.
 *
 * Pure function — no side effects.
 * Returns { found: false } when no ui fence is present.
 * Returns { found: true, error: string } on parse or validation failure.
 * Returns { found: true, component, props } on success.
 */
export function parseUiFence(text: string): ParseUiFenceResult {
  const fenceRegex = /```ui\n([\s\S]*?)```/;
  const match = text.match(fenceRegex);

  if (!match) {
    return { found: false };
  }

  const jsonStr = match[1].trim();

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { found: true, error: 'Invalid JSON' };
  }

  // Must be a plain object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { found: true, error: 'Invalid JSON' };
  }

  const obj = parsed as Record<string, unknown>;

  // Check for component field
  if (!obj.component || typeof obj.component !== 'string') {
    return { found: true, error: 'Missing component field in ui fence JSON' };
  }

  const componentName = obj.component;

  // Check if component is in catalog
  if (!CATALOG_NAMES.includes(componentName as CatalogComponentName)) {
    return { found: true, error: `Unknown catalog component: ${componentName}` };
  }

  // Validate props with Zod schema
  const props = (obj.props ?? {}) as Record<string, unknown>;
  const result = validateCatalogProps(componentName, props);

  if (!result.success) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : 'Props validation failed';
    return { found: true, error: message };
  }

  return {
    found: true,
    component: componentName as CatalogComponentName,
    props: result.data as Record<string, unknown>,
  };
}
