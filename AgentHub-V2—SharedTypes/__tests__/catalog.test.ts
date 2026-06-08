import { describe, it, expect } from 'vitest';
import {
  ChoiceCardsPropsSchema,
  ChoiceCardsValueSchema,
  ColorPickerGridPropsSchema,
  ColorPickerGridValueSchema,
  SliderRangePropsSchema,
  SliderRangeValueSchema,
  ConfirmCardPropsSchema,
  ConfirmCardValueSchema,
  validateCatalogProps,
  validateCatalogValue,
} from '../src/catalog';

// ────── ChoiceCards ──────

describe('ChoiceCards', () => {
  it('accepts valid props (2 options)', () => {
    const r = ChoiceCardsPropsSchema.safeParse({
      title: 'Pick one',
      options: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects props with fewer than 2 options', () => {
    const r = ChoiceCardsPropsSchema.safeParse({
      title: 'Pick one',
      options: [{ id: 'a', label: 'Alpha' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects props with more than 6 options', () => {
    const r = ChoiceCardsPropsSchema.safeParse({
      title: 'Pick one',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
        { id: 'e', label: 'E' },
        { id: 'f', label: 'F' },
        { id: 'g', label: 'G' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejects props missing title', () => {
    const r = ChoiceCardsPropsSchema.safeParse({
      options: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid value', () => {
    const r = ChoiceCardsValueSchema.safeParse({ chosenId: 'a' });
    expect(r.success).toBe(true);
  });

  it('rejects non-object value', () => {
    const r = ChoiceCardsValueSchema.safeParse('not-an-object');
    expect(r.success).toBe(false);
  });
});

// ────── ColorPickerGrid ──────

describe('ColorPickerGrid', () => {
  it('accepts valid props', () => {
    const r = ColorPickerGridPropsSchema.safeParse({
      title: 'Pick a color',
      suggested: ['#FF0000', '#00FF00', '#0000FF'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid hex in suggested', () => {
    const r = ColorPickerGridPropsSchema.safeParse({
      title: 'Pick a color',
      suggested: ['#FF0000', '#GGGGGG'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects more than 12 suggested colors', () => {
    const r = ColorPickerGridPropsSchema.safeParse({
      title: 'Pick a color',
      suggested: [
        '#000001', '#000002', '#000003', '#000004',
        '#000005', '#000006', '#000007', '#000008',
        '#000009', '#00000A', '#00000B', '#00000C',
        '#00000D',
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid value', () => {
    const r = ColorPickerGridValueSchema.safeParse({
      hex: '#336699',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid hex value', () => {
    const r = ColorPickerGridValueSchema.safeParse({
      hex: 'red',
    });
    expect(r.success).toBe(false);
  });
});

// ────── SliderRange ──────

describe('SliderRange', () => {
  it('accepts valid props with all optional fields', () => {
    const r = SliderRangePropsSchema.safeParse({
      title: 'Volume',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 50,
      unit: '%',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid props without optional fields', () => {
    const r = SliderRangePropsSchema.safeParse({
      title: 'Volume',
      min: 0,
      max: 100,
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid value', () => {
    const r = SliderRangeValueSchema.safeParse({ value: 75 });
    expect(r.success).toBe(true);
  });

  it('rejects non-numeric value', () => {
    const r = SliderRangeValueSchema.safeParse({ value: 'loud' });
    expect(r.success).toBe(false);
  });
});

// ────── ConfirmCard ──────

describe('ConfirmCard', () => {
  it('accepts valid props with danger and defaults', () => {
    const r = ConfirmCardPropsSchema.safeParse({
      title: 'Delete?',
      body: 'Are you sure?',
      danger: true,
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid props with defaults only', () => {
    const r = ConfirmCardPropsSchema.safeParse({
      title: 'Confirm',
      body: 'Proceed?',
    });
    expect(r.success).toBe(true);
  });

  it('accepts valid value true', () => {
    const r = ConfirmCardValueSchema.safeParse({ confirmed: true });
    expect(r.success).toBe(true);
  });

  it('accepts valid value false', () => {
    const r = ConfirmCardValueSchema.safeParse({ confirmed: false });
    expect(r.success).toBe(true);
  });

  it('rejects non-boolean value', () => {
    const r = ConfirmCardValueSchema.safeParse({ confirmed: 'yes' });
    expect(r.success).toBe(false);
  });
});

// ────── validateCatalogProps / validateCatalogValue ──────

describe('validateCatalogProps', () => {
  it('returns success for a valid component props', () => {
    const r = validateCatalogProps('ChoiceCards', {
      title: 'Pick',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('returns error for an unknown component name', () => {
    const r = validateCatalogProps('NonExistent', {});
    expect(r.success).toBe(false);
  });
});

describe('validateCatalogValue', () => {
  it('returns success for a valid component value', () => {
    const r = validateCatalogValue('ChoiceCards', { chosenId: 'a' });
    expect(r.success).toBe(true);
  });

  it('returns error for an unknown component name', () => {
    const r = validateCatalogValue('NonExistent', {});
    expect(r.success).toBe(false);
  });
});
