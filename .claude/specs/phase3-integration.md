# Phase 3: AgentHub-V2—Integration 开发规范

## 模块职责
全模块组装（wiring）、集成测试（跨模块连通性）、E2E Playwright 测试（3 条完整流程）、构建验证。
**依赖**: 所有 7 个模块

## 需创建的文件

### 1. `src/wiring.ts` — 模块间依赖注入与组合
```
功能:
- 将所有模块连接起来
- 初始化 canvasStore
- 连接 Canvas 事件 → API 调用
- 连接 GenUI 渲染 → Agent 消息流
- 连接 Panels → Canvas 导航
- 连接 DemoFX → Canvas 动画

导出:
- bootstrapApp(): { canvasStore, appStore }
  → 初始化所有 store
  → 注册 ReactFlow nodeTypes 和 edgeTypes
  → 返回 store 实例

实现:
import { useCanvasStore } from '@canvas/canvasStore';
import { CanvasView } from '@canvas/CanvasView';
import { LineageEdge } from '@canvas/edges/LineageEdge';
import { OrderNode, WorkstationNode, ArtifactTileNode, MergeNode, GenUiNode } from '@canvas/nodes';
import { Renderer } from '@genui/Renderer';
import { submitUiInput } from '@genui/handlers';
import { BenchWall, TimelineRail, CommandBar, CommandPalette } from '@panels/index';
import { ReplayDirector, LiveTelemetry, SkillSnapCard } from '@demofx/index';
// ... etc

// 注册自定义节点类型
export const nodeTypes = {
  order: OrderNode,
  workstation: WorkstationNode,
  artifactTile: ArtifactTileNode,
  merge: MergeNode,
  genui: GenUiNode,
};

export const edgeTypes = {
  lineage: LineageEdge,
};

// 初始化函数
export function initializeV2App() {
  // 初始化 canvas store
  // 连接 GenUI handler 到 API
  // 注册全局键盘快捷键 (⌘K)
  // etc.
  return { nodeTypes, edgeTypes };
}
```

### 2. `src/bootstrap.ts` — 应用启动初始化
```
功能:
- 应用启动时调用
- hydration: 从后端拉取数据
- WebSocket 连接
- Canvas 初始视口设置

导出:
- useAppBootstrap(): { ready: boolean; error?: string }
  → React hook
  → 返回 ready 状态（hydration 完成 + WS 连接）
  → 如果失败，返回 error 信息
```

### 3. `__tests__/integration.test.ts` — 跨模块集成测试
```
测试用例 (至少 6 个):
1. 模块导入连通性:
   - SharedTypes 类型可以在 CanvasEngine 中使用
   - GenUI 可以 import SharedTypes 的 Zod schema
   - Panels 可以 import SharedTypes 的类型

2. Canvas + GenUI 连通:
   - GenUiNode 可以渲染 Renderer 组件
   - ChoiceCards onSubmit → submitUiInput 调用

3. Canvas + Panels 连通:
   - BenchWall onFocusAgent → CanvasView 滚动到对应工位
   - CommandBar onSubmitOrder → CanvasView 创建 OrderNode

4. Store 数据流:
   - canvasStore.addNode → CanvasView 显示新节点
   - canvasStore 的 node 更新 → WorkstationNode 重渲染

5. 端到端数据流:
   - 用户输入 → OrderNode 创建 → canvasStore 更新 → CanvasView 渲染

6. 类型系统一致性:
   - SharedTypes.ViewMode 与 AppShell.ViewMode 类型兼容
   - SharedTypes.WorkstationStatus 与 CanvasEngine 使用的状态值一致
```

### 4. `__tests__/e2e/canvas-flow.spec.ts` — Playwright E2E: Canvas 完整流程
```
测试场景 (Playwright):
1. 打开页面 → Canvas 模式默认显示
2. 输入 "做个博客首页" → OrderNode 出现在画布上
3. PMO 工位脉冲动画可见
4. 工件落入画布 (ArtifactTile 渲染)
5. 派生连线可见
6. 双击工件 → 全屏预览打开
7. 切换到 Classic IM → 三栏布局显示
8. 切回 Canvas → 画布状态保持
```

### 5. `__tests__/e2e/genui-flow.spec.ts` — Playwright E2E: GenUI 交互流程
```
测试场景 (Playwright):
1. 触发 ChoiceCards → 选项卡片在画布上渲染
2. 点击选项 → onSubmit 被调用
3. 触发 ColorPickerGrid → 颜色选择器渲染
4. 选择颜色 → hex 值正确传递
5. 触发 ConfirmCard danger → 红色按钮显示
6. 点击确认 → confirmed: true 传递
```

### 6. `__tests__/e2e/replay.spec.ts` — Playwright E2E: Replay 回放
```
测试场景 (Playwright):
1. 完成一次协作后 → "复盘"按钮可见
2. 点击复盘 → Replay 动画开始
3. 回放过程中工件依次出现
4. 回放结束后 SkillSnapCard 弹出
5. 点击"沉淀为 Skill" → onSave 被调用
```

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx tsc --noEmit          # 零错误
npx vitest run            # 全部单测+集成测试通过
npx playwright test       # 3 条 E2E 通过 (需要先启动 dev server)
npx vite build            # 构建成功，无 warning
```

## 最终交付标准
- [ ] 8 个模块全部完成
- [ ] TypeScript 编译零错误
- [ ] 所有单元测试通过 (预计 80+ tests)
- [ ] 集成测试通过
- [ ] E2E 测试通过 (3 条 spec)
- [ ] 生产构建成功
- [ ] 切换到 Classic IM 后 v1.1 功能正常
