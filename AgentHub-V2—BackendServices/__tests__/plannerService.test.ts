import { describe, it, expect } from 'vitest';
import {
  parseAgentChunkForGenUI,
  createWakeupMessage,
} from '../src/plannerService';

// ────── parseAgentChunkForGenUI ──────

describe('parseAgentChunkForGenUI', () => {
  it('should return isGenUI=false for a plain text chunk', () => {
    const chunk = 'Hello, I am thinking about your request...';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(false);
  });

  it('should return isGenUI=false for a non-string chunk', () => {
    const result = parseAgentChunkForGenUI({
      type: 'text',
      content: 'hello',
    });
    expect(result.isGenUI).toBe(false);
  });

  it('should detect and parse a valid ui fence chunk', () => {
    const chunk = [
      'Here is what I think:',
      '',
      '```ui',
      '{',
      '  "component": "ChoiceCards",',
      '  "props": {',
      '    "title": "Pick a style",',
      '    "options": [',
      '      { "id": "a", "label": "Option A" },',
      '      { "id": "b", "label": "Option B" }',
      '    ]',
      '  }',
      '}',
      '```',
      '',
      'Let me know which one you prefer.',
    ].join('\n');

    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.component).toBe('ChoiceCards');
    expect(result.props).toBeDefined();
    expect(result.props?.title).toBe('Pick a style');
    expect(result.error).toBeUndefined();
  });

  it('should reject invalid JSON inside ui fence', () => {
    const chunk = '```ui\n{ invalid json }\n```';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it('should reject missing component field in ui fence JSON', () => {
    const chunk = '```ui\n{ "props": { "title": "test" } }\n```';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toContain('Missing component');
  });

  it('should reject unknown catalog component name', () => {
    const chunk = '```ui\n{ "component": "UnknownComp", "props": {} }\n```';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toContain('Unknown catalog component');
  });

  it('should reject invalid props for a known component', () => {
    const chunk =
      '```ui\n{ "component": "ChoiceCards", "props": { "title": "Test" } }\n```';
    const result = parseAgentChunkForGenUI(chunk);
    expect(result.isGenUI).toBe(true);
    expect(result.error).toBeTruthy();
  });
});

// ────── createWakeupMessage ──────

describe('createWakeupMessage', () => {
  it('should return a system message with role "system"', () => {
    const msg = createWakeupMessage('comp-1', { chosenId: 'a' });
    expect(msg.role).toBe('system');
  });

  it('should include the componentId in the content', () => {
    const msg = createWakeupMessage('comp-123', 'some-value');
    expect(msg.content).toContain('comp-123');
  });

  it('should JSON stringify the value in the content', () => {
    const value = { chosenId: 'minimal', label: '极简' };
    const msg = createWakeupMessage('comp-1', value);
    expect(msg.content).toContain(JSON.stringify(value));
  });

  it('should handle numeric values', () => {
    const msg = createWakeupMessage('slider-1', 42);
    expect(msg.content).toContain('42');
  });

  it('should handle boolean values', () => {
    const msg = createWakeupMessage('confirm-1', true);
    expect(msg.content).toContain('true');
  });
});
