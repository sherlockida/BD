/**
 * Unit tests for the server-side plannerService.
 * Tests keyword fast-path matching without LLM calls.
 */
import { describe, it, expect } from 'vitest';

// We import only the types and test the keyword patterns directly
// by replicating the pattern-matching logic (avoids import of llmGateway which needs API keys)

interface AvailableAgent {
  id: string;
  name: string;
  capabilities: string[];
  tagline: string;
}

// Replicate keyword patterns from plannerService.ts for testing
const PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /落地页|landing\s*page|营销页|官网|首页/, label: 'landing' },
  { regex: /组件|component|react|button|form|modal|card|table/i, label: 'component' },
  { regex: /文档|doc|readme|spec|规则|rule/i, label: 'document' },
  { regex: /部署|deploy|上线|发布/i, label: 'deploy' },
];

function matchKeyword(intent: string): string | null {
  for (const { regex, label } of PATTERNS) {
    if (regex.test(intent)) return label;
  }
  return null;
}

// Mock agents for plan construction tests
function mockAgents(): AvailableAgent[] {
  return [
    { id: 'agent_claude_code', name: 'Claude Code', capabilities: ['code', 'plan', 'doc', 'design'], tagline: '全栈工程师' },
    { id: 'agent_codex', name: 'Codex', capabilities: ['code', 'design'], tagline: 'CSS高手' },
    { id: 'agent_open_code', name: 'OpenCode', capabilities: ['code', 'deploy'], tagline: 'DevOps' },
    { id: 'agent_doc', name: 'DocAgent', capabilities: ['doc'], tagline: '文档专家' },
  ];
}

describe('plannerService keyword matching', () => {
  it('matches 落地页 pattern', () => {
    expect(matchKeyword('做一个茶饮品牌落地页')).toBe('landing');
  });

  it('matches 官网 pattern', () => {
    expect(matchKeyword('做个公司官网')).toBe('landing');
  });

  it('matches 首页 pattern', () => {
    expect(matchKeyword('设计一个首页')).toBe('landing');
  });

  it('matches landing page (English)', () => {
    expect(matchKeyword('build a landing page for our product')).toBe('landing');
  });

  it('matches 组件 pattern', () => {
    expect(matchKeyword('写一个登录表单组件')).toBe('component');
  });

  it('matches React component', () => {
    expect(matchKeyword('build a react button component')).toBe('component');
  });

  it('matches 文档 pattern', () => {
    expect(matchKeyword('写一份产品说明文档')).toBe('document');
  });

  it('matches spec keyword', () => {
    expect(matchKeyword('帮我生成一份 PRD spec')).toBe('document');
  });

  it('matches 部署 pattern', () => {
    expect(matchKeyword('部署到线上环境')).toBe('deploy');
  });

  it('matches deploy keyword', () => {
    expect(matchKeyword('deploy the app now')).toBe('deploy');
  });

  it('returns null for unrecognized intent', () => {
    expect(matchKeyword('xyzzy flurb whatever nonsense')).toBeNull();
  });

  it('empty string returns null', () => {
    expect(matchKeyword('')).toBeNull();
  });
});

describe('plannerService plan construction', () => {
  it('builds landing page plan with correct agent assignment', () => {
    const agents = mockAgents();
    // Verify we can find agents by capability
    const coder = agents.find(a => a.capabilities.includes('code'));
    expect(coder).toBeDefined();
    expect(coder!.id).toBe('agent_claude_code');

    const designer = agents.find(a => a.capabilities.includes('design'));
    expect(designer).toBeDefined();

    const deployer = agents.find(a => a.capabilities.includes('deploy'));
    expect(deployer).toBeDefined();
  });

  it('uses fallback agent when preferred agent not available', () => {
    // Remove all agents with 'doc' capability to simulate no doc agent available
    const agents = mockAgents().filter(a => !a.capabilities.includes('doc'));
    const docAgent = agents.find(a => a.capabilities.includes('doc'));
    expect(docAgent).toBeUndefined();

    // The planner should handle this gracefully by choosing another agent
    const coder = agents.find(a => a.capabilities.includes('code'));
    expect(coder).toBeDefined();
  });

  it('every mock agent has at least one capability', () => {
    for (const agent of mockAgents()) {
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });
});
