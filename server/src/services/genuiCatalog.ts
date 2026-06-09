// ─────────────────────────────────────────────────────────────
// GenUI Catalog — Server Services
// Exports CATALOG_SYSTEM_PROMPT and Zod-based validators
// ─────────────────────────────────────────────────────────────

import { z } from 'zod';

/**
 * LLM system prompt instructions for GenUI component usage.
 * Injected into agent system prompts to enable interactive UI components.
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
4. 此时再继续完成原本的任务

## HTML/CSS/JS 编码规范（产物预览专用）

当你生成包含交互元素（按钮、链接、表单等）的 HTML 页面时，必须遵守以下规范：

1. **功能占位**：如果某个按钮/功能在本次迭代中不需要完整实现，请使用标准占位处理：
   - 按钮添加 \`data-ah-placeholder="true"\` 属性，预览环境会自动拦截并提示"此功能暂时还没有实现哦~"
   - 或者直接调用 \`AgentHub.util.notImplemented()\` 方法

2. **\`AgentHub.util\` 全局工具** 在每个预览页面中自动可用：
   - \`AgentHub.util.notImplemented()\` — 显示"此功能暂时还没有实现哦~" Toast
   - \`AgentHub.util.showMessage(text)\` — 显示通知消息

3. **按钮/链接安全规范**：
   - 所有 \`<a>\` 标签如无实际链接地址，使用 \`href="javascript:void(0)"\`
   - 所有 \`<button>\` 必须有明确的 \`type\` 属性（\`type="button"\` 防止意外表单提交）
   - 不要使用 \`alert()\` / \`prompt()\` / \`confirm()\`（沙箱环境下不可用）

4. **错误处理**：所有 \`<script>\` 代码块应包裹在 try/catch 中，避免单个错误导致整个页面白屏

5. **响应式设计**：使用 viewport-relative 单位和 flex/grid 布局，确保在不同宽度下正常显示`;

// ── Zod schemas for each component ──

const ChoiceCardsPropsSchema = z.object({
  title: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    preview: z.string().optional(),
    description: z.string().optional(),
  })).min(2).max(6),
});

const ColorPickerGridPropsSchema = z.object({
  title: z.string(),
  suggested: z.array(z.string()),
  allowCustom: z.boolean().optional(),
});

const SliderRangePropsSchema = z.object({
  title: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  unit: z.string().optional(),
});

const ConfirmCardPropsSchema = z.object({
  title: z.string(),
  body: z.string(),
  danger: z.boolean().optional(),
});

const ChoiceCardsValueSchema = z.object({ chosenId: z.string() });
const ColorPickerGridValueSchema = z.object({ hex: z.string() });
const SliderRangeValueSchema = z.object({ value: z.number() });
const ConfirmCardValueSchema = z.object({ confirmed: z.boolean() });

const CatalogPropsSchemaMap: Record<string, z.ZodTypeAny> = {
  ChoiceCards: ChoiceCardsPropsSchema,
  ColorPickerGrid: ColorPickerGridPropsSchema,
  SliderRange: SliderRangePropsSchema,
  ConfirmCard: ConfirmCardPropsSchema,
};

const CatalogValueSchemaMap: Record<string, z.ZodTypeAny> = {
  ChoiceCards: ChoiceCardsValueSchema,
  ColorPickerGrid: ColorPickerGridValueSchema,
  SliderRange: SliderRangeValueSchema,
  ConfirmCard: ConfirmCardValueSchema,
};

export function validateCatalogProps(
  name: string,
  props: unknown,
): { success: boolean; error?: string } {
  const schema = CatalogPropsSchemaMap[name];
  if (!schema) return { success: false, error: `Unknown component: ${name}` };
  const result = schema.safeParse(props);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true };
}

export function validateCatalogValue(
  name: string,
  value: unknown,
): { success: boolean; error?: string } {
  const schema = CatalogValueSchemaMap[name];
  if (!schema) return { success: false, error: `Unknown component: ${name}` };
  const result = schema.safeParse(value);
  if (!result.success) return { success: false, error: result.error.message };
  return { success: true };
}
