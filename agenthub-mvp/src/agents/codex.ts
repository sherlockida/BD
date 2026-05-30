import { BaseAgent } from './base';
import type { Agent, AgentChunk, AgentInput } from '../types';

/**
 * Codex 适配器（Mock）
 * 人设：CSS/JS 老司机，擅长样式打磨、动效、性能优化
 */
export class CodexAgent extends BaseAgent {
  meta: Agent = {
    id: 'agent_codex',
    name: 'Codex',
    avatarEmoji: '🎨',
    avatarColor: 'bg-purple-500',
    vendor: 'codex',
    capabilities: ['code', 'design'],
    tagline: 'CSS 与动效老司机，把页面调得更精致一点',
    online: true,
  };

  protected async generate(input: AgentInput): Promise<AgentChunk[]> {
    const prompt = (input.task?.description || input.userPrompt).toLowerCase();
    const out: AgentChunk[] = [];

    if (/样式|css|动效|动画|颜色|抹茶|绿|换色|主题/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '我来给落地页加一组「抹茶绿 + 米白」配色，并补一段 Hero 区的入场动画。',
      });
      out.push({
        type: 'artifact-draft',
        artifactType: 'code',
        name: 'theme.css',
        language: 'css',
        commitMessage: 'style: 抹茶绿主题 + Hero 入场动画',
        content: `:root {
  --brand: #2f7a3a;
  --brand-2: #5cb478;
  --bg: #faf9f5;
  --ink: #1f1f23;
}

.hero {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
  animation: fadeUp 700ms ease-out both;
}

.hero h1 {
  letter-spacing: 4px;
  text-shadow: 0 2px 12px rgba(0,0,0,.08);
}

.btn {
  transition: transform .15s ease, box-shadow .15s ease;
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(47,122,58,.25); }

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
`,
      });
      return out;
    }

    if (/部署|deploy/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '部署不是我的专长，建议把这条任务派给 DeployBot。我可以先帮你把静态资源压缩到位。',
      });
      return out;
    }

    if (/落地页|页面|网站|h5|网页/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '页面骨架建议让 Claude Code 同学先出，我接手做样式打磨。',
      });
      return out;
    }

    out.push({
      type: 'text',
      delta: '收到。我专注样式与动效，看下 Spec 中的视觉需求...',
    });
    return out;
  }
}
