# Phase 2: AgentHub-V2—AppShell 开发规范

## 模块职责
应用顶层外壳 — App.tsx 视图路由（Canvas vs Classic）、TopBar、ClassicIMView 包装、main.tsx 入口、Onboarding 引导。
**依赖**: AgentHub-V2—SharedTypes + CanvasEngine + GenUI + Panels

## 需创建的文件

### 1. `src/App.tsx` — 顶层视图路由
```
功能:
- ViewMode 状态: 'canvas' | 'classic' (默认 'canvas')
- canvas 模式: 渲染 CanvasView + BenchWall + TimelineRail + CommandBar
- classic 模式: 渲染 ClassicIMView (包装 v1.1 三栏布局)
- 切换时: 零白屏、不丢失数据 (两个视图共享 appStore)
- 顶栏: TopBar (view + onSwitch props)

布局 (canvas 模式):
┌──────────────────────────────────────────┐
│              TopBar                       │
├────────┬─────────────────────┬───────────┤
│ Bench  │   CanvasView        │ Timeline  │
│ Wall   │   (ReactFlow)       │ Rail      │
│        │                     │           │
├────────┴─────────────────────┴───────────┤
│              CommandBar                   │
└──────────────────────────────────────────┘

技术:
- 从 @canvas/CanvasView import CanvasView
- 从 @panels/BenchWall import BenchWall
- 从 @panels/TimelineRail import TimelineRail
- 从 @panels/CommandBar import CommandBar
- 从 @panels/CommandPalette import CommandPalette
- 从 v1.1 legacy: import ConversationList, ChatWindow, ArtifactPanel
- 用 useState<ViewMode> 管理视图模式
```

### 2. `src/TopBar.tsx` — 顶部工具栏
```
功能:
- 左侧: AgentHub Canvas logo + 项目下拉选择
- 中间: Canvas/Classic 视图切换按钮 [● Canvas | ○ Classic IM]
- 右侧: ⌘K 搜索按钮 + 用户头像

Props:
- view: ViewMode
- onSwitch: (mode: ViewMode) => void
- onOpenCommandPalette: () => void

样式:
- 高度: 48px
- 背景: 白色, 底部边框
- 视图切换: 分段控件样式 (segment control)
  - 选中: 蓝色背景 + 白色文字
  - 未选中: 灰色文字
```

### 3. `src/ClassicIMView.tsx` — Classic IM 模式包装
```
功能:
- 包装 v1.1 的三栏布局
- 直接 import v1.1 的组件并渲染:
  - ConversationList (左侧对话列表)
  - ChatWindow (中间聊天区)
  - ArtifactPanel (右侧产物面板)
  - AgentMarket, SkillsDrawer (弹窗)
  - NewChatModal, NewAgentModal (模态框)
- 复用 v1.1 的 useAppStore (通过 legacy import)
- 复用 v1.1 的 useAgentHubWS

Import 路径:
- 从 ../../agenthub-mvp/src/components/ 导入 v1.1 组件
- 从 ../../agenthub-mvp/src/store/appStore 导入 useAppStore
- 从 ../../agenthub-mvp/src/hooks/useAgentHubWS 导入 useAgentHubWS

实现:
- 复用 v1.1 App.tsx 的核心逻辑
- 去掉 v1.1 的 App 根容器，改为此组件的子元素
```

### 4. `src/main.tsx` — Vite 入口
```
功能:
- ReactDOM.createRoot(document.getElementById('root')!)
- render <App />
- 导入 global.css (Tailwind)

代码:
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 5. `src/Onboarding.tsx` — 首次使用引导
```
功能:
- 首次进入 Canvas 模式时显示
- 30 秒引导覆盖层
- 3 步引导 (带步骤指示器):
  1. "在画布上点右键 → 新订单，或在底部输入需求"
  2. "PMO 接单后，工位自动亮起开始工作"
  3. "工件落到画布上时，双击即可全屏预览"
- "跳过" 按钮 + "下一步/完成" 按钮
- 用 localStorage 记录: 'agenthub-v2-onboarding-done'

Props: 无 (自管理状态)

样式:
- 半透明遮罩 + 白色卡片
- 步骤指示器: 3 个圆点
- 动画: framer-motion fade-in
```

### 6. `src/index.ts` — Barrel Export
导出: App, TopBar, ClassicIMView, Onboarding

### 7. `__tests__/app.test.tsx` — App 组件测试
- App 默认渲染 Canvas 模式
- 切换到 Classic 模式后渲染 ClassicIMView
- TopBar 渲染两个视图切换按钮
- Onboarding: 首次渲染显示引导, 点击"跳过"后关闭

## 技术要点
- 视图切换不卸载组件 (用 CSS display/visibility 而非条件渲染)
- v1.1 组件通过相对路径 import (../../agenthub-mvp/src/...)
- v1.1 store 直接使用 useAppStore (不需要重新包装)
- 全局 CSS 在 main.tsx 中导入一次
- 路径别名 @canvas, @panels 等在 vite.config.ts 中配置

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—AppShell
```
