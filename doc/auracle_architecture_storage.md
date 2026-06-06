# Auracle — 架构 & 存储设计记录

> 状态：已拍板（2026-06）  
> **Demo 策略：先单 TS 后端跑通，生产表现后续迭代。**

---

## 产品形态：混合场 + 实时 Live DJ

- 一场 session 约 **8 首**，有 Warm-up → Peak → Wind-down **能量弧线**
- **曲间**用户可语音打断（改 mood、skip、pause、闲聊）；**播歌中**不打断编排（用户说话则 duck 音乐）
- 打断后 **只重排 remaining tracks**，已播曲目不变
- DJ 口播由 **Gemini Live**（STS）实时生成，**不是**离线 TTS 管道

---

## Demo 架构：TypeScript monolith

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (React, Desktop Chrome Phase 1)                    │
│  · WS ↔ Fastify（麦克风 16k PCM ↑ · DJ 24k PCM ↓ · JSON）     │
│  · REST ↔ sessions / tracks                                  │
│  · Web Audio：曲库 mp3 + musicGain / djGain（电台 crossfade） │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  apps/api (Fastify + TypeScript) :3000                       │
│  · Gemini Live WS 中继（@google/genai）                       │
│  · Session 状态机（内存）                                     │
│  · Flow 重排 → Gemini Flash JSON                             │
│  · mem0 · SQLite · session_events                            │
└─────────────────────────────────────────────────────────────┘
```

### 为什么 Demo 不用 Go + Node 双后端

| 双后端成本 | 单 Fastify |
|------------|------------|
| 两进程、跨语言调试 | 一个 `pnpm dev` |
| proxy ↔ api REST 同步 session | intent / 重排进程内调用 |
| 两套部署 | api + 静态 web 即可 |

Go 版 [rt_llm_proxy](https://github.com/thinkinbig/rt_llm_proxy) 的价值在 **WebRTC/Opus 生产级媒体面**；Auracle Demo 音乐在浏览器 Web Audio，DJ 走 WS PCM 足够。

---

## Demo vs 生产（后续优化，不阻塞 Demo）

| 维度 | Demo（现在） | 生产（以后可选） |
|------|--------------|------------------|
| 后端 | 单 Fastify TS | 可拆媒体面 / 加 TURN |
| 浏览器 ↔ 服务端 | WebSocket PCM | WebRTC（可参考 rt_llm_proxy） |
| 部署 | 单容器 / Railway | 水平扩展、Redis、Kafka log |
| 断线续播 | 不保证 | session resumption |
| iOS Live 双工 | 不支持 | 原生或优化 PWA |

**原则：Demo 不为「将来可能」引入第二套运行时。**

---

## Monorepo 结构

```
auracle-dj-radio/
├── apps/
│   ├── web/          # React · WS client · Web Audio
│   └── api/          # Fastify · Live · Flow · mem0 · SQLite
├── packages/
│   └── shared/       # Tracklist、Phase、Intent、WS 消息类型
├── doc/
└── pnpm-workspace.yaml
```

- **不使用 LangChain**；`@google/genai` + structured JSON  
- 部署：web 静态资源 + api（需 **WebSocket** 支持，如 Railway/Fly/自托管 VPS）

---

## Gemini 模型分工

| 用途 | API | 模型（Demo 默认） |
|------|-----|-------------------|
| 曲间实时 DJ | Gemini **Live** | **`gemini-3.1-flash-live-preview`** |
| Flow 重排 JSON | `generateContent` + schema | `gemini-3.1-flash-lite` |
| 向量检索 | 暂不换模型 | SQLite + TS 余弦相似度 |

Live 与 Flow 同进程、同 SDK，共享 `GEMINI_API_KEY`。  
Live 模型 env：`GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`（见 `auracle_gemini_integration.md` § 3.1 约束）。

---

## 存储：SQLite + mem0

| 数据 | 存储 | 说明 |
|------|------|------|
| 曲库元数据 + embedding | SQLite `tracks` | embedding JSON 列 |
| 打断 / 重排 / 播放事件 | SQLite `session_events` | 评估复现 |
| Session plan、播放指针 | **Fastify 内存** | Demo 不持久化 |
| 用户偏好 | **mem0 OSS**（进程内）+ **Qdrant** | `userId` + `metadata.run_id` |
| Live 音频 | 不存 | 实时流 |

**不需要 PostgreSQL。** mem0 向量走 Qdrant（`pnpm docker:dev` 或 `pnpm docker:prod`）；history 走 SQLite 文件。

```sql
-- tracks: id, title, artist, energy, tempo, genre, mood, embedding_json, file_path, intro_offset_ms NULL
-- session_events: session_id, ts, event_type, payload_json
```

---

## 用户系统：单用户，无登录

- `user_id` 硬编码 `"auracle_user"`

---

## 向量检索（Step 1）

- Fastify 内 TS 余弦相似度，500 首 < 50ms
- **Embedding 模型**：`gemini-embedding-001`（native 3072 维，不截断），离线预计算写入 SQLite；运行时对 query 调同模型 embed → 余弦 Top-K。离线/测试用 HashEmbedder（768 维，确定性，无需 key）——两者向量空间不同，切换须重建索引
- 换模型须全量重建索引；Demo 期间曲库固定，一次性建库即可

---

## mem0（OSS 自部署）

```typescript
import { Memory } from "mem0ai/oss";

const memory = new Memory({
  embedder: { provider: "google", config: { apiKey: GEMINI_API_KEY, model: "gemini-embedding-001" } }, // native 3072
  llm: { provider: "google", config: { apiKey: GEMINI_API_KEY, model: "gemini-3.1-flash-lite" } },
  vectorStore: { provider: "qdrant", config: { url: QDRANT_URL, collectionName: "auracle_memories", dimension: 3072 } },
  historyDbPath: AURACLE_MEM0_HISTORY_DB,
});
// userId: "auracle_user", metadata.run_id: session_id
```

见 `auracle_memory_decision.md` 完整配置与 `docker-compose.yml`。

---

## 曲间 Intent（P0 / P1）

| P0 | skip · mood 重排 · pause · 闲聊 |
| P1 | explicit pick · full replan |

Gemini Live **function calling** → 同进程 `flow.replan()`。

---

## Phase 1 平台

| ✅ | ❌ Phase 2 |
|----|------------|
| Desktop Chrome / Edge | iOS Safari 双工 Live |
| Web Audio crossfade | 原生 app |

---

## 相关文档

- **Gemini 嵌入（Group 24 场景）：`auracle_gemini_integration.md`**
- 协议：`auracle_api_protocol.md`  
- Flow：`auracle_flow_prompt_design.md`  
- 音频：`auracle_pwa_audio_notes.md`
