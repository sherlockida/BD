import { describe, it, expect } from 'vitest';
import {
  CATALOG_SYSTEM_PROMPT,
  CatalogSchemaMap,
  validateCatalogProps,
  validateCatalogValue,
} from '../src/genuiCatalog';
import { patchSystemPrompt } from '../src/llmGateway';

// ────── CATALOG_SYSTEM_PROMPT ──────

describe('CATALOG_SYSTEM_PROMPT', () => {
  it('should be a non-empty string', () => {
    expect(typeof CATALOG_SYSTEM_PROMPT).toBe('string');
    expect(CATALOG_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('should contain all 4 component names', () => {
    expect(CATALOG_SYSTEM_PROMPT).toContain('ChoiceCards');
    expect(CATALOG_SYSTEM_PROMPT).toContain('ColorPickerGrid');
    expect(CATALOG_SYSTEM_PROMPT).toContain('SliderRange');
    expect(CATALOG_SYSTEM_PROMPT).toContain('ConfirmCard');
  });
});

// ────── patchSystemPrompt ──────

describe('patchSystemPrompt', () => {
  it('should append CATALOG_SYSTEM_PROMPT to the given prompt', () => {
    const original = 'You are a helpful assistant.';
    const result = patchSystemPrompt(original);
    expect(result.startsWith(original)).toBe(true);
    expect(result).toContain(CATALOG_SYSTEM_PROMPT);
    expect(result).toBe(original + '\n\n' + CATALOG_SYSTEM_PROMPT);
  });

  it('should preserve original prompt content', () => {
    const original = 'You are a code generation agent.';
    const result = patchSystemPrompt(original);
    expect(result.startsWith(original)).toBe(true);
    expect(result).not.toBe(original);
  });
});

// ────── CatalogSchemaMap re-exports ──────

describe('CatalogSchemaMap re-exports', () => {
  it('should have entries for all 4 components', () => {
    expect(CatalogSchemaMap).toHaveProperty('ChoiceCards');
    expect(CatalogSchemaMap).toHaveProperty('ColorPickerGrid');
    expect(CatalogSchemaMap).toHaveProperty('SliderRange');
    expect(CatalogSchemaMap).toHaveProperty('ConfirmCard');
  });

  it('should have props and value schemas for each entry', () => {
    const names = Object.keys(
      CatalogSchemaMap,
    ) as (keyof typeof CatalogSchemaMap)[];
    for (const name of names) {
      expect(CatalogSchemaMap[name]).toHaveProperty('props');
      expect(CatalogSchemaMap[name]).toHaveProperty('value');
    }
  });
});

// ────── validateCatalogProps re-export ──────

describe('validateCatalogProps re-export', () => {
  it('should validate valid ChoiceCards props', () => {
    const r = validateCatalogProps('ChoiceCards', {
      title: 'Pick',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('should reject unknown component', () => {
    const r = validateCatalogProps('NonExistent', {});
    expect(r.success).toBe(false);
  });
});

// ────── validateCatalogValue re-export ──────

describe('validateCatalogValue re-export', () => {
  it('should validate valid ChoiceCards value', () => {
    const r = validateCatalogValue('ChoiceCards', { chosenId: 'a' });
    expect(r.success).toBe(true);
  });

  it('should reject unknown component', () => {
    const r = validateCatalogValue('NonExistent', {});
    expect(r.success).toBe(false);
  });
});
