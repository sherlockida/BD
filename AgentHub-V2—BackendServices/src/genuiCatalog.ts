// ─────────────────────────────────────────────────────────────
// GenUI Catalog — Backend Services
// Re-exports Zod schemas from SharedTypes, exports system prompt
// ─────────────────────────────────────────────────────────────

import {
  CatalogSchemaMap,
  validateCatalogProps,
  validateCatalogValue,
} from '@shared/catalog';

export { CatalogSchemaMap, validateCatalogProps, validateCatalogValue };

/**
 * LLM system prompt instructions for GenUI component usage.
 * When injected into an LLM's system prompt, it tells the model
 * how to use interactive UI components (ChoiceCards, ColorPickerGrid,
 * SliderRange, ConfirmCard) to collect user input.
 */
export const CATALOG_SYSTEM_PROMPT = `## 交互组件能力

你可以使用以下交互组件让用户做选择，避免反复打字。
当你不确定应该用什么方案时，主动产出组件比提问让用户回答体验更好。

可用组件（你只能使用 catalog 中的组件，不在 catalog 中的会被忽略）：

- ChoiceCards(title, options[{id,label,preview?,description?}])
  → 当存在 2-6 个对等选项让用户挑（风格/方案/方向）
- ColorPickerGrid(title, suggested[]: hex, allowCustom)
  → 当需要颜色输入
- SliderRange(title, min, max, step, unit?)
  → 当需要数值参数（字号/圆角/动效时长/数量）
- ConfirmCard(title, body, danger)
  → 当将要执行不可逆/高风险操作（部署/删文件/覆盖）

输出格式：使用 \`\`\`ui ... \`\`\` 围栏包裹 JSON，schema 与上述对齐。
示例：

\`\`\`ui
{
  "component": "ChoiceCards",
  "props": {
    "title": "你想要哪种博客风格？",
    "options": [
      {"id": "minimal", "label": "极简", "preview": "🎯"},
      {"id": "glass",   "label": "玻璃风", "preview": "🪟"},
      {"id": "brutal",  "label": "野蛮主义", "preview": "🧱"},
      {"id": "warm",    "label": "暖色文艺", "preview": "🌅"}
    ]
  }
}
\`\`\`

收到 \`\`\`ui\`\`\` 围栏后：
1. 你的本轮回答应该结束（不再继续输出文本/代码）
2. 系统会暂停你的执行，等待用户操作
3. 用户操作后你会被自动唤醒，并在 system message 中收到用户的选择
4. 此时再继续完成原本的任务`;
