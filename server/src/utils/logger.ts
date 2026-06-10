/**
 * Structured AgentHub Logger — 多 Agent 通信与内容可视化日志。
 *
 * 用法：
 *   import { log } from '../utils/logger.js';
 *   log.agentRequest(agentId, agentName, userPrompt);
 *   log.llmStreamStart(model, systemPrompt, messages);
 *   log.llmStreamChunk(delta);
 *   log.agentResponse(agentId, totalChars, durationMs);
 *   log.agentError(agentId, error);
 *   log.planGenerated(planId, taskCount, complexity);
 */

const CSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function tag(label: string, color: string): string {
  return `${color}[${label}]${CSI.reset}`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + `…(+${s.length - maxLen} chars)`;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export const log = {
  /** ── Agent Request ── */
  agentRequest(agentId: string, agentName: string, userPrompt: string, historyLen: number) {
    const preview = truncate(userPrompt, 200);
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('REQ', CSI.green)} ${CSI.bold}${agentName}${CSI.reset} ${CSI.dim}(${agentId})${CSI.reset} | history=${historyLen}msgs\n` +
      `  └─ ${CSI.cyan}"${preview}"${CSI.reset}`,
    );
  },

  /** ── LLM Stream Start ── */
  llmStreamStart(model: string, systemPromptLen: number, msgCount: number, totalInputChars: number) {
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('LLM', CSI.blue)} → ${CSI.bold}${model}${CSI.reset} | system=${systemPromptLen}chars | msgs=${msgCount} | input_total=${totalInputChars}chars`,
    );
  },

  /** ── LLM Stream Progress (throttled — call site controls frequency) ── */
  llmStreamProgress(charsReceived: number, elapsedMs: number) {
    const rate = elapsedMs > 0 ? Math.round(charsReceived / (elapsedMs / 1000)) : 0;
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('STREAM', CSI.blue)} ${charsReceived}chars received | ${elapsedMs}ms | ~${rate} chars/s`,
    );
  },

  /** ── LLM Full Response Summary ── */
  llmResponse(fullText: string, durationMs: number) {
    const lines = fullText.split('\n').length;
    const chars = fullText.length;
    const preview = truncate(fullText, 500);
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('RESP', CSI.magenta)} ${chars}chars ${lines}lines ${durationMs}ms\n` +
      `${CSI.dim}─── BEGIN RESPONSE ───${CSI.reset}\n` +
      `${preview}\n` +
      `${CSI.dim}─── END RESPONSE ───${CSI.reset}`,
    );
  },

  /** ── Agent Response Done ── */
  agentDone(agentId: string, agentName: string, chars: number, durationMs: number) {
    const emoji = chars > 0 ? '✅' : '⚠️';
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('DONE', CSI.green)} ${emoji} ${CSI.bold}${agentName}${CSI.reset} ${CSI.dim}(${agentId})${CSI.reset} | ${chars}chars | ${durationMs}ms`,
    );
  },

  /** ── Agent Error ── */
  agentError(agentId: string, agentName: string, error: string, phase: string) {
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('ERR', CSI.red)} ❌ ${CSI.bold}${agentName}${CSI.reset} ${CSI.dim}(${agentId})${CSI.reset} @ ${phase}\n` +
      `  └─ ${CSI.red}${error}${CSI.reset}`,
    );
  },

  /** ── Agent Not Found ── */
  agentNotFound(agentId: string) {
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('404', CSI.yellow)} ⚠️  Agent "${agentId}" not found in registry`,
    );
  },

  /** ── Plan Generation ── */
  planGenerated(planId: string, intent: string, taskCount: number, complexity: string, source: string) {
    const tasksPreview = `→ ${taskCount} subtasks`;
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('PLAN', CSI.cyan)} 📋 plan=${planId.slice(0,8)} | ${source} | ${complexity} ${tasksPreview}\n` +
      `  └─ "${truncate(intent, 120)}"`,
    );
  },

  /** ── Plan Task Detail ── */
  planTask(taskIndex: number, title: string, agentId: string, deps: string[]) {
    const depsStr = deps.length > 0 ? ` ${CSI.yellow}← ${deps.join(', ')}${CSI.reset}` : '';
    console.log(
      `  ${CSI.bold}t${taskIndex}${CSI.reset}: ${title} ${CSI.dim}→ ${agentId}${CSI.reset}${depsStr}`,
    );
  },

  /** ── Scheduler Task Start/End ── */
  taskLifecycle(taskTitle: string, agentId: string, phase: 'start' | 'success' | 'fail' | 'fallback' | 'timeout', detail?: string) {
    const icons: Record<string, string> = {
      start: '🚀',
      success: '✅',
      fail: '❌',
      fallback: '🔄',
      timeout: '⏱️',
    };
    const colors: Record<string, string> = {
      start: CSI.green,
      success: CSI.green,
      fail: CSI.red,
      fallback: CSI.yellow,
      timeout: CSI.yellow,
    };
    const detailStr = detail ? ` ${CSI.dim}${detail}${CSI.reset}` : '';
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag('TASK', colors[phase] ?? CSI.white)} ${icons[phase] ?? '•'} ${taskTitle} ${CSI.dim}@${agentId}${CSI.reset}${detailStr}`,
    );
  },

  /** ── Generic Info ── */
  info(section: string, message: string) {
    console.log(
      `${CSI.dim}${ts()}${CSI.reset} ${tag(section, CSI.white)} ${message}`,
    );
  },

  /** ── Divider ── */
  divider(title?: string) {
    const line = '─'.repeat(60);
    if (title) {
      console.log(`\n${CSI.dim}── ${title} ${line.slice(title.length + 4)}${CSI.reset}`);
    } else {
      console.log(`${CSI.dim}${line}${CSI.reset}`);
    }
  },
};
