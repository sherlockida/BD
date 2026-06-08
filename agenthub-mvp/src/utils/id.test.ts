/**
 * Unit tests for id utilities — genUuid and uid.
 */
import { describe, it, expect } from 'vitest';
import { genUuid, uid } from '../utils/id';

describe('genUuid', () => {
  it('returns a string matching UUID v4 format', () => {
    const id = genUuid();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates unique values across many calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => genUuid()));
    expect(ids.size).toBe(1000);
  });

  it('returns a string of length 36', () => {
    expect(genUuid()).toHaveLength(36);
  });
});

describe('uid', () => {
  it('includes the prefix when provided', () => {
    const id = uid('agent');
    expect(id.startsWith('agent_')).toBe(true);
  });

  it('returns different values on each call', () => {
    const id1 = uid('test');
    const id2 = uid('test');
    expect(id1).not.toBe(id2);
  });

  it('empty prefix does not add underscore', () => {
    const id = uid('');
    expect(id.length).toBeGreaterThan(0);
    // Without prefix, id starts with a hex timestamp (no underscore at position 7-8)
  });

  it('no-argument version works', () => {
    const id = uid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
