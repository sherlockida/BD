// ─────────────────────────────────────────────────────────────
// GenUI Catalog — Zod schemas for 4 built-in components
// ─────────────────────────────────────────────────────────────

import { z } from 'zod';

// ────── ChoiceCards ──────

const ChoiceCardsOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  preview: z.string().optional(),
  description: z.string().optional(),
});

export const ChoiceCardsPropsSchema = z.object({
  title: z.string(),
  options: z
    .array(ChoiceCardsOptionSchema)
    .min(2, 'Must have at least 2 options')
    .max(6, 'Must have at most 6 options'),
});

export const ChoiceCardsValueSchema = z.object({
  chosenId: z.string(),
});

// ────── ColorPickerGrid ──────

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const HexColorSchema = z.string().regex(hexColorRegex, 'Invalid hex color');

export const ColorPickerGridPropsSchema = z.object({
  title: z.string(),
  suggested: z.array(HexColorSchema).max(12, 'At most 12 suggested colors'),
  allowCustom: z.boolean().default(true),
});

export const ColorPickerGridValueSchema = z.object({
  hex: z.string().regex(hexColorRegex, 'Invalid hex color'),
});

// ────── SliderRange ──────

export const SliderRangePropsSchema = z.object({
  title: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number().default(1),
  defaultValue: z.number().optional(),
  unit: z.string().optional(),
});

export const SliderRangeValueSchema = z.object({
  value: z.number(),
});

// ────── ConfirmCard ──────

export const ConfirmCardPropsSchema = z.object({
  title: z.string(),
  body: z.string(),
  danger: z.boolean().default(false),
  confirmLabel: z.string().default('确认'),
  cancelLabel: z.string().default('取消'),
});

export const ConfirmCardValueSchema = z.object({
  confirmed: z.boolean(),
});

// ────── Catalog Maps ──────

/**
 * Maps each component name to an object of { props, value } Zod schemas.
 */
export const CatalogSchemaMap = {
  ChoiceCards: {
    props: ChoiceCardsPropsSchema,
    value: ChoiceCardsValueSchema,
  },
  ColorPickerGrid: {
    props: ColorPickerGridPropsSchema,
    value: ColorPickerGridValueSchema,
  },
  SliderRange: {
    props: SliderRangePropsSchema,
    value: SliderRangeValueSchema,
  },
  ConfirmCard: {
    props: ConfirmCardPropsSchema,
    value: ConfirmCardValueSchema,
  },
} as const;

/** Union type of all valid catalog component names */
export type CatalogName = keyof typeof CatalogSchemaMap;

// ────── Validation Helpers ──────

/**
 * Validate props for a named catalog component using safeParse.
 * Returns the Zod result object with { success, data, error }.
 */
export function validateCatalogProps(
  name: string,
  props: unknown,
): z.SafeParseReturnType<unknown, unknown> {
  const entry = CatalogSchemaMap[name as CatalogName];
  if (!entry) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Unknown catalog component: ${name}`,
          path: [],
        },
      ]),
      data: undefined as unknown,
    } as z.SafeParseReturnType<unknown, unknown>;
  }
  return entry.props.safeParse(props) as unknown as z.SafeParseReturnType<
    unknown,
    unknown
  >;
}

/**
 * Validate a value payload for a named catalog component using safeParse.
 * Returns the Zod result object with { success, data, error }.
 */
export function validateCatalogValue(
  name: string,
  value: unknown,
): z.SafeParseReturnType<unknown, unknown> {
  const entry = CatalogSchemaMap[name as CatalogName];
  if (!entry) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Unknown catalog component: ${name}`,
          path: [],
        },
      ]),
      data: undefined as unknown,
    } as z.SafeParseReturnType<unknown, unknown>;
  }
  return entry.value.safeParse(value) as unknown as z.SafeParseReturnType<
    unknown,
    unknown
  >;
}
