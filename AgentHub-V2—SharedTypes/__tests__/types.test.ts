import { describe, it, expect } from 'vitest';
import {
  isTextChunk,
  isUiComponent,
  isCodeChunk,
  isArtifactDraft,
  isDoneChunk,
  isErrorChunk,
} from '../src/chunkTypes';
import type { AgentChunkV2 } from '../src/chunkTypes';
import type { UiComponentChunk } from '../src/types';

function textChunk(delta = 'hello'): AgentChunkV2 {
  return { type: 'text', delta };
}
function uiChunk(
  overrides?: Partial<UiComponentChunk>,
): AgentChunkV2 {
  return {
    type: 'ui-component',
    componentId: 'cmp-1',
    component: 'ChoiceCards',
    props: {},
    awaitsInput: true,
    ...overrides,
  };
}
function codeChunk(): AgentChunkV2 {
  return { type: 'code', language: 'ts', code: 'const x = 1;' };
}
function artifactDraft(): AgentChunkV2 {
  return {
    type: 'artifact-draft',
    artifactType: 'code',
    name: 'index.ts',
    content: '// hello',
    commitMessage: 'init',
  };
}
function doneChunk(): AgentChunkV2 {
  return { type: 'done' };
}
function errorChunk(): AgentChunkV2 {
  return { type: 'error', error: 'something went wrong' };
}

// ────── isTextChunk ──────

describe('isTextChunk', () => {
  it('returns true for text chunk', () => {
    expect(isTextChunk(textChunk())).toBe(true);
  });

  it('returns false for non-text chunk', () => {
    expect(isTextChunk(codeChunk())).toBe(false);
    expect(isTextChunk(doneChunk())).toBe(false);
  });
});

// ────── isUiComponent ──────

describe('isUiComponent', () => {
  it('returns true for ui-component chunk', () => {
    expect(isUiComponent(uiChunk())).toBe(true);
  });

  it('returns false for non-ui-component chunk', () => {
    expect(isUiComponent(textChunk())).toBe(false);
    expect(isUiComponent(doneChunk())).toBe(false);
  });
});

// ────── isCodeChunk ──────

describe('isCodeChunk', () => {
  it('returns true for code chunk', () => {
    expect(isCodeChunk(codeChunk())).toBe(true);
  });

  it('returns false for non-code chunk', () => {
    expect(isCodeChunk(textChunk())).toBe(false);
    expect(isCodeChunk(artifactDraft())).toBe(false);
  });
});

// ────── isArtifactDraft ──────

describe('isArtifactDraft', () => {
  it('returns true for artifact-draft chunk', () => {
    expect(isArtifactDraft(artifactDraft())).toBe(true);
  });

  it('returns false for non-artifact-draft chunk', () => {
    expect(isArtifactDraft(textChunk())).toBe(false);
    expect(isArtifactDraft(codeChunk())).toBe(false);
  });
});

// ────── isDoneChunk ──────

describe('isDoneChunk', () => {
  it('returns true for done chunk', () => {
    expect(isDoneChunk(doneChunk())).toBe(true);
  });

  it('returns false for non-done chunk', () => {
    expect(isDoneChunk(textChunk())).toBe(false);
    expect(isDoneChunk(codeChunk())).toBe(false);
  });
});

// ────── isErrorChunk ──────

describe('isErrorChunk', () => {
  it('returns true for error chunk', () => {
    expect(isErrorChunk(errorChunk())).toBe(true);
  });

  it('returns false for non-error chunk', () => {
    expect(isErrorChunk(textChunk())).toBe(false);
    expect(isErrorChunk(doneChunk())).toBe(false);
  });
});
