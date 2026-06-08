import { describe, it, expect } from 'vitest';
import { parseUiFence } from '../src/parseUiFence';

describe('parseUiFence', () => {
  it('should parse valid ChoiceCards ui fence', () => {
    const text =
      '```ui\n{"component":"ChoiceCards","props":{"title":"选择","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ChoiceCards');
    expect(result.props).toEqual({
      title: '选择',
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(result.error).toBeUndefined();
  });

  it('should parse valid ColorPickerGrid ui fence', () => {
    const text =
      '```ui\n{"component":"ColorPickerGrid","props":{"title":"选色","suggested":["#FF0000","#00FF00"],"allowCustom":true}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ColorPickerGrid');
    expect(result.props).toMatchObject({
      title: '选色',
      suggested: ['#FF0000', '#00FF00'],
    });
  });

  it('should parse valid SliderRange ui fence', () => {
    const text =
      '```ui\n{"component":"SliderRange","props":{"title":"调整","min":0,"max":10,"step":1,"unit":"px"}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('SliderRange');
    expect(result.props).toMatchObject({ title: '调整', min: 0, max: 10 });
  });

  it('should parse valid ConfirmCard ui fence', () => {
    const text =
      '```ui\n{"component":"ConfirmCard","props":{"title":"确认","body":"确定删除?","danger":true,"confirmLabel":"删除","cancelLabel":"取消"}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ConfirmCard');
    expect(result.props).toMatchObject({ title: '确认', body: '确定删除?' });
  });

  it('should return found:false for plain text without ui fence', () => {
    const text = 'Hello world, this is a normal message without any ui fence.';
    const result = parseUiFence(text);
    expect(result.found).toBe(false);
    expect(result.component).toBeUndefined();
  });

  it('should return error for invalid JSON inside ui fence', () => {
    const text = '```ui\n{invalid json here}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.error).toContain('Invalid JSON');
  });

  it('should return error when JSON has no component field', () => {
    const text = '```ui\n{"props":{"title":"test"}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.error).toContain('Missing component');
  });

  it('should return error when component is not in catalog', () => {
    const text =
      '```ui\n{"component":"UnknownWidget","props":{"title":"test"}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.error).toContain('Unknown catalog component');
  });

  it('should return error when props fail schema validation', () => {
    // ChoiceCards requires at least 2 options — only 1 provided
    const text =
      '```ui\n{"component":"ChoiceCards","props":{"title":"test","options":[{"id":"a","label":"A"}]}}\n```';
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.error).toBeDefined();
  });

  it('should return found:false for unclosed fence (no closing backticks)', () => {
    const text =
      '```ui\n{"component":"ChoiceCards","props":{"title":"test","options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}}';
    const result = parseUiFence(text);
    expect(result.found).toBe(false);
  });

  it('should parse only the first fence when multiple exist', () => {
    const text = [
      '```ui',
      '{"component":"ConfirmCard","props":{"title":"确认","body":"确定?"}}',
      '```',
      'some text in between',
      '```ui',
      '{"component":"SliderRange","props":{"title":"调整","min":0,"max":10,"step":1}}',
      '```',
    ].join('\n');
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ConfirmCard');
  });

  it('should handle fence with surrounding text', () => {
    const text = [
      'Before text',
      '```ui',
      '{"component":"ChoiceCards","props":{"title":"选择","options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]}}',
      '```',
      'After text',
    ].join('\n');
    const result = parseUiFence(text);
    expect(result.found).toBe(true);
    expect(result.component).toBe('ChoiceCards');
  });
});
