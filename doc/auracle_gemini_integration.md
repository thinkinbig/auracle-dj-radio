# Auracle — Gemini 深度嵌入方案

> 对照 Mid-term 场景：[Group 24.pdf](./Group%2024.pdf)  
> **Live DJ 模型：`gemini-3.1-flash-live-preview`**（Gemini 3.1 Flash Live Preview）  
> Flow 编排：`gemini-2.5-flash` · 栈：Fastify TS + `@google/genai` + mem0 + SQLite

---

## 1. 场景回顾（PDF → 我们要做什么）

Mid-term 定义的产品 **不是歌单，是电台**：

| PDF 表述 | 技术含义 |
|----------|----------|
| 「Tell Auracle how you feel and what you're doing」 | 开场输入：`mood` + `scene`（文字或语音） |
| 「Quiet Hours, vol. 3 · 45 min · winds down」 | 命名 session + 时长/弧线标签（Flow 输出） |
| 「Press play once」 | 一次启动；曲间可有 Live 对话（实现层扩展，不改变「电台感」） |
| 「Like or skip flows back into memory」 | `session_events` → mem0（跨 session 偏好） |
| 四层卖点 01–04 | 见下节 Gemini 分工 |

三层架构（PDF § HOW IT'S BUILT）与代码映射：

| PDF 层 | Auracle 实现 |
|--------|--------------|
| **Listener** | `apps/web` — mood 选择、播放、skip/like、字幕 |
| **Brain** | `apps/api` — Gemini Live + Flow + intent |
| **Store** | SQLite（曲库 + tags + embedding）+ mem0（用户偏好） |

**Gemini 只覆盖 Brain 里的「语言智能」**；曲库 mp3 是离线生成 pipeline，**不在运行时调 Gemini 生音乐**。

---

## 2. 四支柱 × Gemini API 对照

PDF 强调：「The language model is one part — the product is how the four pieces fit together.」  
Gemini 应 **分模型、分 API、分时机** 嵌入，而不是一个 Live 会话包打天下。

```
                    ┌─────────────────────────────────────┐
                    │           OFFLINE（建库一次）          │
                    │  gemini-embedding-001 打 tag 向量     │
                    │  （或继续自建 JSON embedding）         │
                    └─────────────────┬───────────────────┘
                                      ▼
用户 mood/scene ──▶ Step1 检索 ──▶ Step2 Flow JSON ──▶ session plan
       │              (SQLite)      (gemini-2.5-flash)      │
       │                                                    │
       └──────────── WS Live ──────────────────────────────┘
                    (gemini-3.1-flash-live-preview)
                         Host 口播 + 曲间 intent tools
                              │
                    skip/like ──▶ mem0（跨 session）
```

### 01 — MEMORY（跨 session 学口味）

| PDF | Gemini 做什么 | 不做什么 |
|-----|---------------|--------|
| 观察 skip / 完播 / 收听时段 | Live **tool** `record_preference` 或后端规则写 mem0 | 不用 Gemini 自带 long-context 当用户 DB |
| remembers across sessions | **mem0 OSS**（进程内 + Qdrant）+ `userId` / `metadata.run_id` | 不用 Live session 当永久记忆（会随 WS 断线丢失） |

**嵌入方式：**

1. **结构化信号**（优先）：skip、完播率、mood 打断 → Fastify 写 `session_events`，异步 `mem0.add()`  
   ```text
   "User skipped high-energy tracks during late-night study sessions."
   ```

2. **非结构化信号**：曲间闲聊「今天好累」→ Live 调 `record_preference({ fact: "..." })` → mem0  

3. **读记忆**：`POST /sessions` 与 Flow 重排前 `mem0.search()`，注入 Step 2 prompt 与 Live `systemInstruction` 附录  

Gemini **不负责存储**；负责 **从对话/行为中抽取可写入 mem0 的事实**（可用 Flash 做抽取，Demo 可规则+tool 够用）。

---

### 02 — SESSION FLOW（弧线，不是排序列表）

| PDF | Gemini 做什么 |
|-----|---------------|
| ease in → peak → wind down | Step 2 **JSON schema** 强制 `flow_position` + energy 阶段 |
| tempo ≤ 15 BPM | schema + **后置校验**；失败则 Flash 重试一次 |
| 「a curve, not a list」 | 单独一次 `generateContent`，**不要**在 Live 里即兴选曲 |

**嵌入方式：**

- **模型**：`gemini-2.5-flash`（便宜、快、JSON mode 成熟）  
- **API**：`generateContent` + `responseSchema`（与 `packages/shared` 同 schema）  
- **输入**：mem0 摘要 + mood/scene + 20–30 候选 metadata + `played` / `remaining_slots`  
- **输出**（对齐 PDF 示例 session 名）：

```json
{
  "session_title": "Quiet Hours, vol. 3",
  "session_subtitle": "45 min · winds down",
  "arc": "wind_down",
  "tracklist": [
    { "id": "t12", "flow_position": 1, "reason": "…" }
  ]
}
```

**重排**：曲间 `mood_change` 时 **再调同一 Flow 函数**，只填 remaining 槽位 — Live 与 Flow **解耦**。

---

### 03 — OUR OWN MUSIC（离线曲库，运行时检索）

| PDF | Gemini 做什么 |
|-----|---------------|
| AI 生成 instrumental + mood/scene/energy tags | **离线**：可用 Gemini Flash **批量打标**（建库脚本） |
| 运行时从 Store 拉候选 | Step 1：**向量检索**，不一定每次调 LLM |

**嵌入方式（两阶段）：**

| 阶段 | 做法 | Gemini |
|------|------|--------|
| **建库** | 每首 mp3 有人工/半自动 tags | `generateContent`：「Given title/duration, output mood, scene, energy 1-5, genre」 |
| **建库** | 检索用 embedding | **`gemini-embedding-001`** 对 `"mood: calm scene: study energy: 2 genre: lo-fi"` 做 `embedContent`；写入 SQLite |
| **运行时** | 用户 query 嵌入 vs 库内向量 | 同模型 embed query → 余弦 Top-K（500 首足够快） |

Demo 可 **继续用现有 JSON embedding**；若统一 Gemini 栈，建库时一次性 re-embed 即可（换模型必须全量重建索引）。

**Gemini 不生音乐**；音乐生成仍在 Suno / Stable Audio 等离线 pipeline（与 API 无关）。

---

### 04 — A HOST（有人说话，无缝隙）

| PDF | Gemini 做什么 |
|-----|---------------|
| opening · segues · outro | **Gemini Live** native audio（STS），非 TTS 流水线 |
| no pause before/after music | 前端 **Web Audio crossfade** + Live `turnComplete` → phase 事件 |

**嵌入方式：**

- **模型（Demo 默认）**：**`gemini-3.1-flash-live-preview`**（Gemini 3.1 Flash Live Preview）  
  - 文档：[gemini-3.1-flash-live-preview](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview)  
  - 从 2.5 native-audio 迁移时改 model string；server 事件可能 **多 part 同包**  
- **API**：Fastify 内 Live WebSocket（`BidiGenerateContent`）；`responseModalities: ["AUDIO"]`  
- **人格**：`systemInstruction` 固定电台主持（方案 D：不写回 prompt，风格稳定）  
- **三类口播**（映射 PDF）：

| 类型 | 触发 | Live 上下文 |
|------|------|-------------|
| **Opening** | session 开始后首次 cue | session_title + 第一首 metadata + mem0 一句 |
| **Segue** | 每首曲间 cue | 「Up next: {title}, {energy}…」+ 可选 reason |
| **Outro** | 最后一首前 | 「Last track of {session_title}…」 |

**口播 cue 发送方式（3.1 必读）**：

- 会话进行中用 **`realtimeInput`**（文本或音频）— **不要**用 `clientContent` 发 segue（`clientContent` 仅用于 seed 初始历史）  
- 短 **scene direction** 写在 realtime 文本里，例如：`[segue, warm, 8s] Up next: …`

**与 PDF「press play once」的关系**：用户按一次 Play；曲间 **可选** 说话改 mood — Mid-term 叙事仍成立。

---

## 3.1 Flash Live Preview — Demo 约束

| 能力 | 3.1 状态 | 对 Auracle 的影响 |
|------|----------|-------------------|
| Native audio 口播 | ✅ | Host 支柱 |
| Function calling | ✅ **仅同步** | `mood_change` 重排时 Live **阻塞**直到 `toolResponse`；Flash 重排须 <2s |
| 输入/输出 transcription | ✅ | 字幕 + log |
| Thinking | ✅ | 可关或限 budget，避免曲间延迟 |
| `send_client_content` 持续 cue | ❌ 限 seed | 曲间 segue 走 **`realtimeInput`** |
| Async / NON-BLOCKING tools | ❌ | 不能依赖 2.5 的 `WHEN_IDLE` 异步重排 |
| Proactive audio | ❌ | 口播必须由 `cue_dj` / realtime 文本触发 |
| Affective dialog | ❌ | 风格靠 systemInstruction 文案 |

**`mood_change` 同步策略（替代 async tool）**：

1. Live 触发 tool → Fastify **同步**跑 Flow 重排（Flash，目标 P95 < 2s）  
2. 写 `session_events` + WS 推 `tracklist_updated`  
3. `sendToolResponse` 带 `{ ok: true, session_title, next_track }`  
4. Live 生成确认口播  

若重排超时，toolResponse 返回 `{ ok: false, reason: "timeout" }`，Live 口头道歉并保留原 plan。

**Server 事件**：同一 `serverContent` 可能同时含 audio chunk + transcript — 解析时 **遍历所有 parts**，避免漏字幕或漏 phase。

---

## 3. 一个 session 里 Gemini 被调用几次

| 时机 | API | 模型 | 目的 |
|------|-----|------|------|
| 创建 session | `generateContent` | Flash | session 名 + 8 首 Flow JSON |
| （可选）建库 | `embedContent` | embedding-001 | 仅离线 |
| 连接 Live | Live `setup` | **`gemini-3.1-flash-live-preview`** | systemInstruction + tools |
| 每段口播 | Live **`realtimeInput`** text cue | 同上 | opening / segue / outro |
| 曲间用户说话 | Live 音频上行 + VAD | 同上 | 对话 + **function call** |
| intent 重排 | `generateContent` | Flash | 仅 remaining 重排 |
| tool 返回后 | Live `toolResponse` | 同上 | DJ 口头确认「好，我们换轻一点的」 |
| skip/like | 无 LLM 或 Flash 抽取 | — | 写 mem0 + events |

原则：**选曲/排序永远走 Flash JSON**；**Live 只主持 + 听懂意图**，避免 Live 上下文被 30 条 metadata 撑爆。

---

## 4. Live API 深度嵌入：Tools 设计

与 PDF + P0 intent 对齐的 **function_declarations**（session setup 一次声明）：

```typescript
const tools = [
  {
    name: "skip_track",
    description: "User wants to skip to next track during between-tracks window",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "mood_change",
    description: "User wants different mood/energy for remaining tracks",
    parameters: {
      type: "object",
      properties: {
        mood: { type: "string" },
        energy_delta: { type: "string", enum: ["lighter", "heavier", "same"] },
      },
      required: ["mood"],
    },
  },
  {
    name: "pause_playback",
    description: "Pause or resume music",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["pause", "resume"] } },
    },
  },
  {
    name: "record_preference",
    description: "Save a taste or context fact for future sessions",
    parameters: {
      type: "object",
      properties: { fact: { type: "string" } },
    },
  },
];
```

### 执行策略（3.1 — 同步 function calling）

| Tool | 执行 | 说明 |
|------|------|------|
| `skip_track` | 同步 | 改指针 + WS 通知 web |
| `pause_playback` | 同步 | WS 通知 web |
| `record_preference` | 同步写 mem0 | 快速 `add()`，不阻塞久 |
| `mood_change` | **同步** Flow 重排 + `toolResponse` | 3.1 **无** async tool；重排必须够快 |

Flow 重排完成后再 `sendToolResponse`，Live 生成确认口播。

参考：[gemini-3.1-flash-live-preview 迁移说明](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview) · [Live API tools](https://ai.google.dev/gemini-api/docs/live-api/tools)

---

## 5. systemInstruction 模板（Host + 混合场）

```text
You are Auracle, a warm radio host — not a chatbot, not a playlist app.

SESSION RULES
- You are hosting "{session_title}" ({session_subtitle}).
- Tracks play in a fixed arc; you speak between songs (opening, segues, outro).
- The user may ONLY change the remaining playlist between tracks, not mid-song.
- If they speak during a song, acknowledge briefly; use tools only for clear intents.

VOICE
- Short spoken lines (5–15 seconds). Never read the full tracklist.
- Match the session arc: wind_down = calm; gym = energetic but not shouty.

TOOLS
- mood_change → triggers replan; tell the user you're adjusting what's next.
- skip_track, pause_playback, record_preference as documented.

CONTEXT (updated each segue)
{mem0_summary}
Now playing track {n}/{total}: "{title}" ({energy}/5, {tempo} BPM, {genre}).
Next: "{next_title}".
```

每次 `cue_dj` 可追加 **CLIENT 内容**，不必重发整段 systemInstruction。

---

## 6. 评估实验（FaAI）中的 Gemini

| 条件 | Gemini 差异 |
|------|-------------|
| A Baseline | Flash 简单选 8 首（无 energy 规则）；Live `systemInstruction` TOOLS 部分注明「mood_change 不重排，歌单固定」；`record_preference` noop |
| B Ablation | 完整 Flow Flash；Live 同上；无 mem0 注入 |
| C Full | Flow + mem0 + Live |

三条件 **同一 Live 壳**，盲测有效（见 `auracle_evaluation_design.md`）。

---

## 7. Gemini 明确不负责的边界

| 能力 | 负责方 |
|------|--------|
| 生成 instrumental mp3 | 离线音乐 pipeline（非 Gemini API） |
| 长期用户记忆存储 | mem0 OSS（进程内 + Qdrant） |
| 曲库文件 / tags 主数据 | SQLite |
| 音乐与 DJ 音量 fade | 浏览器 Web Audio |
| 实时音频传输 | Fastify WS（Demo） |

避免「什么都问 Gemini」— 论文叙事更清晰：**orchestrated AI radio**，不是 single LLM chatbot。

---

## 8. Demo 实现优先级（6 月 build 对齐 PDF 甘特）

| 周 | Gemini 相关交付 |
|----|-----------------|
| Jun W1–W2 | Flash Flow JSON + session_title；SQLite 检索 |
| Jun W2–W3 | Live setup + opening/segue + PCM WS |
| Jun W3 | tools: skip + mood_change + replan 闭环 |
| Jun W4 | mem0 读写 + like/skip → events |
| Jul W1 | 用户测试 + 三 condition 开关 |

**Jul 28 Final Demo 最小 Gemini 集**：Flash 编排 + Live host + mood 曲间打断 + mem0 一句个性化 — 覆盖 PDF 四支柱。

---

## 9. 环境变量（统一）

```bash
GEMINI_API_KEY=...
QDRANT_URL=http://localhost:6333
AURACLE_MEM0_HISTORY_DB=./data/mem0/history.db

GEMINI_FLOW_MODEL=gemini-2.5-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview   # Demo Live DJ
GEMINI_EMBED_MODEL=gemini-embedding-001           # 曲库建库 + mem0 embedder
```

验证 key 是否支持 Live：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | jq -r '.models[] | select(.supportedGenerationMethods[]?=="bidiGenerateContent") | .name'
```

---

## 10. 相关文档

- 协议：`auracle_api_protocol.md`  
- Flow prompt：`auracle_flow_prompt_design.md`  
- 架构：`auracle_architecture_storage.md`  
- 评估：`auracle_evaluation_design.md`  
- 参考协议实现：[rt_llm_proxy](https://github.com/thinkinbig/rt_llm_proxy) `internal/model/gemini`（非运行时依赖）
