# Phase 1: AgentHub-V2—Panels 开发规范

## 模块职责
三大辅助面板 — 左侧工位墙 (BenchWall)、右侧时间线 (TimelineRail)、底部命令栏 (CommandBar)、⌘K 命令面板 (CommandPalette)。
**依赖**: AgentHub-V2—SharedTypes（类型定义）

## 需创建的文件

### 1. `src/BenchWall.tsx` — 左侧工位墙
```
功能:
- 紧凑版工位列表，显示所有 Agent
- 每个工位: emoji头像 + 名称 + 在线状态圆点
- 点击工位: 画布滚动到该工位 (通过回调 onFocusAgent(agentId))
- 可折叠为图标列 (只显示 emoji)
- 底部 "+ 添加 Agent" 入口按钮

Props:
- agents: Array<{ id, name, avatarEmoji, avatarColor, online, status?: WorkstationStatus }>
- onFocusAgent: (agentId: string) => void
- onAddAgent: () => void
- collapsed: boolean
- onToggleCollapse: () => void

样式:
- 固定宽度: 展开 200px, 折叠 56px
- 背景: 白色, 右边框
- 工位项: hover 灰色背景, 选中蓝色左边框
- 折叠时: tooltip 显示完整名称
```

### 2. `src/TimelineRail.tsx` — 右侧时间线
```
功能:
- 竖直时间轴, 从上到下 = 早→晚
- 每个 Agent 一条泳道 (lane)
- 泳道内: 方块 = 一次连续产出会话, 颜色编码状态
  - thinking=黄色, producing=蓝色, done=绿色, error=红色
- 泳道上: 圆点 = 里程碑事件 (启动/产物落地/错误/完成)
- 点击任意点: 通过 onJumpToTime(timestamp) 回调

Props:
- events: Array<{ timestamp, agentId, kind, summary, status }>
- onJumpToTime: (timestamp: number) => void
- agentIds: string[]  // 当前活跃的 agent

样式:
- 固定宽度: 240px
- 背景: 白色, 左边框
- 泳道: 水平线分隔
- 事件方块: 8px 高, 颜色按 status
- 时间标签: 小字灰色, 格式 HH:mm:ss
```

### 3. `src/CommandBar.tsx` — 底部命令栏
```
功能:
- 文本输入框: placeholder "输入需求，或 / 使用命令，@ 指定 Agent"
- 支持:
  - 普通文本 → 作为新订单发布 (onSubmitOrder)
  - /spec → 触发 SPEC 模板
  - /plan → 强制 PMO 编排
  - /deploy → 触发部署
  - /new-agent → 弹出自建 Agent 表单
  - @AgentName → @ 指定 Agent
- ⌘K 按钮: 打开命令面板

Props:
- onSubmitOrder: (text: string, mentions: string[]) => void
- onSlashCommand: (command: string) => void
- onOpenCommandPalette: () => void

样式:
- 固定在画布底部
- 输入框: 圆角, 灰色背景, 飞书风
- ⌘K 按钮: 右侧, 键盘快捷键样式徽章
```

### 4. `src/CommandPalette.tsx` — ⌘K 命令面板
```
功能:
- 浮层命令面板, 类似 VS Code Command Palette
- 搜索框: 实时过滤命令列表
- 命令列表:
  - "new order: 文本" / "o: 文本" → 创建新订单
  - "find agent: XXX" → 搜索并跳转到工位
  - "find artifact: XXX" → 搜索并跳转到工件
  - "replay" → 触发 PMO Replay
  - "deploy: artifactId" → 部署指定工件
  - "switch classic" → 切换到 Classic IM
  - "skill: skillName" → 搜索 Skill
  - "/spec" "/plan" "/deploy" "/new-agent" → Slash 命令
- 键盘导航: ↑↓ 选择, Enter 执行, Esc 关闭

Props:
- open: boolean
- onClose: () => void
- onExecute: (command: string, args?: string) => void
- artifacts?: Array<{ id, name }>  // 用于搜索
- agents?: Array<{ id, name }>      // 用于搜索

样式:
- 居中浮层, 半透明黑色背景遮罩
- 搜索框: 顶部, 自动聚焦
- 命令项: 左侧图标 + 命令名, 右侧快捷键提示
- 选中项: 蓝色背景
- 动画: framer-motion 淡入+缩放
```

### 5. `src/index.ts` — Barrel Export
导出所有 4 个组件

### 6. `__tests__/panels.test.tsx` — 面板单元测试
- BenchWall: 渲染 agent 列表, 点击触发 onFocusAgent, 折叠/展开切换
- TimelineRail: 渲染时间轴事件, 点击触发 onJumpToTime
- CommandBar: 输入普通文本触发 onSubmitOrder, 输入 /spec 触发 onSlashCommand
- CommandPalette: open=true 渲染, open=false 不渲染, 搜索过滤, ↑↓ 选择, Esc 触发 onClose, Enter 触发 onExecute

## 技术要点
- 所有组件接收回调 props, 不直接修改全局状态
- 使用 Tailwind CSS 飞书风格
- framer-motion 做 CommandPalette 的入场/出场动画
- CommandBar 解析 @mentions 用正则: /@(\S+)/g
- CommandBar 解析 /slash 用 startsWith('/')
- TimelineRail 用纯 div + CSS (不需要第三方时间轴库)
- 键盘快捷键: ⌘K 用 Ctrl+K / Meta+K, Esc 关闭面板

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—Panels
```
