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

## HTML/CSS/JS 交互 Mock 规范（产物预览专用）

> **核心理念: Mock-First。** 你生成的每一个页面都应该是"活"的——按钮要点得动，表单要能交互，搜索要能过滤。
> 即使没有后端 API，也要用纯前端手段做出真实的交互反馈。用户点击后必须有视觉响应。
> **不要依赖 \`data-ah-placeholder\` 偷懒** —— 那只是最后的保底手段。

### 内置全局工具

每个预览页面自动注入以下工具，你可以在 \`<script>\` 中直接使用：

| 工具 | 说明 |
|------|------|
| \`AgentHub.util.toast.success(text)\` | 绿色成功通知 |
| \`AgentHub.util.toast.error(text)\` | 红色错误通知 |
| \`AgentHub.util.toast.warning(text)\` | 黄色警告通知 |
| \`AgentHub.util.toast.info(text)\` | 蓝色信息通知 |
| \`AgentHub.util.mockApi(delayMs, mockResponse)\` | 模拟 API 调用，返回 Promise（默认 800ms 延迟，返回 \`{ok:true}\`）|
| \`AgentHub.util.store.get(key)\` / \`set(key, val)\` | iframe 内简易键值存储（刷新丢失，仅用于交互演示）|
| \`AgentHub.util.notImplemented()\` | ⚠️ 最后手段 —— 仅当功能在本页面语境下确实无法 mock 时使用 |
| \`AgentHub.anim.fadeIn(el)\` / \`slideUp(el)\` / \`pulse(el)\` / \`shake(el)\` | 预设动画（传入 DOM 元素自动播放）|

### 必须内置的 Mock 交互模式

**你生成的页面必须包含 3 种以上以下交互模式**（根据页面类型选择合适的组合）：

**1. Tab/标签页切换**
点击 tab 切换内容区，当前 tab 高亮（下划线/背景色变化），非当前 tab 内容 display:none。
示例：产品特性分 tab 展示（"功能概览" / "技术架构" / "安全保障"）。

**2. 搜索/过滤**
输入框实时过滤下方列表（\`input\` 事件 + \`Array.filter()\` + DOM 更新）。
示例：团队成员搜索、文档过滤、FAQ 关键词匹配。

**3. 计数增减**
+/- 按钮调整数量，显示当前数值，可设 min/max 边界。
示例：购物车数量调整、套餐人数选择。

**4. 暗色模式切换**
toggle 按钮/开关切换 \`document.documentElement.dataset.theme\`（值为 \`"dark"\` / \`"light"\`），
CSS 通过 \`[data-theme="dark"]\` 选择器覆盖变量。
必须使用 CSS 变量（\`--bg\`, \`--text\`, \`--primary\` 等）便于主题切换。

**5. 表单提交**
收集 \`FormData\`，调用 \`AgentHub.util.mockApi(1200)\` 模拟提交，
成功后 \`AgentHub.util.toast.success("提交成功！")\` 并重置表单。
输入框可以有简单的 mock 验证（必填检查、邮箱格式等）。

**6. 删除确认**
点击删除按钮 → 弹出自制确认对话框（不是 \`confirm()\`）→ 确认后：
- 元素淡出动画移除
- \`AgentHub.util.toast.success("已删除")\`

**7. 收藏/点赞 Toggle**
点击切换图标/颜色状态，数字相应增减，带简单位移动画（scale bounce）。
示例：❤️ 收藏按钮、👍 点赞计数。

**8. 模态框/弹窗**
打开：\`display:flex\` + 淡入背景遮罩；关闭：点击遮罩层或 × 按钮。
弹窗内容可以是：详情展示、设置面板、确认对话框。

### 按钮/链接安全规范
- 所有 \`<button>\` 必须有 \`type="button"\`（防止意外表单提交）
- 所有 \`<a>\` 标签如无实际链接地址，使用 \`href="javascript:void(0)"\`
- ⚠️ **禁止使用** \`alert()\` / \`prompt()\` / \`confirm()\`（沙箱环境下不可用！用自定义弹窗代替）

### 代码质量要求
- 所有 \`<script>\` 代码块包裹在 \`try/catch\` 中，避免单个错误导致整个页面白屏
- 使用 CSS 变量（\`--primary\`, \`--bg\`, \`--text\`, \`--border\` 等）定义颜色，集中放在 \`:root\` 中
- 响应式设计：viewport-relative 单位 + flex/grid 布局
- 交互元素有 \`:hover\` 和 \`:active\` / \`:focus-visible\` 状态样式`;

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
