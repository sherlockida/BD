import { BaseAgent } from './base';
import type { Agent, AgentChunk, AgentInput } from '../types';

/**
 * Claude Code 适配器（Mock）
 * 人设：严谨的全栈工程师，最擅长 TS/React 组件、API 设计、可维护性
 *
 * 真实接入时只需把 generate() 改成调用
 *   POST https://api.anthropic.com/v1/messages  (stream=true)
 * 并把 SSE 转成 AgentChunk 即可。
 */
export class ClaudeCodeAgent extends BaseAgent {
  meta: Agent = {
    id: 'agent_claude_code',
    name: 'Claude Code',
    avatarEmoji: '🧠',
    avatarColor: 'bg-orange-500',
    vendor: 'claude-code',
    capabilities: ['code', 'plan', 'doc'],
    tagline: '严谨的全栈工程师，擅长 React/TS 组件设计与可维护代码',
    online: true,
  };

  protected async generate(input: AgentInput): Promise<AgentChunk[]> {
    const prompt = (input.task?.description || input.userPrompt).toLowerCase();
    const out: AgentChunk[] = [];

    // 任务驱动：根据关键词决定生成什么
    if (/表单|form|留资|收集/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '收到。我先按 Spec 写一个可控的留资表单组件，字段：姓名 / 手机 / 留言。表单状态用 useState，提交前做基础校验，并预留 onSubmit 回调供后续接入接口。\n\n',
      });
      out.push({
        type: 'artifact-draft',
        artifactType: 'code',
        name: 'LeadForm.tsx',
        language: 'tsx',
        commitMessage: 'feat: 留资表单组件 LeadForm（姓名/手机/留言）',
        content: `import { useState, FormEvent } from 'react';

interface LeadFormProps {
  onSubmit?: (data: { name: string; phone: string; message: string }) => void;
}

export default function LeadForm({ onSubmit }: LeadFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('请输入姓名');
    if (!/^1[3-9]\\d{9}$/.test(phone)) return setError('请输入合法手机号');
    setError(null);
    onSubmit?.({ name, phone, message });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      <input className="w-full border rounded px-3 py-2"
        placeholder="姓名" value={name} onChange={e => setName(e.target.value)} />
      <input className="w-full border rounded px-3 py-2"
        placeholder="手机号" value={phone} onChange={e => setPhone(e.target.value)} />
      <textarea className="w-full border rounded px-3 py-2" rows={3}
        placeholder="留言" value={message} onChange={e => setMessage(e.target.value)} />
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <button className="w-full bg-emerald-600 text-white rounded py-2"
        type="submit">立即预约</button>
    </form>
  );
}
`,
      });
      out.push({
        type: 'text',
        delta: '\n已经产出 `LeadForm.tsx`，已带基础校验。建议下一步：把它放到 Hero 区下方，并由 Codex 同学接管样式微调。',
      });
      return out;
    }

    if (/组件|react|tsx|页面|落地页|官网|网站|h5/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '理解需求。我先搭一个最简的落地页骨架，包含 Hero / Features / Footer 三块。样式留给 Codex 同学细化。\n\n',
      });
      out.push({
        type: 'artifact-draft',
        artifactType: 'webpage',
        name: 'index.html',
        commitMessage: 'feat: 茶饮品牌落地页骨架 v1',
        content: buildLandingHtml(),
      });
      out.push({
        type: 'text',
        delta: '\n已交付 `index.html`，请预览。如果需要修改任何区块，圈选后 @ 我，我做局部 diff。',
      });
      return out;
    }

    if (/diff|修改|改|换|替换|抹茶|绿色|颜色/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '收到，我对 Hero 区做局部修改，把主色调切到抹茶绿（#2f7a3a），并提交 diff。',
      });
      return out;
    }

    // 默认回复
    out.push({
      type: 'text',
      delta: '收到。我来分析一下：' + input.userPrompt.slice(0, 60) + '...\n\n基于 RULES.md 的约束，我会先输出 Spec，再产出代码。',
    });
    return out;
  }
}

function buildLandingHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>青叶茶事 · 品牌落地页</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,"PingFang SC",sans-serif;color:#1f1f23;background:#faf9f5}
    .hero{padding:80px 24px;text-align:center;background:linear-gradient(135deg,#2f7a3a 0%,#5cb478 100%);color:#fff}
    .hero h1{font-size:42px;font-weight:800;letter-spacing:2px;margin-bottom:12px}
    .hero p{font-size:18px;opacity:.9;margin-bottom:32px}
    .btn{display:inline-block;padding:12px 28px;border-radius:999px;background:#fff;color:#2f7a3a;font-weight:700;text-decoration:none}
    .features{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:64px 24px;max-width:1000px;margin:0 auto}
    .card{padding:24px;border-radius:12px;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.06)}
    .card h3{font-size:18px;margin-bottom:8px;color:#2f7a3a}
    .footer{padding:32px 24px;text-align:center;color:#86868b;font-size:14px}
  </style>
</head>
<body>
  <section class="hero">
    <h1>青叶茶事</h1>
    <p>一杯好茶，从一片叶子开始</p>
    <a href="#form" class="btn">立即预约品鉴</a>
  </section>
  <section class="features">
    <div class="card"><h3>溯源茶园</h3><p>云南古树原叶，第三方机构检测，每批次可溯源。</p></div>
    <div class="card"><h3>大师手作</h3><p>非遗传承人监制工艺，72 小时低温慢焙。</p></div>
    <div class="card"><h3>新鲜直送</h3><p>当日采摘，全程冷链，48 小时内送达门店。</p></div>
  </section>
  <section id="form" style="padding:48px 24px;text-align:center">
    <h2 style="margin-bottom:16px">留下联系方式，安排品鉴</h2>
    <p style="color:#86868b;margin-bottom:24px">我们会在 24h 内联系您</p>
    <div id="lead-form-slot"></div>
  </section>
  <footer class="footer">© 青叶茶事 · 仅作 Demo 演示</footer>
</body>
</html>
`;
}
