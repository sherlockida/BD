---
name: im-message-streaming
description: 流式消息的"边收边渲染"实现要点
metadata:
  type: skill
  source: hand-crafted
  created_at: 2026-05-20
---

# When to use
- 任何"agent 输出内容需要 typing 效果"的场景
- 任何"长消息需要边显示边追加"的场景

# How to do

## 1. 数据层：让一条消息可以"被增量修改"
- 在 store 里给消息一个 `streaming: true` 标记
- 用 `patchMsg(state, convId, msgId, m => ({...}))` 做不可变追加
- 流式结束后把 `streaming` 改 false（用于关闭 typing 指示器）

## 2. 通信层：把 LLM SSE 转换为 AsyncIterable
```ts
async *chat(input): AsyncIterable<AgentChunk> {
  for await (const chunk of await callLLM(input)) {
    yield mapToAgentChunk(chunk);
  }
  yield { type: 'done' };
}
```

## 3. UI 层：避免每个字符都 re-render 全树
- 用 zustand 的细粒度 selector 订阅"那一条消息"
- 或者把"正在 streaming 的消息" body 抽成单独子组件
- 千万不要把整个 messages 数组重新构造，否则 30fps 都做不到

## 4. 用户体验细节
- 显示三个跳动的点（typing indicator）在头像名字旁边
- 最后一个字符后跟一个 cursor `▍`（CSS animation）
- 别在 stream 期间允许用户"复制"，光标抖动会让选择失败

# Example

参考 `src/store/appStore.ts` 中 `handleChunkInto()` 与 `MessageBubble.tsx`
中的 `typing-cursor` CSS class。

# Pitfalls

- ❌ 在 stream 期间允许用户重新生成 → 状态机会冲突
- ❌ 用 `setState({...all})` 整体覆盖 → 触发雪崩 render
- ✅ 用 immutable patch，仅改单条消息 ref
