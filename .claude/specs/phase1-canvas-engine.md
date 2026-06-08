# Phase 1: AgentHub-V2—CanvasEngine 开发规范

## 模块职责
@xyflow/react 画布主容器 + 5 种自定义节点 + 派生连线 + dagre 自动布局 + canvasStore。
**依赖**: AgentHub-V2—SharedTypes（类型定义）

## 需创建的文件

### 1. `src/canvasStore.ts` — Zustand Canvas 状态管理
```typescript
// 管理 ReactFlow 的 nodes/edges/viewport/selection
// 提供: addNode, updateNode, removeNode, addEdge, removeEdge, setViewport, setSelection
// 每个 node 使用 nanoid 生成唯一 id
// edge 的 source/target 指向 node id
```

### 2. `src/CanvasView.tsx` — 画布主容器
```typescript
// 使用 @xyflow/react 的 ReactFlow 组件
// 包含: Background (dots), MiniMap, Controls
// 注册 5 种自定义 nodeType: 'order', 'workstation', 'artifactTile', 'merge', 'genui'
// 注册自定义 edgeType: 'lineage'
// 从 canvasStore 读取 nodes/edges, 通过 onNodesChange/onEdgesChange 同步
// 支持: 右键菜单 (新订单), 拖拽工件到工位, fitView
```

### 3. `src/nodes/OrderNode.tsx` — 订单卡节点
```typescript
// 显示: 左上角订单号徽章 (#1024), 订单意图文本, 右上角状态圆点
// 状态颜色: pending=灰, planning=黄, dispatched=蓝, done=绿
// 交互: 双击展开详情抽屉, 拖拽到工位=指派
// 样式: 浅色圆角矩形, 阴影, 最小宽度 240px
// 使用 React.memo 优化渲染
```

### 4. `src/nodes/WorkstationNode.tsx` — 工位卡节点
```typescript
// 显示: Agent 头像(emoji) + 名称 + vendor 徽章
// 状态脉冲条: 根据 WorkstationStatus 显示不同颜色+呼吸动画
//   idle=灰, thinking=黄(快速脉冲), producing=蓝(中速), awaiting-input=紫, done=绿, error=红
// 思考流: 最多显示最新 3 条 ThinkingFrame, 每条一行小字
//   "读: PMO 任务分配" / "决: 使用 React Hook Form" / "写: Hero.tsx:42"
// Telemetry: 顶部微型条形图 token/s
// Hover: 浮出操作菜单 (暂停/重启/查看详情)
// 双击: 打开 Agent 详情面板
```

### 5. `src/nodes/ArtifactTileNode.tsx` — 工件瓷砖节点
```typescript
// 显示: 瓷砖式卡片
// 左上角: 类型图标 (code=</>, webpage=🌐, doc=📄, ppt=📊)
// 右上角: 版本徽章 v3
// 内容区:
//   webpage 类型 → iframe 缩略图
//   code 类型 → 前 6 行代码 + 语言标签
//   doc 类型 → 首段文本渲染
// Hover: 200x120 预览悬浮窗
// 双击: 全屏工件模式
// 右键: 复制/导出/删除
// 可拖拽到 MergeNode 或 WorkstationNode
```

### 6. `src/nodes/MergeNode.tsx` — 合并/对比节点
```typescript
// 视觉: 菱形虚线框, 提示文字 "拖入 2 个以上工件"
// 行为: 拖入 ≥2 工件 → 触发 Diff/合并
// 拖入 3+ 工件 → 调用 PMO 输出演化提案
// 使用 React.memo
```

### 7. `src/nodes/GenUiNode.tsx` — GenUI 占位节点
```typescript
// 当 Agent 产出 ui-component chunk 时创建
// 包裹 @genui/Renderer 渲染对应的交互组件
// 显示: 标题 "Agent 需要你的选择", 下方渲染 GenUI 组件
// 位置: 自动落在对应 WorkstationNode 下方
// 用户操作后 → 调用 @genui/handlers → POST /api/agents/ui-input
```

### 8. `src/edges/LineageEdge.tsx` — 血脉连线
```typescript
// 3 种样式:
//   实线+箭头: Order → Workstation → Artifact (派单链)
//   虚线+箭头: Artifact → Artifact (版本演化)
//   双线+圆点节奏: 活跃中 (chunk 流动)
// 使用 @xyflow/react 的 BaseEdge + 自定义 SVG path
// 支持动画 (stroke-dasharray + animation)
// 颜色: 活跃=蓝色 #3370ff, 静态=灰色 #8b8fa3
```

### 9. `src/layout.ts` — dagre 自动布局
```typescript
// 使用 dagre 库计算节点位置
// 导出 autoLayout(nodes, edges): { nodes, edges }
// 布局方向: TB (从上到下)
// 节点间距: 水平 100px, 垂直 80px
// 新节点不重叠
// 如果节点超出视口, 自动 fitView
```

### 10. `src/canvasEvents.ts` — 画布事件路由
```typescript
// 处理画布上的用户交互事件:
// - onConnect: 手动连线
// - onNodeDragStop: 拖拽节点到工位/合并节点
// - onNodeDoubleClick: 打开详情/全屏
// - 右键菜单事件
// - 工件拖入 MergeNode 触发对比
// 所有事件最终调用 canvasStore action 或触发 API 调用
```

### 11. `src/index.ts` — Barrel Export
导出所有公共组件和工具函数

### 12. `__tests__/canvasStore.test.ts` — Store 单元测试
- addNode: 添加节点后 nodes 数组增长
- updateNode: 更新节点属性正确
- removeNode: 删除后 nodes 不包含该节点
- addEdge/removeEdge: 边增删正确
- setViewport: viewport 值更新正确

### 13. `__tests__/layout.test.ts` — 布局单元测试
- autoLayout: 3 个节点不重叠
- autoLayout: 空 nodes 不报错
- autoLayout: 节点按 TB 方向排列

## 技术要点
- @xyflow/react 的 useNodesState, useEdgesState hooks
- React.memo 包裹所有自定义节点 (避免不必要的重渲染)
- Tailwind CSS 飞书风格配色
- framer-motion 做脉冲动画 (WorkstationNode 的状态条)
- 节点最小宽度: OrderNode 240px, WorkstationNode 280px, ArtifactTileNode 200px

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—CanvasEngine
```
