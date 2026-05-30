import { BaseAgent } from './base';
import type { Agent, AgentChunk, AgentInput } from '../types';

/**
 * OpenCode 适配器（Mock）
 * 人设：开源全能型，性价比最高，常被作为 fallback
 */
export class OpenCodeAgent extends BaseAgent {
  meta: Agent = {
    id: 'agent_open_code',
    name: 'OpenCode',
    avatarEmoji: '🐙',
    avatarColor: 'bg-blue-500',
    vendor: 'open-code',
    capabilities: ['code', 'doc', 'data'],
    tagline: '开源全能型，性价比之选，可作为兜底执行',
    online: true,
  };

  protected async generate(input: AgentInput): Promise<AgentChunk[]> {
    const prompt = (input.task?.description || input.userPrompt).toLowerCase();
    const out: AgentChunk[] = [];

    if (/部署|deploy/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '我可以做静态部署。会输出一份部署说明，并模拟把构建产物上传到 Vercel/Netlify。',
      });
      out.push({
        type: 'artifact-draft',
        artifactType: 'doc',
        name: 'DEPLOY.md',
        commitMessage: 'docs: 部署说明 v1',
        content: `# 部署说明

## 1. 构建
\`\`\`bash
npm run build
\`\`\`

## 2. 部署到 Vercel
\`\`\`bash
npx vercel --prod
\`\`\`

## 3. 健康检查
- 首屏可访问
- 留资表单提交可成功
- Hero 动画正常播放
`,
      });
      return out;
    }

    if (/sql|数据|查询|select/.test(prompt)) {
      out.push({
        type: 'text',
        delta: '收到，我来写一个查询：',
      });
      out.push({
        type: 'code',
        language: 'sql',
        code: `-- 留资统计：每天新增留资数
SELECT DATE(created_at) AS day, COUNT(*) AS cnt
FROM leads
GROUP BY DATE(created_at)
ORDER BY day DESC;`,
      });
      return out;
    }

    out.push({
      type: 'text',
      delta: '我已就绪，可以接手任何同学暂时忙不过来的任务。',
    });
    return out;
  }
}
