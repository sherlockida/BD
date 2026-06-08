# Phase 1: AgentHub-V2—GenUI 开发规范

## 模块职责
生成式 UI 协议实现 — Catalog 定义（从 SharedTypes re-export）、解析器（从文本流抽取 ui 围栏）、4 个交互组件、Renderer 渲染分发、用户操作回传 handler。
**依赖**: AgentHub-V2—SharedTypes（Zod Schema + 类型）

## 需创建的文件

### 1. `src/parseUiFence.ts` — ui 围栏解析器
从 Agent 文本流中检测并抽取 ```ui ... ``` 代码围栏：

- 导出函数 `parseUiFence(text: string): { found: boolean; component?: CatalogComponentName; props?: Record<string,unknown>; error?: string }`
- 用正则匹配 ```ui\n{...}\n``` 模式
- 提取 JSON 后用 `validateCatalogProps` 校验
- 如果 component 字段不是已知的 CatalogComponentName，返回 error
- 如果 props Zod 校验失败，返回 error（不降级，由调用方决定降级策略）
- 边界情况处理：
  - 无 ui 围栏 → `{ found: false }`
  - 围栏内有非 JSON 内容 → `{ found: true, error: 'Invalid JSON' }`
  - JSON 格式正确但缺少 component 字段 → error
  - JSON 中 component 不在 catalog 中 → error
  - 一切正确 → `{ found: true, component: 'ChoiceCards', props: {...} }`

### 2. `src/components/ChoiceCards.tsx` — 选项卡片组件
```typescript
// Props: { title: string; options: Array<{id, label, preview?, description?}>; onSubmit: (value: {chosenId: string}) => void }
// 显示: 标题 + 2-6 个可点击选项卡片
// 每个卡片: 可选 preview (emoji/缩略图) + label + 可选 description
// 选中状态: 蓝边框高亮
// 点击后: 调用 onSubmit({ chosenId: selected })
// 动画: framer-motion 卡片入场动画 (stagger)
// 样式: Tailwind, 飞书风卡片圆角+阴影
```

### 3. `src/components/ColorPickerGrid.tsx` — 颜色选择器
```typescript
// Props: { title: string; suggested: string[]; allowCustom: boolean; onSubmit: (value: {hex: string}) => void }
// 显示: 标题 + 颜色网格 (最多 12 个色块)
// 每个色块: 40x40 圆角方块，背景色为对应 hex
// 可选自定义输入: 底部 #XXXXXX 文本框
// 选中效果: 2px 蓝边框 + scale(1.1)
// 动画: 色块逐个弹出
```

### 4. `src/components/SliderRange.tsx` — 数值滑块
```typescript
// Props: { title: string; min: number; max: number; step: number; defaultValue?: number; unit?: string; onSubmit: (value: {value: number}) => void }
// 显示: 标题 + 范围标签(min/max) + 滑块 + 当前值 + 单位
// 滑块使用 <input type="range">
// 实时显示当前值 (数字 + 单位)
// 确认按钮: "确认" → 调用 onSubmit
// 样式: 自定义滑块轨道+滑块颜色(Tailwind accent)
```

### 5. `src/components/ConfirmCard.tsx` — 确认卡片
```typescript
// Props: { title: string; body: string; danger: boolean; confirmLabel: string; cancelLabel: string; onSubmit: (value: {confirmed: boolean}) => void }
// 显示: 标题 + body 文本 + 两个按钮
// danger=true: 确认按钮为红色
// 点击确认 → onSubmit({ confirmed: true })
// 点击取消 → onSubmit({ confirmed: false })
// 动画: 卡片从下方滑入 (framer-motion slide-up)
```

### 6. `src/Renderer.tsx` — GenUI 渲染分发器
```typescript
// Props: { component: CatalogComponentName; props: Record<string,unknown>; componentId: string; onSubmit: (value: unknown) => void }
// 根据 component 名字渲染对应的 GenUI 组件:
//   'ChoiceCards' → <ChoiceCards ... />
//   'ColorPickerGrid' → <ColorPickerGrid ... />
//   'SliderRange' → <SliderRange ... />
//   'ConfirmCard' → <ConfirmCard ... />
// 未知组件 → 显示错误提示 "未知组件类型: {component}"
// 传入 onSubmit: 包装后调用外部 onSubmit({ componentId, value })
```

### 7. `src/handlers.ts` — 用户操作回传处理
```typescript
// 导出: submitUiInput(conversationId: string, componentId: string, value: unknown): Promise<void>
// 实现: POST /api/agents/ui-input
// Body: { conversationId, componentId, value }
// 错误处理: 捕获网络错误，console.warn
// 可选导出: useGenUiSubmit hook (如果需要 React 状态管理)
```

### 8. `src/index.ts` — Barrel Export
导出: parseUiFence, Renderer, submitUiInput, 4 个组件, handlers

### 9. `__tests__/parseUiFence.test.ts` — 解析器单元测试 (至少 8 个用例)
- 合法 ChoiceCards ui 围栏 → found:true + 正确 component 和 props
- 合法 ColorPickerGrid ui 围栏 → 正确解析
- 无 ui 围栏的普通文本 → found:false
- ui 围栏内非法 JSON → error 包含 'Invalid JSON'
- JSON 正确但缺少 component 字段 → error
- component 字段不在 catalog 中 → error
- props 不符合 schema (如 ChoiceCards 只有 1 个 option) → error
- 围栏未闭合 → found:false
- 多个 ui 围栏 → 只解析第一个完整围栏

### 10. `__tests__/components.test.tsx` — 组件渲染测试
- ChoiceCards: 渲染 3 个选项，点击后 onSubmit 被调用
- ColorPickerGrid: 渲染 12 个色块，点击后 onSubmit 被调用
- SliderRange: 渲染滑块，确认后 onSubmit 被调用
- ConfirmCard: danger 模式渲染红色按钮，点击确认/取消
- 每个组件验证 onSubmit 收到的 value 结构正确

## 技术要点
- 每个组件接收 `onSubmit` prop，不自己管理提交逻辑
- framer-motion 做入场动画 (AnimatePresence + motion.div)
- Zod schema 从 SharedTypes import (相对路径)
- parseUiFence 是纯函数，无副作用
- 所有组件使用 Tailwind + 飞书风配色

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—GenUI
```
