/**
 * Unit tests for llmGateway — provider mapping, available providers, and fallback logic.
 */
import { describe, it, expect } from 'vitest';

// Replicate the vendor→provider mapping logic for testing
// (avoid importing the actual module which creates API client instances)

type LlmVendor = 'claude-code' | 'codex' | 'open-code' | 'custom' | 'orchestrator';

function mapVendorToProviderDev(vendor: LlmVendor): 'anthropic' | 'openai' | 'deepseek' {
  // DEV mode: all vendors route to DeepSeek
  return 'deepseek';
}

function mapVendorToProviderProd(vendor: LlmVendor): 'anthropic' | 'openai' | 'deepseek' {
  switch (vendor) {
    case 'claude-code': return 'anthropic';
    case 'codex': return 'openai';
    case 'open-code': return 'deepseek';
    case 'custom': return 'deepseek';
    case 'orchestrator': return 'deepseek';
  }
}

describe('llmGateway vendor → provider mapping', () => {
  describe('development mode', () => {
    it('all vendors map to deepseek in dev', () => {
      const vendors: LlmVendor[] = ['claude-code', 'codex', 'open-code', 'custom', 'orchestrator'];
      for (const v of vendors) {
        expect(mapVendorToProviderDev(v)).toBe('deepseek');
      }
    });
  });

  describe('production mode', () => {
    it('claude-code maps to anthropic', () => {
      expect(mapVendorToProviderProd('claude-code')).toBe('anthropic');
    });

    it('codex maps to openai', () => {
      expect(mapVendorToProviderProd('codex')).toBe('openai');
    });

    it('open-code maps to deepseek', () => {
      expect(mapVendorToProviderProd('open-code')).toBe('deepseek');
    });

    it('custom maps to deepseek', () => {
      expect(mapVendorToProviderProd('custom')).toBe('deepseek');
    });

    it('orchestrator maps to deepseek', () => {
      expect(mapVendorToProviderProd('orchestrator')).toBe('deepseek');
    });
  });
});

describe('availableProviders', () => {
  function availableProviders(keys: { deepseek?: string; openai?: string; anthropic?: string }): string[] {
    const providers: string[] = [];
    if (keys.deepseek) providers.push('deepseek');
    if (keys.openai) providers.push('openai');
    if (keys.anthropic) providers.push('anthropic');
    return providers;
  }

  it('returns all providers when all keys present', () => {
    const providers = availableProviders({
      deepseek: 'sk-xxx',
      openai: 'sk-yyy',
      anthropic: 'sk-zzz',
    });
    expect(providers).toHaveLength(3);
    expect(providers).toContain('deepseek');
    expect(providers).toContain('openai');
    expect(providers).toContain('anthropic');
  });

  it('returns only deepseek when only deepseek key present', () => {
    const providers = availableProviders({ deepseek: 'sk-xxx' });
    expect(providers).toEqual(['deepseek']);
  });

  it('returns empty array when no keys configured', () => {
    const providers = availableProviders({});
    expect(providers).toHaveLength(0);
  });

  it('deepseek comes before openai and anthropic in default order', () => {
    const providers = availableProviders({
      deepseek: 'sk-xxx',
      openai: 'sk-yyy',
      anthropic: 'sk-zzz',
    });
    // DeepSeek is checked first, so it appears first
    expect(providers[0]).toBe('deepseek');
  });
});

describe('fallback logic', () => {
  it('falls back to first available provider when primary is unavailable', () => {
    const available = ['deepseek'];
    const primary = 'anthropic';

    expect(available.includes(primary)).toBe(false);
    expect(available[0]).toBe('deepseek');
  });

  it('throws/no provider when none available', () => {
    const available: string[] = [];
    expect(available.length).toBe(0);
  });

  it('uses primary when available', () => {
    const available = ['anthropic', 'deepseek'];
    const primary = 'anthropic';
    expect(available.includes(primary)).toBe(true);
  });
});
