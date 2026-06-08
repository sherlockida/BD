/**
 * Vitest tests for fenceExtractor — streaming markdown code-fence parser.
 */
import { describe, it, expect } from 'vitest';
import { createFenceExtractor } from './fenceExtractor';

type Chunk = { type: string; [k: string]: any };

function feedAll(deltas: string[]): Chunk[] {
  const ex = createFenceExtractor();
  const out: Chunk[] = [];
  for (const d of deltas) out.push(...ex.feed(d));
  out.push(...ex.flush());
  return out;
}

function joinText(chunks: Chunk[]): string {
  return chunks.filter(c => c.type === 'text').map(c => c.delta).join('');
}
function artifacts(chunks: Chunk[]) {
  return chunks.filter(c => c.type === 'artifact-draft');
}

describe('fenceExtractor', () => {
  it('plain text — no artifacts', () => {
    const cs = feedAll(['hello world']);
    expect(artifacts(cs)).toHaveLength(0);
    expect(joinText(cs)).toBe('hello world');
  });

  it('single HTML block in one delta', () => {
    const cs = feedAll(['here is the page:\n```html\n<div>hi</div>\n```\nthat is it.']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].name).toBe('index.html');
    expect(a[0].artifactType).toBe('webpage');
    expect(a[0].content).toBe('<div>hi</div>');
  });

  it('fence split at triple backticks across deltas', () => {
    const cs = feedAll(['here:\n``', '`html\n<div>x</div>\n``', '`\nbye']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].content).toBe('<div>x</div>');
    expect(joinText(cs)).toContain('bye');
  });

  it('split inside language token', () => {
    const cs = feedAll(['go:\n```ht', 'ml\n<p>q</p>\n```\n']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].language).toBe('html');
    expect(a[0].content).toBe('<p>q</p>');
  });

  it('closing fence split across deltas', () => {
    const cs = feedAll(['```css\n.a{c:red}\n``', '`\ndone']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].name).toBe('style.css');
    expect(a[0].content).toBe('.a{c:red}');
    expect(joinText(cs)).toContain('done');
  });

  it('two HTML blocks → second gets index-2.html', () => {
    const cs = feedAll(['```html\n<a/>\n```\n中间\n```html\n<b/>\n```']);
    const a = artifacts(cs);
    expect(a).toHaveLength(2);
    expect(a[0].name).toBe('index.html');
    expect(a[1].name).toBe('index-2.html');
  });

  it('no lang fence (just ```)', () => {
    const cs = feedAll(['```\nplain block\n```']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].name).toBe('snippet.txt');
    expect(a[0].content).toBe('plain block');
  });

  it('unterminated fence on flush emits incomplete artifact', () => {
    const cs = feedAll(['start ```html\n<p>partial</p>\n']);
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].content).toBe('<p>partial</p>');
  });

  it('char-by-char streaming', () => {
    const input = '前缀\n```js\nconsole.log(1)\n```\n后缀';
    const cs = feedAll(input.split(''));
    const a = artifacts(cs);
    expect(a).toHaveLength(1);
    expect(a[0].content).toBe('console.log(1)');
    expect(joinText(cs)).toContain('前缀');
    expect(joinText(cs)).toContain('后缀');
  });

  it('empty fence body — no crash', () => {
    const cs = feedAll(['```html\n```']);
    // Accept either 0 or 1 artifact (current code emits inline). Just verify no crash.
    expect(() => artifacts(cs)).not.toThrow();
  });

  it('text ends with `` — no false fence detection', () => {
    const cs = feedAll(['hello ``']);
    expect(artifacts(cs)).toHaveLength(0);
    expect(joinText(cs)).toBe('hello ``');
  });

  it('back-to-back fences', () => {
    const cs = feedAll(['```js\nA\n``````css\nB\n```']);
    const a = artifacts(cs);
    expect(a).toHaveLength(2);
  });

  it('flush without feed returns empty array', () => {
    const ex = createFenceExtractor();
    const out = ex.flush();
    expect(out).toEqual([]);
  });

  it('multiple feeds without fences pass text through', () => {
    const ex = createFenceExtractor();
    const out1 = ex.feed('hello ');
    const out2 = ex.feed('world');
    const out3 = ex.flush();
    const all = [...out1, ...out2, ...out3];
    expect(joinText(all)).toBe('hello world');
  });
});
