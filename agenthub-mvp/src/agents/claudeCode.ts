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
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8" />
  <title>青叶茶事 · 品牌落地页</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root {
      --bg: #faf9f5; --surface: #fff; --text: #1f1f23; --subtext: #86868b;
      --primary: #2f7a3a; --primary-light: #5cb478; --border: #e5e5e5;
      --hero-gradient: linear-gradient(135deg, #2f7a3a 0%, #5cb478 100%);
    }
    [data-theme="dark"] {
      --bg: #1a1a2e; --surface: #222240; --text: #e8e8ec; --subtext: #9e9eb8;
      --primary: #5cb478; --primary-light: #7ed89a; --border: #3a3a5c;
      --hero-gradient: linear-gradient(135deg, #1a3a22 0%, #2f7a3a 100%);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,"PingFang SC",sans-serif;color:var(--text);background:var(--bg);transition:background .3s,color .3s}
    /* ── Nav ── */
    .nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100}
    .nav-logo{font-size:20px;font-weight:800;color:var(--primary)}
    .nav-actions{display:flex;align-items:center;gap:12px}
    .theme-toggle{width:44px;height:26px;border-radius:13px;background:var(--border);border:none;cursor:pointer;position:relative;transition:background .3s}
    .theme-toggle::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .3s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    [data-theme="dark"] .theme-toggle{background:var(--primary)}
    [data-theme="dark"] .theme-toggle::after{transform:translateX(18px)}
    /* ── Hero ── */
    .hero{padding:80px 24px;text-align:center;background:var(--hero-gradient);color:#fff}
    .hero h1{font-size:48px;font-weight:800;letter-spacing:2px;margin-bottom:12px}
    .hero p{font-size:18px;opacity:.9;margin-bottom:32px}
    .hero-stats{display:flex;justify-content:center;gap:48px;margin-top:40px}
    .hero-stat{text-align:center}
    .hero-stat .num{font-size:28px;font-weight:800}
    .hero-stat .lbl{font-size:13px;opacity:.8;margin-top:4px}
    .btn{display:inline-block;padding:12px 28px;border-radius:999px;background:#fff;color:#2f7a3a;font-weight:700;border:none;cursor:pointer;font-size:15px;transition:transform .15s,box-shadow .15s}
    .btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.12)}
    .btn:active{transform:translateY(0)}
    .btn-outline{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.5);margin-left:12px}
    /* ── Tabs ── */
    .section-title{text-align:center;font-size:28px;font-weight:700;margin-bottom:8px;color:var(--text)}
    .section-sub{text-align:center;color:var(--subtext);margin-bottom:32px}
    .tabs{display:flex;justify-content:center;gap:0;margin-bottom:32px;border-bottom:2px solid var(--border)}
    .tab-btn{padding:10px 24px;border:none;background:none;cursor:pointer;font-size:15px;color:var(--subtext);border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s;font-family:inherit}
    .tab-btn.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}
    .tab-panel{display:none;max-width:1000px;margin:0 auto;padding:0 24px}
    .tab-panel.active{display:block;animation:__ah_fadeIn .4s ease}
    /* ── Features Grid ── */
    .features{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:0 24px 64px;max-width:1000px;margin:0 auto}
    @media(max-width:768px){.features{grid-template-columns:1fr}.hero-stats{flex-direction:column;gap:20px}.tab-btn{padding:10px 14px;font-size:13px}}
    .card{padding:24px;border-radius:12px;background:var(--surface);box-shadow:0 6px 24px rgba(0,0,0,.06);transition:transform .2s,box-shadow .2s}
    .card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.1)}
    .card h3{font-size:18px;margin-bottom:8px;color:var(--primary)}
    .card .icon{font-size:28px;margin-bottom:12px}
    .card p{color:var(--subtext);font-size:14px;line-height:1.6}
    /* ── FAQ Accordion ── */
    .faq{max-width:720px;margin:0 auto;padding:0 24px 64px}
    .faq-item{border-bottom:1px solid var(--border)}
    .faq-q{width:100%;padding:16px 0;background:none;border:none;cursor:pointer;font-size:16px;font-weight:600;color:var(--text);text-align:left;display:flex;justify-content:space-between;align-items:center;font-family:inherit}
    .faq-q .arrow{transition:transform .3s;font-size:12px;color:var(--subtext)}
    .faq-q.open .arrow{transform:rotate(180deg)}
    .faq-a{max-height:0;overflow:hidden;transition:max-height .35s ease,padding .35s ease;color:var(--subtext);font-size:14px;line-height:1.6}
    .faq-a.open{max-height:200px;padding-bottom:16px}
    /* ── Form ── */
    .form-section{text-align:center;padding:64px 24px;background:var(--surface)}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:520px;margin:24px auto 0;text-align:left}
    .form-grid input,.form-grid textarea{width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;background:var(--bg);color:var(--text);transition:border-color .2s}
    .form-grid input:focus,.form-grid textarea:focus{outline:none;border-color:var(--primary)}
    .form-grid .full{grid-column:1/-1}
    .form-grid textarea{resize:vertical;min-height:80px}
    .form-error{grid-column:1/-1;color:#ef4444;font-size:13px;display:none}
    .form-success{display:none;text-align:center;padding:32px;color:var(--primary);font-size:18px;font-weight:600}
    /* ── Toast Override ── */
    .__ah_toast{z-index:99999 !important}
    /* ── Footer ── */
    .footer{padding:32px 24px;text-align:center;color:var(--subtext);font-size:14px;border-top:1px solid var(--border);background:var(--surface)}
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-logo">🍃 青叶茶事</div>
    <div class="nav-actions">
      <button class="theme-toggle" type="button" id="themeToggle" title="切换暗色模式" data-ah-handled="true"></button>
    </div>
  </nav>

  <section class="hero">
    <h1>一杯好茶，从一片叶子开始</h1>
    <p>非遗传承 · 古树原叶 · 72小时慢焙 · 冷链直送</p>
    <div>
      <button class="btn" type="button" id="ctaBtn">立即预约品鉴</button>
      <button class="btn btn-outline" type="button" id="learnBtn">了解更多</button>
    </div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="num" id="statTea">0</div><div class="lbl">古树茶园(亩)</div></div>
      <div class="hero-stat"><div class="num" id="statShop">0</div><div class="lbl">线下门店</div></div>
      <div class="hero-stat"><div class="num" id="statUser">0</div><div class="lbl">品鉴会员</div></div>
    </div>
  </section>

  <!-- Tab切换区 -->
  <section style="padding:64px 0">
    <h2 class="section-title">为什么选择青叶</h2>
    <p class="section-sub">每一杯茶背后，都是我们对品质的坚持</p>
    <div class="tabs" id="featureTabs">
      <button class="tab-btn active" type="button" data-tab="source">🌱 源头</button>
      <button class="tab-btn" type="button" data-tab="craft">🫖 工艺</button>
      <button class="tab-btn" type="button" data-tab="fresh">📦 鲜度</button>
    </div>
    <div class="tab-panel active" id="panel-source">
      <div class="features">
        <div class="card"><div class="icon">🌳</div><h3>古树茶园</h3><p>云南勐海300年古树群落，海拔1800m，云雾滋养，手工采摘一芽两叶。</p></div>
        <div class="card"><div class="icon">🔬</div><h3>第三方检测</h3><p>SGS农残248项检测，每批次独立报告，扫码即可溯源到地块。</p></div>
        <div class="card"><div class="icon">🤝</div><h3>茶农直签</h3><p>跳过中间商，与12个茶农合作社直接签约，好茶好价。</p></div>
      </div>
    </div>
    <div class="tab-panel" id="panel-craft">
      <div class="features">
        <div class="card"><div class="icon">👨‍🎨</div><h3>非遗传承人监制</h3><p>三位省级非遗传承人全流程监制，从萎凋到烘焙严格把控。</p></div>
        <div class="card"><div class="icon">🔥</div><h3>72h低温慢焙</h3><p>传统炭焙工艺，72小时文火慢焙，锁住茶香不失活性。</p></div>
        <div class="card"><div class="icon">📋</div><h3>16道工序</h3><p>从鲜叶到成品，16道工序皆有记录，每一道都经得起推敲。</p></div>
      </div>
    </div>
    <div class="tab-panel" id="panel-fresh">
      <div class="features">
        <div class="card"><div class="icon">☀️</div><h3>当日采摘</h3><p>清晨5点采摘，确保茶叶含水量与芳香物质在最佳状态。</p></div>
        <div class="card"><div class="icon">❄️</div><h3>全程冷链</h3><p>从茶园到门店，0-4°C恒温运输，保鲜锁香。</p></div>
        <div class="card"><div class="icon">🚚</div><h3>48h极速达</h3><p>全国主要城市48小时内送达，新鲜不等待。</p></div>
      </div>
    </div>
  </section>

  <!-- FAQ Accordion -->
  <section style="padding:0 0 64px">
    <h2 class="section-title">常见问题</h2>
    <p class="section-sub">你可能想了解的那些事</p>
    <div class="faq" id="faq">
      <div class="faq-item">
        <button class="faq-q" type="button"><span>茶叶如何保存？</span><span class="arrow">▼</span></button>
        <div class="faq-a">建议密封避光保存，绿茶冷藏(0-4°C)，乌龙/普洱常温避光即可。开封后建议30天内饮用完毕。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button"><span>如何预约品鉴？</span><span class="arrow">▼</span></button>
        <div class="faq-a">点击页面中的「立即预约品鉴」按钮，填写联系方式后，我们的茶艺师会在24小时内联系您安排时间。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button"><span>可以定制企业茶礼吗？</span><span class="arrow">▼</span></button>
        <div class="faq-a">当然可以！我们为企业客户提供品牌定制、礼盒设计、茶品搭配等一站式服务。最低起订量50份。</div>
      </div>
      <div class="faq-item">
        <button class="faq-q" type="button"><span>支持哪些支付方式？</span><span class="arrow">▼</span></button>
        <div class="faq-a">我们支持微信支付、支付宝、银联和银行转账。线下门店还支持现金和POS刷卡。</div>
      </div>
    </div>
  </section>

  <!-- Form -->
  <section class="form-section" id="form">
    <h2 class="section-title">预约品鉴</h2>
    <p class="section-sub">留下联系方式，24h内为您安排专属茶艺体验</p>
    <div class="form-success" id="formSuccess">✅ 预约已提交！<br><span style="font-size:14px;color:var(--subtext);margin-top:8px;display:block">我们会在24小时内联系您确认时间</span></div>
    <form class="form-grid" id="leadForm">
      <input type="text" placeholder="姓名" id="fName" required />
      <input type="tel" placeholder="手机号" id="fPhone" required />
      <input class="full" type="email" placeholder="邮箱（选填）" id="fEmail" />
      <textarea class="full" placeholder="留言：想什么时候来？几个人？有什么偏好？" id="fMsg"></textarea>
      <div class="form-error" id="formError"></div>
      <button class="btn full" type="button" id="formSubmit" style="grid-column:1/-1;justify-self:center;margin-top:8px;background:var(--primary);color:#fff">提交预约</button>
    </form>
  </section>

  <footer class="footer">© 青叶茶事 · 一杯好茶，从一片叶子开始</footer>

  <script>
  try {
    var U = window.AgentHub.util;

    // ═══ Theme Toggle ═══
    document.getElementById('themeToggle').addEventListener('click', function() {
      var html = document.documentElement;
      var isDark = html.dataset.theme === 'dark';
      html.dataset.theme = isDark ? 'light' : 'dark';
      U.toast.success(isDark ? '已切换为浅色模式 ☀️' : '已切换为深色模式 🌙');
    });

    // ═══ CTA Button ═══
    document.getElementById('ctaBtn').addEventListener('click', function() {
      document.getElementById('form').scrollIntoView({ behavior: 'smooth' });
      U.toast.info('👇 请填写下方表单');
    });
    document.getElementById('learnBtn').addEventListener('click', function() {
      window.scrollTo({ top: 600, behavior: 'smooth' });
      U.toast.info('往下滑，了解更多 🍃');
    });

    // ═══ Stats Counter Animation ═══
    function animateCounter(el, target, duration) {
      var start = 0;
      var step = Math.ceil(target / (duration / 30));
      var timer = setInterval(function() {
        start += step;
        if (start >= target) { start = target; clearInterval(timer); }
        el.textContent = start.toLocaleString() + '+';
      }, 30);
    }
    // IntersectionObserver to trigger stats when visible
    var statsTriggered = false;
    var statsSection = document.querySelector('.hero-stats');
    var observer = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting && !statsTriggered) {
        statsTriggered = true;
        animateCounter(document.getElementById('statTea'), 3200, 1500);
        animateCounter(document.getElementById('statShop'), 48, 1200);
        animateCounter(document.getElementById('statUser'), 12600, 1600);
      }
    }, { threshold: 0.5 });
    if (statsSection) observer.observe(statsSection);
    // Fallback: trigger after 500ms if observer didn't fire
    setTimeout(function() {
      if (!statsTriggered) {
        statsTriggered = true;
        animateCounter(document.getElementById('statTea'), 3200, 1500);
        animateCounter(document.getElementById('statShop'), 48, 1200);
        animateCounter(document.getElementById('statUser'), 12600, 1600);
      }
    }, 500);

    // ═══ Tab Switching ═══
    document.getElementById('featureTabs').addEventListener('click', function(e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var tab = btn.dataset.tab;
      // Deactivate all
      this.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      // Activate target
      btn.classList.add('active');
      var panel = document.getElementById('panel-' + tab);
      if (panel) panel.classList.add('active');
    });

    // ═══ FAQ Accordion ═══
    document.getElementById('faq').addEventListener('click', function(e) {
      var q = e.target.closest('.faq-q');
      if (!q) return;
      var wasOpen = q.classList.contains('open');
      // Close all
      this.querySelectorAll('.faq-q').forEach(function(b) { b.classList.remove('open'); });
      this.querySelectorAll('.faq-a').forEach(function(a) { a.classList.remove('open'); });
      // Toggle clicked
      if (!wasOpen) {
        q.classList.add('open');
        var a = q.nextElementSibling;
        if (a) a.classList.add('open');
      }
    });

    // ═══ Form Mock Submit ═══
    document.getElementById('formSubmit').addEventListener('click', function() {
      var nameEl = document.getElementById('fName');
      var phoneEl = document.getElementById('fPhone');
      var errEl = document.getElementById('formError');
      var name = nameEl.value.trim();
      var phone = phoneEl.value.trim();

      // Validation
      if (!name) { errEl.textContent = '请输入姓名'; errEl.style.display = 'block'; nameEl.focus(); return; }
      if (!/^1[3-9]\\d{9}$/.test(phone)) { errEl.textContent = '请输入正确的手机号'; errEl.style.display = 'block'; phoneEl.focus(); return; }
      errEl.style.display = 'none';

      // Mock API submit
      var btn = this;
      btn.textContent = '提交中...';
      btn.disabled = true;
      U.mockApi(1200, { ok: true, id: Date.now() }).then(function(res) {
        document.getElementById('leadForm').style.display = 'none';
        document.getElementById('formSuccess').style.display = 'block';
        U.toast.success('预约已提交！我们会尽快联系 ' + name);
        btn.textContent = '提交预约';
        btn.disabled = false;
      });
    });

  } catch(e) {
    console.warn('[AgentHub Demo] Script error:', e);
  }
  </script>
</body>
</html>
`;
}
