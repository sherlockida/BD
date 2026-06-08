# Phase 2: AgentHub-V2—DemoFX 开发规范

## 模块职责
Demo 加分特效引擎 — PMO Replay 动画、Live Telemetry 数据流、Skill Snap 卡片、Live Cursor Trails。
**依赖**: AgentHub-V2—SharedTypes（类型） + AgentHub-V2—CanvasEngine（canvasStore、ReplayEvent）

## 需创建的文件

### 1. `src/ReplayDirector.tsx` — PMO Replay 动画引擎
```
功能:
- 接收 ReplayEvent[] 数组 (按时间排序)
- 使用 requestAnimationFrame 加速回放
- 将实时协作过程压缩为 15-30 秒动画
- 回放步骤:
  1. 订单出现 (fade in)
  2. 工位亮起 (pulse animation)
  3. 工件依次落下 (slide-down + bounce)
  4. 连线逐段绘制 (stroke dash animation)
- 回放控制: 播放/暂停/速度调节 (1x/2x/5x/10x)
- 配合旁白字幕显示 (底部半透明文字条)

Props:
- events: ReplayEvent[]
- onComplete: () => void  // 回放结束回调
- speed?: number  // 默认 5 (5倍速)

实现:
- 用 useState 管理 replayIndex (当前回放到第几个事件)
- rAF 循环中按 speed 推进 replayIndex
- 每个事件类型触发不同的 DOM 动画
- 事件时间间隔 < 100ms 的合并为同一帧
- 导出 useReplay hook: { isPlaying, currentIndex, progress, play, pause, setSpeed }
```

### 2. `src/LiveTelemetry.tsx` — 实时遥测条形图
```
功能:
- 工位卡顶部的 token/s 实时条形图
- 根据 SSE chunk 速率计算 tokensPerSec
- 颜色编码: <10 t/s=绿, 10-50=黄, >50=红
- 微型条形图: 3-5 条竖条, 高度动态变化
- 显示数字: "42 t/s"

Props:
- tokensPerSec: number
- inputTokensUsed: number
- maxHeight?: number  // 条形图最大高度 px, 默认 24

样式:
- 水平排列的竖条, 间距 2px
- 竖条宽度 4px, 圆角
- 背景: 半透明灰色
- 数字: 右侧小字, 等宽字体
```

### 3. `src/SkillSnapCard.tsx` — Skill 沉淀卡片
```
功能:
- Replay 结束后弹出
- 标题: "沉淀为 Skill?"
- 显示: 当前画布拓扑摘要 (订单意图 + 涉及工位 + 产出工件数)
- 两个按钮:
  - "沉淀为 Skill" → 调用 onSave(topology)
  - "跳过" → onDismiss()
- 动画: 从下方滑入 (framer-motion)

Props:
- topology: { orderIntent: string; agentIds: string[]; artifactCount: number }
- onSave: (topology) => void
- onDismiss: () => void
- open: boolean
```

### 4. `src/LiveCursorTrails.tsx` — 调度光标轨迹
```
功能:
- PMO 派单时画布上的光带动效
- 从 PMO 工位 → 目标工位 → 产物落点
- 一条发光的贝塞尔曲线, 逐渐绘制

Props:
- active: boolean
- fromPosition: { x: number; y: number }
- toPosition: { x: number; y: number }
- color?: string  // 默认蓝色

实现:
- SVG path 覆盖在 ReactFlow 上方
- framer-motion pathLength 动画 (0→1)
- 光晕效果: filter="blur" + 渐变 stroke
- 动画完成时触发 onComplete
```

### 5. `src/index.ts` — Barrel Export
导出所有 4 个组件 + useReplay hook

### 6. `__tests__/replay.test.tsx` — Replay 单元测试
- useReplay: 初始化 isPlaying=false
- useReplay: play() 后 isPlaying=true
- useReplay: pause() 后 isPlaying=false
- useReplay: setSpeed(10) 后 speed=10
- 空 events 数组不报错

### 7. `__tests__/telemetry.test.tsx` — Telemetry 单元测试
- 渲染 tokensPerSec 数字
- tokensPerSec=5 → 绿色条形图
- tokensPerSec=30 → 黄色条形图
- tokensPerSec=80 → 红色条形图

## 验证命令
```
cd E:\AI Agent\games\BD\AgentHub-V2
npx vitest run AgentHub-V2—DemoFX
```
