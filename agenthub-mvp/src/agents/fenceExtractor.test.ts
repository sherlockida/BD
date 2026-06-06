/**
 * Smoke test for fenceExtractor. Run with: node --experimental-strip-types fenceExtractor.test.ts
 * (or compile via tsc and run the .js)
 *
 * Goal: confirm behavior across the most adversarial split patterns we expect from LLM streams.
 */
import { createFenceExtractor } from './fenceExtractor.ts';

type Chunk = { type: string; [k: string]: any };

function run(name: string, deltas: string[], expected: (chunks: Chunk[]) => string | null) {
  const ex = createFenceExtractor();
  const out: Chunk[] = [];
  for (const d of deltas) out.push(...ex.feed(d));
  out.push(...ex.flush());
  const err = expected(out);
  const status = err ? '❌' : '✅';
  const summary = out
    .map(c => {
      if (c.type === 'text') return `T(${JSON.stringify(c.delta)})`;
      if (c.type === 'artifact-draft') return `A[${c.name}/${c.artifactType}/${c.language}|${JSON.stringify(c.content)}]`;
      return c.type;
    })
    .join(' ');
  console.log(`${status} ${name}\n   chunks: ${summary}`);
  if (err) console.log(`   FAIL: ${err}`);
  return !err;
}

function joinText(chunks: Chunk[]) {
  return chunks.filter(c => c.type === 'text').map(c => c.delta).join('');
}
function artifacts(chunks: Chunk[]) {
  return chunks.filter(c => c.type === 'artifact-draft');
}

let pass = 0, fail = 0;
function tally(ok: boolean) { ok ? pass++ : fail++; }

// 1. Plain text only.
tally(run('plain text', ['hello world'], cs => {
  if (artifacts(cs).length !== 0) return 'should have no artifacts';
  if (joinText(cs) !== 'hello world') return `text mismatch: ${joinText(cs)}`;
  return null;
}));

// 2. Simple HTML block, single delta.
tally(run('single delta, html block', [
  'here is the page:\n```html\n<div>hi</div>\n```\nthat is it.',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return `expected 1 artifact, got ${a.length}`;
  if (a[0].name !== 'index.html') return `name=${a[0].name}`;
  if (a[0].artifactType !== 'webpage') return `type=${a[0].artifactType}`;
  if (a[0].content !== '<div>hi</div>') return `content=${JSON.stringify(a[0].content)}`;
  return null;
}));

// 3. Fence split across delta boundary at ``` itself.
tally(run('split at triple backticks', [
  'here:\n``',
  '`html\n<div>x</div>\n``',
  '`\nbye',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return `expected 1 artifact, got ${a.length}`;
  if (a[0].content !== '<div>x</div>') return `content=${JSON.stringify(a[0].content)}`;
  if (!joinText(cs).includes('bye')) return 'missing bye text';
  return null;
}));

// 4. Lang token split.
tally(run('split inside lang token', [
  'go:\n```ht',
  'ml\n<p>q</p>\n```\n',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return 'no artifact';
  if (a[0].language !== 'html') return `lang=${a[0].language}`;
  if (a[0].content !== '<p>q</p>') return `content=${JSON.stringify(a[0].content)}`;
  return null;
}));

// 5. Closing ``` split across deltas.
tally(run('split at closing fence', [
  '```css\n.a{c:red}\n``',
  '`\ndone',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return 'no artifact';
  if (a[0].name !== 'style.css') return `name=${a[0].name}`;
  if (a[0].content !== '.a{c:red}') return `content=${JSON.stringify(a[0].content)}`;
  if (joinText(cs).indexOf('done') === -1) return 'missing done';
  return null;
}));

// 6. Two HTML blocks → second gets index-2.html.
tally(run('two html blocks', [
  '```html\n<a/>\n```\n中间\n```html\n<b/>\n```',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 2) return `expected 2, got ${a.length}`;
  if (a[0].name !== 'index.html' || a[1].name !== 'index-2.html') return `names=${a.map(x => x.name).join(',')}`;
  return null;
}));

// 7. No lang fence (just ```).
tally(run('no lang fence', [
  '```\nplain block\n```',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return 'no artifact';
  if (a[0].name !== 'snippet.txt') return `name=${a[0].name}`;
  if (a[0].content !== 'plain block') return `content=${JSON.stringify(a[0].content)}`;
  return null;
}));

// 8. Stream ends inside a fence → flush emits incomplete artifact.
tally(run('unterminated fence on flush', [
  'start ```html\n<p>partial</p>\n',
], cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return `expected 1 artifact from flush, got ${a.length}`;
  if (a[0].content !== '<p>partial</p>') return `content=${JSON.stringify(a[0].content)}`;
  return null;
}));

// 9. One-char-at-a-time streaming.
const charByChar = '前缀\n```js\nconsole.log(1)\n```\n后缀';
tally(run('char-by-char', charByChar.split(''), cs => {
  const a = artifacts(cs);
  if (a.length !== 1) return `expected 1, got ${a.length}`;
  if (a[0].content !== 'console.log(1)') return `content=${JSON.stringify(a[0].content)}`;
  const txt = joinText(cs);
  if (!txt.includes('前缀')) return 'missing prefix';
  if (!txt.includes('后缀')) return 'missing suffix';
  return null;
}));

// 10. Empty fence body.
tally(run('empty fence body', [
  '```html\n```',
], cs => {
  // empty content → flush returns nothing; with closing fence in same delta we hit the inline emit path
  // content after stripping trailing \n is ''. Per current code we emit the artifact anyway (we don't drop empty when closed inline).
  // This documents behavior. We accept either 0 or 1 artifact; just make sure no crash.
  return null;
}));

// 11. Trailing partial backticks not a fence.
tally(run('text ends with ``', [
  'hello ``',
], cs => {
  // SAFE_TRAILING=3 keeps last 3 chars. After flush, all chars should come out as text.
  if (artifacts(cs).length !== 0) return 'should be no artifacts';
  if (joinText(cs) !== 'hello ``') return `text=${JSON.stringify(joinText(cs))}`;
  return null;
}));

// 12. Two fences glued together (no surrounding text).
tally(run('back-to-back fences', [
  '```js\nA\n``````css\nB\n```',
], cs => {
  // Between two closing/opening fences: the parser sees `` ``` `` then immediately ` ``` ` again.
  // Outcome we want: artifact A (js) then artifact B (css).
  const a = artifacts(cs);
  if (a.length !== 2) return `expected 2, got ${a.length}: names=${a.map(x => x.name).join(',')}`;
  return null;
}));

console.log(`\n──── ${pass} passed, ${fail} failed ────`);
process.exit(fail > 0 ? 1 : 0);
