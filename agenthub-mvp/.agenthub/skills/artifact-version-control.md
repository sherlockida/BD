---
name: artifact-version-control
description: 产物的版本时间线 + Diff + 回滚的最简模型
metadata:
  type: skill
  source: hand-crafted
  created_at: 2026-05-20
---

# When to use
- 任何"AI 输出物需要保留迭代历史"的场景
- 用户希望能看 Diff、回滚到任意版本

# How to do

## 1. 数据模型：append-only 版本流
```ts
Artifact {
  id, name, type,
  versions: ArtifactVersion[]  // 永远 append，不删
  latestVersionId
}

ArtifactVersion {
  id, version: number,
  content,
  authorAgentId,
  commitMessage,
  createdAt
}
```

## 2. 写入路径：upsert + 自动出 diff card
- 同名 artifact 再次到来 → 新增 version + 自动出一条 diff card 消息
- 同名 artifact 首次到来 → 新建 artifact + 一条 artifact card 消息

## 3. 回滚：也是新增 version
- 不要"删除"中间版本，否则历史不可审计
- 把要回滚到的 content 复制成一个 new version，commitMessage = `revert: 回滚到 vX`

## 4. Diff 算法
- MVP 用简单的两指针 + lookahead 启发（参见 `src/utils/diff.ts`）
- 真实环境推荐 `diff-match-patch` 或 `jsdiff`
- 展示时用 `+` `-` 行级 + 行号双列

# Example

参考 `src/store/appStore.ts` 的 `handleChunkInto()` 处理 `artifact-draft` chunk
分支，以及 `src/components/ArtifactPanel.tsx` 的 History/Diff Tab。

# Pitfalls

- ❌ 版本号用 timestamp 而非 incrementing int → UI 难显示 "v1, v2, v3"
- ❌ 多 agent 并发写同一 artifact 时直接覆盖 → 应该 enqueue + 串行落版本（v1.1 用 CRDT）
- ✅ 把"写 artifact"和"发卡片消息"做成原子操作，避免界面不一致
