# Auracle — 记忆方案决策记录

> 状态：**已拍板 — 方案 E**（2026-06，自 mem0 cloud 方案 D 修订）

---

## 决策：mem0 OSS 自部署（进程内）+ 固定 DJ system prompt

| 项 | 选择 |
|----|------|
| 长期记忆 | **mem0 OSS**（`mem0ai/oss`），内嵌于 **`services/memory-service`**，**不走 mem0 cloud** |
| 向量持久化 | **Qdrant**（本地 Docker 单容器，`./data/qdrant` volume） |
| 变更审计 | mem0 内置 **SQLite history**（`AURACLE_MEM0_HISTORY_DB`） |
| LLM / Embedder | 复用 **`GEMINI_API_KEY`**：`gemini-3.1-flash-lite` 抽取 + `gemini-embedding-001`（**native 3072 维**，不截断） |
| DJ 风格进化 | **固定 system prompt**（不写回 prompt）；不用 LangMem procedural memory |
| 框架 | **无 LangChain**；Fastify + `@google/genai` + `mem0ai/oss` |
| Session 边界 | `run_id` = `session_id`（写入 `metadata.run_id`） |
| 用户 | **per `user_id`**：登录用户用 auth id；匿名 demo 用 `auracle_anonymous`（**评估禁止**） |

### 为何从 cloud 改为自部署

| 考量 | cloud（方案 D） | OSS 自部署（方案 E） |
|------|-----------------|----------------------|
| 答辩 / 离线 demo | 依赖 mem0.ai 可用性 | 记忆读写不依赖第三方 SaaS |
| 数据主权 | 偏好文本在 mem0 云 | 向量 + history 全在本地 |
| 评估可复现 | 外部黑盒 | 可导出 Qdrant volume + history.db |
| 运维成本 | 零 | 多一个 Qdrant 容器（`pnpm docker:dev`） |
| 与 Auracle 栈一致 | 需单独 `MEM0_API_KEY` | 复用已有 Gemini key 与 embed 模型 |

**未采用 mem0 官方 Docker server 全家桶**（Postgres + Neo4j + dashboard）：与 Demo「单 Fastify 进程、不用 PostgreSQL」冲突；进程内 OSS + Qdrant 足够。

### 理由（保留）

- 曲间 mood 打断（「太吵了」）和闲聊（「今天好累」）需要 **跨 session** 累积，mem0 抽取 + 召回质量足够
- Procedural memory（自动改 DJ prompt）论文好看，但 deadline 风险高；Demo 用固定人格 + mem0 事实即可支撑 Condition C
- SQLite `session_events` 记事件，**不** duplicate 记忆内容

---

## 本地启动

```bash
# 1. Qdrant + API（Docker；向量库持久化在 qdrant_data volume）
pnpm docker:dev

# 2. 本地 API 进程（mem0 OSS 在 memory-service 内初始化）
pnpm --filter memory-service dev
```

首次运行会自动创建 `AURACLE_MEM0_HISTORY_DB` 所指目录。

---

## Context 注入完整流程

| 时机 | 操作 | 代码状态 |
|------|------|----------|
| `POST /sessions`（session 开始） | 双 query `memory.search()`（P1）→ 烘焙进 `systemInstruction` | ✅ recall；⏳ 双 query 为 P1 |
| Flow 初始 plan | 同上 memories + C only `skipRateByEnergy` | ✅ / ⏳ skip 仅 C 为 P0 |
| Flow **replan**（`mood_change`） | 传入 `mem0Context` + memories 进 Step 2 | ⏳ **P0**（当前 `replan()` 硬编码 `memories: ""`） |
| Replan 成功后 | 写 mem0（C only） | ✅ |
| 曲间 cue | `inject_text` 曲目上下文；**不含** session 内新偏好 | ✅；偏好回灌 cue 为 **P2** |

> `systemInstruction` 在 Live 连接后不可更改。Session 内新写入的偏好 **不**自动更新 DJ（`mem0Context` 为开场快照）；P2 可选通过 `realtimeInput` 回灌。

### recall query（目标，P1）

1. `music preferences for a {mood} {scene} session`  
2. `general music taste and listening habits`  

合并 topK、去重后注入 Flow 与 DJ。

---

## 跨 session 行为信号（skip 权重）

| 项 | 说明 |
|----|------|
| 来源 | `session_events` 中 `skip_latency`（含 `energy`） |
| 聚合 | **per `user_id`**，最近 N 个 session（⏳ P0） |
| 作用 | Step 1 检索：该 energy 档位结构化分 × `(1 − weight)` |
| 条件 | **仅 Condition C**（A/B 不传 `energyWeights`） |

与 mem0 文本事实互补：skip 权重为**隐式行为**；mem0 为**显式事实**。

---

## 写入时机

| 场景 | mem0 | 条件 |
|------|------|------|
| mood 打断并重排成功 | 模板事实 | C only |
| 闲聊（`record_preference` tool） | DJ 提炼 fact | C only |
| 60s 内 skip | 模板事实（含 energy / mood / scene） | C only |
| pause / 完播 | 一般不写（P1 可加规则） | — |
| Flow replan 前 | **read** memories | C only |

**评估条件差异**：Condition A / B 中 `record_preference` handler **noop**（工具定义保留）；A/B **不**写 mem0、**不**应用跨 session skip 权重。

---

## 配置

```typescript
// services/memory-service/src/memory/client.ts
import { Memory } from "mem0ai/oss";

export const memory = new Memory({
  embedder: {
    provider: "google",
    config: {
      apiKey: process.env.GEMINI_API_KEY!,
      model: process.env.GEMINI_MEM0_EMBED_MODEL ?? "gemini-embedding-001",
      // omit embeddingDims → use gemini-embedding-001 native 3072 dims
    },
  },
  llm: {
    provider: "google",
    config: {
      apiKey: process.env.GEMINI_API_KEY!,
      model: process.env.GEMINI_FLOW_MODEL ?? "gemini-3.1-flash-lite",
    },
  },
  vectorStore: {
    provider: "qdrant",
    config: {
      url: process.env.QDRANT_URL ?? "http://localhost:6333",
      collectionName: "auracle_memories",
      dimension: 3072,
    },
  },
  historyDbPath: process.env.AURACLE_MEM0_HISTORY_DB ?? "./data/mem0/history.db",
});

// OSS: userId + runId（runId = session_id）
await memory.add("User prefers lighter energy during study sessions.", {
  userId: participantUserId, // 或 auracle_anonymous
  runId: sessionId,
});
```

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `GEMINI_API_KEY` | — | mem0 LLM + embedder 共用 |
| `GEMINI_FLOW_MODEL` | `gemini-3.1-flash-lite` | Flow 编排 + mem0 记忆抽取 |
| `GEMINI_MEM0_EMBED_MODEL` | `gemini-embedding-001` | mem0 向量（native 3072 维；曲库检索不再 embed） |
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
- 个性化实施计划 & 评估 Checklist：`auracle_personalization_plan.md`
