/**
 * fenceExtractor — streaming markdown code-fence parser.
 *
 * 上下文：LLM 以纯文本流回复，代码以 ```lang ... ``` 包裹。
 * 默认行为下右侧产物面板永远拿不到文件，因为没人把代码块抽成 artifact。
 *
 * 本模块在 RemoteAgent 与 store 之间插一层流式状态机：
 *   - 围栏外的文本照常以 `text` chunk 透传，保持 typing 体验
 *   - 围栏内的内容静默缓冲，闭合时一次性发 `artifact-draft`
 *   - 跨 delta 边界的 ``` 也能识别（保留 trailing 缓冲）
 *
 * 关键设计：
 *   - 文件名按语言映射成稳定名（index.html / style.css / script.tsx ...）
 *     这样多轮对话「再生成一版」会落到同一 artifact，触发 v2/v3 + DiffTab。
 *   - 不修改后端：DeepSeek/Claude/GPT 适配器只吐 text delta，这里前端解释。
 */
import type { AgentChunk, ArtifactType } from '../types';

type FenceState =
  | { kind: 'outside'; pending: string }
  | { kind: 'inside'; lang: string; buf: string; pending: string };

const SAFE_TRAILING = 3; // 保留可能是 "```" 前缀的尾部字节数

/**
 * 创建一个流式解析器。
 * 每次 feed(textDelta) 返回应发出的 chunk 列表（可能为空）。
 * 流结束时调用 flush() 拿剩余 chunk。
 */
export function createFenceExtractor() {
  let state: FenceState = { kind: 'outside', pending: '' };
  // 命名计数：同一会话里多个同语言代码块用 file / file-2 区分
  const usedNames = new Map<string, number>();

  const nextName = (lang: string): { name: string; type: ArtifactType } => {
    const [base, type] = defaultNameFor(lang);
    const count = (usedNames.get(base) ?? 0) + 1;
    usedNames.set(base, count);
    if (count === 1) return { name: base, type };
    const dot = base.lastIndexOf('.');
    const name = dot > 0 ? `${base.slice(0, dot)}-${count}${base.slice(dot)}` : `${base}-${count}`;
    return { name, type };
  };

  function feed(delta: string): AgentChunk[] {
    const out: AgentChunk[] = [];
    if (state.kind === 'outside') {
      state.pending += delta;
      // 处理：可能含若干 ``` 开口
      while (true) {
        const idx = state.pending.indexOf('```');
        if (idx === -1) {
          // 没看到围栏，把除尾部 SAFE_TRAILING 之外的内容当 text emit
          const cut = Math.max(0, state.pending.length - SAFE_TRAILING);
          if (cut > 0) {
            out.push({ type: 'text', delta: state.pending.slice(0, cut) });
            state.pending = state.pending.slice(cut);
          }
          break;
        }
        // emit 围栏前的文本
        if (idx > 0) {
          out.push({ type: 'text', delta: state.pending.slice(0, idx) });
        }
        // 解析 lang，需要看到换行才能确认
        const after = state.pending.slice(idx + 3);
        const nl = after.indexOf('\n');
        if (nl === -1) {
          // 不完整，保留并退出
          state.pending = state.pending.slice(idx);
          break;
        }
        const lang = after.slice(0, nl).trim().toLowerCase();
        // 进入 inside
        state = { kind: 'inside', lang, buf: '', pending: after.slice(nl + 1) };
        // 立即继续处理（inside 也可能在同一 delta 里闭合）
        // 把剩余 pending 当作"已经在 inside 状态收到的内容"重新喂入
        const rest = state.pending;
        state.pending = '';
        return out.concat(feed(rest));
      }
    } else {
      // inside
      state.pending += delta;
      while (true) {
        const idx = state.pending.indexOf('```');
        if (idx === -1) {
          // 没闭合：保留尾部 SAFE_TRAILING，前面 commit 到 buf
          const cut = Math.max(0, state.pending.length - SAFE_TRAILING);
          if (cut > 0) {
            state.buf += state.pending.slice(0, cut);
            state.pending = state.pending.slice(cut);
          }
          break;
        }
        // 闭合：idx 前的内容是最后一段代码
        state.buf += state.pending.slice(0, idx);
        // 去掉代码块末尾可能多带的一个换行
        const content = state.buf.endsWith('\n') ? state.buf.slice(0, -1) : state.buf;
        const lang = state.lang;
        const { name, type } = nextName(lang);
        out.push({
          type: 'artifact-draft',
          artifactType: type,
          name,
          language: lang || undefined,
          content,
          commitMessage: 'Agent 生成',
        });
        // 切回 outside，剩余文本继续处理
        const rest = state.pending.slice(idx + 3);
        state = { kind: 'outside', pending: '' };
        if (rest.length > 0) {
          return out.concat(feed(rest));
        }
        break;
      }
    }
    return out;
  }

  function flush(): AgentChunk[] {
    const out: AgentChunk[] = [];
    if (state.kind === 'outside') {
      if (state.pending) out.push({ type: 'text', delta: state.pending });
    } else {
      // 流结束时仍在 inside：当不完整代码块，把已收到的 buf+pending 当 artifact
      // 保护：如果内容为空就丢弃
      const content = (state.buf + state.pending).replace(/\n$/, '');
      if (content.trim().length > 0) {
        const { name, type } = nextName(state.lang);
        out.push({
          type: 'artifact-draft',
          artifactType: type,
          name,
          language: state.lang || undefined,
          content,
          commitMessage: 'Agent 生成（流意外结束）',
        });
      }
    }
    state = { kind: 'outside', pending: '' };
    return out;
  }

  return { feed, flush };
}

/**
 * 语言 → (默认文件名, ArtifactType) 映射。
 * 同一会话里同名 artifact 会成为新版本（v2/v3...）触发 DiffTab，这正是 T5 期望。
 */
function defaultNameFor(lang: string): [string, ArtifactType] {
  const L = lang.toLowerCase();
  if (L === 'html' || L === 'htm') return ['index.html', 'webpage'];
  if (L === 'css' || L === 'scss' || L === 'sass' || L === 'less') return ['style.css', 'code'];
  if (L === 'js' || L === 'javascript' || L === 'mjs') return ['script.js', 'code'];
  if (L === 'jsx') return ['component.jsx', 'code'];
  if (L === 'ts' || L === 'typescript') return ['script.ts', 'code'];
  if (L === 'tsx') return ['component.tsx', 'code'];
  if (L === 'json') return ['data.json', 'code'];
  if (L === 'py' || L === 'python') return ['script.py', 'code'];
  if (L === 'go') return ['main.go', 'code'];
  if (L === 'rs' || L === 'rust') return ['main.rs', 'code'];
  if (L === 'java') return ['Main.java', 'code'];
  if (L === 'cpp' || L === 'c++' || L === 'cxx') return ['main.cpp', 'code'];
  if (L === 'c') return ['main.c', 'code'];
  if (L === 'sh' || L === 'bash' || L === 'shell' || L === 'zsh') return ['run.sh', 'code'];
  if (L === 'yaml' || L === 'yml') return ['config.yaml', 'code'];
  if (L === 'toml') return ['config.toml', 'code'];
  if (L === 'sql') return ['query.sql', 'code'];
  if (L === 'md' || L === 'markdown') return ['README.md', 'doc'];
  if (L === 'txt' || L === 'text' || L === '') return ['snippet.txt', 'doc'];
  // 默认按代码处理
  return [`snippet.${L || 'txt'}`, 'code'];
}
