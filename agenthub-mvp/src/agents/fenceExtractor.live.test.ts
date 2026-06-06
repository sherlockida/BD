/**
 * Live integration test: hit real backend SSE, pipe through extractor, expect artifact-draft.
 * This is the real proof for T4 — code block → artifact.
 */
import { createFenceExtractor } from './fenceExtractor.ts';

const body = {
  agentId: 'agent_claude_code',
  userPrompt: '写一个最简单的 HTML 落地页，包含 title 和一个 h1 "茶饮品牌"。只输出一段 ```html 围栏，不要其他解释。',
  messages: [],
};

const res = await fetch('http://localhost:3001/api/agents/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error('HTTP error', res.status, await res.text());
  process.exit(1);
}

const extractor = createFenceExtractor();
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
const collected: any[] = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    let evt: any;
    try { evt = JSON.parse(line.slice(6)); } catch { continue; }
    if (evt.type === 'text') {
      for (const ch of extractor.feed(evt.delta ?? '')) collected.push(ch);
    } else if (evt.type === 'done' || evt.type === 'error') {
      for (const ch of extractor.flush()) collected.push(ch);
      collected.push(evt);
    }
  }
}

const artifacts = collected.filter(c => c.type === 'artifact-draft');
const textJoined = collected.filter(c => c.type === 'text').map(c => c.delta).join('');

console.log(`\n──── result ────`);
console.log(`text len: ${textJoined.length}`);
console.log(`artifact count: ${artifacts.length}`);
for (const a of artifacts) {
  console.log(`  ▸ ${a.name} (${a.artifactType}/${a.language}) ${a.content.length} bytes`);
  console.log('    preview:', a.content.slice(0, 200).replaceAll('\n', '\\n'));
}

if (artifacts.length === 0) {
  console.error('❌ FAIL: no artifact extracted');
  console.error('raw text was:', textJoined.slice(0, 500));
  process.exit(1);
}
console.log('\n✅ artifact extraction works end-to-end');
