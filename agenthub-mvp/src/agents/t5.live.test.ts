/**
 * Verify T5: two requests in succession to the same conversation should produce two artifact-drafts
 * with the SAME name (index.html), so the store will increment to v2 and emit a DiffTab.
 * Here we just verify the extractor stays consistent across two calls.
 */
import { createFenceExtractor } from './fenceExtractor.ts';

async function fetchArtifacts(prompt: string) {
  const res = await fetch('http://localhost:3001/api/agents/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'agent_claude_code', userPrompt: prompt, messages: [] }),
  });
  const ex = createFenceExtractor();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const arts: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const ln of lines) {
      if (!ln.startsWith('data: ')) continue;
      let e: any;
      try { e = JSON.parse(ln.slice(6)); } catch { continue; }
      if (e.type === 'text') {
        for (const c of ex.feed(e.delta ?? '')) if (c.type === 'artifact-draft') arts.push(c);
      } else if (e.type === 'done' || e.type === 'error') {
        for (const c of ex.flush()) if (c.type === 'artifact-draft') arts.push(c);
      }
    }
  }
  return arts;
}

const round1 = await fetchArtifacts('写一个最简单的 HTML 页面，背景白色，h1 内容 "茶饮品牌"。只出一个 ```html 围栏。');
console.log(`Round 1: ${round1.length} artifacts, name=${round1[0]?.name}, type=${round1[0]?.artifactType}`);

const round2 = await fetchArtifacts('再写一个最简单的 HTML 页面，但背景改成绿色，h1 内容 "茶饮品牌"。只出一个 ```html 围栏。');
console.log(`Round 2: ${round2.length} artifacts, name=${round2[0]?.name}, type=${round2[0]?.artifactType}`);

const sameName = round1[0]?.name === round2[0]?.name && round1[0]?.name === 'index.html';
const differentContent = round1[0]?.content !== round2[0]?.content;

if (!sameName) {
  console.error('❌ Names differ:', round1[0]?.name, round2[0]?.name);
  process.exit(1);
}
if (!differentContent) {
  console.error('❌ Content identical, no diff possible');
  process.exit(1);
}
console.log('\n✅ T5 prerequisite: same name index.html across rounds → store will create v2 + DiffTab');
