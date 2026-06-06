# Auracle — 记忆方案决策记录

> 状态：**已拍板 — 方案 E**（2026-06，自 mem0 cloud 方案 D 修订）

---

## 决策：mem0 OSS 自部署（进程内）+ 固定 DJ system prompt

| 项 | 选择 |
|----|------|
| 长期记忆 | **mem0 OSS**（`mem0ai/oss`），内嵌于 `apps/api`，**不走 mem0 cloud** |
| 向量持久化 | **Qdrant**（本地 Docker 单容器，`./data/qdrant` volume） |
| 变更审计 | mem0 内置 **SQLite history**（`AURACLE_MEM0_HISTORY_DB`） |
| LLM / Embedder | 复用 **`GEMINI_API_KEY`**：`gemini-2.5-flash` 抽取 + `gemini-embedding-001`（768 维） |
| DJ 风格进化 | **固定 system prompt**（不写回 prompt）；不用 LangMem procedural memory |
| 框架 | **无 LangChain**；Fastify + `@google/genai` + `mem0ai/oss` |
| Session 边界 | `run_id` = `session_id`（写入 `metadata.run_id`） |
| 用户 | 硬编码 `userId: "auracle_user"` |

### 为何从 cloud 改为自部署

| 考量 | cloud（方案 D） | OSS 自部署（方案 E） |
|------|-----------------|----------------------|
| 答辩 / 离线 demo | 依赖 mem0.ai 可用性 | 记忆读写不依赖第三方 SaaS |
| 数据主权 | 偏好文本在 mem0 云 | 向量 + history 全在本地 |
| 评估可复现 | 外部黑盒 | 可导出 Qdrant volume + history.db |
| 运维成本 | 零 | 多一个 Qdrant 容器（`docker compose up -d qdrant`） |
| 与 Auracle 栈一致 | 需单独 `MEM0_API_KEY` | 复用已有 Gemini key 与 embed 模型 |

**未采用 mem0 官方 Docker server 全家桶**（Postgres + Neo4j + dashboard）：与 Demo「单 Fastify 进程、不用 PostgreSQL」冲突；进程内 OSS + Qdrant 足够。

### 理由（保留）

- 曲间 mood 打断（「太吵了」）和闲聊（「今天好累」）需要 **跨 session** 累积，mem0 抽取 + 召回质量足够
- Procedural memory（自动改 DJ prompt）论文好看，但 deadline 风险高；Demo 用固定人格 + mem0 事实即可支撑 Condition C
- SQLite `session_events` 记事件，**不** duplicate 记忆内容

---

## 本地启动

```bash
# 1. Qdrant（向量库，持久化到 ./data/qdrant）
docker compose up -d qdrant

# 2. API（mem0 OSS 在进程内初始化）
pnpm dev
```

首次运行会自动创建 `AURACLE_MEM0_HISTORY_DB` 所指目录。

---

## Context 注入完整流程

| 时机 | 操作 |
|------|------|
| `POST /sessions`（session 开始） | `memory.search()` → 读取历史偏好 → 烘焙进 `systemInstruction`（Live 连接前一次性写入） |
| Flow 重排前 | `memory.search()` → 注入 Step 2 prompt |
| Replan 成功后 | 写 mem0 + 通过 `realtimeInput` 随下一次 `cue_dj` 注入更新后的 tracklist 与偏好事实 |

> `systemInstruction` 在 Live 连接后不可更改；mid-session 的偏好更新通过 `realtimeInput` scene direction 传递，而非 `clientContent`。

---

## 写入时机

| 场景 | mem0 |
|------|------|
| mood / 风格打断并重排成功 | 写入偏好事实 |
| 闲聊带偏好语义（`record_preference` tool） | 写入 |
| skip / pause | 一般不写 |
| Flow 重排前 | **read** memories 注入 Step 2 prompt |

**评估条件差异**：Condition A / B 中 `record_preference` handler **noop**（工具定义保留，后端不写 mem0）；仅 Condition C 实际写入。

---

## 配置

```typescript
// apps/api/src/memory/client.ts
import { Memory } from "mem0ai/oss";

export const memory = new Memory({
  embedder: {
    provider: "google",
    config: {
      apiKey: process.env.GEMINI_API_KEY!,
      model: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
      embeddingDims: 768,
    },
  },
  llm: {
    provider: "google",
    config: {
      apiKey: process.env.GEMINI_API_KEY!,
      model: process.env.GEMINI_FLOW_MODEL ?? "gemini-2.5-flash",
    },
  },
  vectorStore: {
    provider: "qdrant",
    config: {
      url: process.env.QDRANT_URL ?? "http://localhost:6333",
      collectionName: "auracle_memories",
      dimension: 768,
    },
  },
  historyDbPath: process.env.AURACLE_MEM0_HISTORY_DB ?? "./data/mem0/history.db",
});

// Cloud SDK 的 user_id / run_id → OSS 的 userId / metadata
await memory.add("用户偏好 lo-fi，不喜欢高能量 EDM", {
  userId: "auracle_user",
  metadata: { run_id: sessionId },
});
```

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `GEMINI_API_KEY` | — | mem0 LLM + embedder 共用 |
| `GEMINI_FLOW_MODEL` | `gemini-2.5-flash` | mem0 记忆抽取 |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | mem0 向量（768 维，与曲库 embed 一致） |
| `QDRANT_URL` | `http://localhost:6333` | 本地 Qdrant |
| `AURACLE_MEM0_HISTORY_DB` | `./data/mem0/history.db` | mem0 变更审计 |

**已移除**：`MEM0_API_KEY`（cloud 专用）。

---

## 曾考虑的方案（归档）

<details>
<summary>方案 D：mem0 cloud — 已废弃</summary>

- 优点：零运维、Hobby 免费  
- 缺点：第三方依赖、答辩网络风险、偏好数据出境、评估难完全复现  
- 结论：Demo 后期改为 OSS 自部署  

</details>

<details>
<summary>方案 A：LangChain + LangMem — 未采用</summary>

- 优点：procedural memory、DJ 风格自动进化  
- 缺点：LangGraph 复杂度、召回弱、与「无 LangChain」冲突  

</details>

<details>
<summary>方案 B：LangChain + mem0 — 未采用</summary>

- 优点：mem0 召回好  
- 缺点：仍依赖 LangChain；已无必要  

</details>

<details>
<summary>mem0 官方 Docker server（Postgres + Neo4j）— 未采用</summary>

- 优点：REST API、dashboard、审计  
- 缺点：与 Demo 单进程 / 无 PG 原则冲突；运维重于需求  

</details>

---

## 相关文档

- 架构与存储：`auracle_architecture_storage.md`
- Live context 注入：`auracle_api_protocol.md`
