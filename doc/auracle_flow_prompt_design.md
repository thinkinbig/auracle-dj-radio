# Auracle — Flow 编排 & Live DJ 设计记录

> 状态：已拍板（2026-06）

---

## 核心决策

1. **Step 1 检索 + Step 2 Flow JSON** 保留，但 Step 2 变为 **可重复调用的重排函数**（非一次性离线生成）
2. **Step 3 不再是离线 TTS**；曲间 DJ 口播由 **Gemini Live** 实时生成（Fastify WS 中继）
3. **不用一个大 prompt** 同时做检索排序 + 口播 + 记忆

---

## Session 状态机（混合场）

- 初始：`POST /sessions` → Step 1 + Step 2 → 完整 8 首 `tracklist`
- 播放：web 按 plan 播歌；曲间进入 **between_tracks** 窗口
- 打断（仅曲间，P0 intent）：Fastify 重排 **remaining** 槽位，已播不变
- DJ：Fastify 在曲间触发 Live（`cue_dj` 或自动）；`dj_turn_end` → web crossfade 进下一首

```
playing ──track end──▶ between_tracks ──Live DJ──▶ playing
                            │
                     user intent (曲间)
                            │
                            ▼
                     replan remaining (Step 2)
```

---

## Step 1 — 检索（不用 LLM）

- 输入：`mood` + `scene` + `energy_range`
- 实现：SQLite `tracks.embedding_json` + TS 余弦相似度
- 输出：20–30 首候选（id, energy, tempo, genre, mood）
- 重排时：排除 `played_track_ids`，在 remaining 槽位数内重新召回

---

## Step 2 — Flow 编排（Gemini Flash JSON）

**调用方**：Fastify `apps/api`  
**模型**：`gemini-3.1-flash-lite` + structured output  
**触发**：创建 session；以及 intent `mood_change` / `explicit_pick` / `full_replan`

### 能量曲线约束

能量 scale：**1–5**（整数，1 最轻，5 最强）。

| 阶段 | 曲目位置（全场 8 首） | 能量范围 | 说明 |
|------|----------------------|----------|------|
| Warm-up | 1–2 | 1 → 2 | 轻柔引入 |
| Build | 3–4 | 2 → 3 | 逐渐递进 |
| Peak | 5–6 | 3 → 5 | 最高强度 |
| Wind-down | 7–8 | 5 → 2 | 平滑收尾 |

**重排弧线（remaining 槽位）**：从 `last_played_energy` 平滑过渡到 Wind-down（2），不重跑完整弧线。

### 硬性规则

常量与 prose 单一来源：`packages/shared/src/arc.ts`（`MAX_TEMPO_JUMP_BPM`、`MAX_ENERGY_JUMP`、`buildHardRulesText()`）+ `flow-rules.ts`（`isAdjacentStepLegal`、`adjacentStepPenalty`）。`validate.ts`、heuristic、`gemini.ts` system instruction 均从此派生。

- 相邻曲 tempo 差 ≤ 15 BPM  
- 能量等级每次跳幅 ≤ 1 级  
- 连续两首不重复 genre  

### Plan 编排流水线（`flow/plan.ts`）

1. Flow 首次 `plan`  
2. `validateTracklist` — 失败则带 `repairHint`（violations 文本）**再调一次** Gemini  
3. 仍失败 → `repair.ts` 确定性换轨  
4. 返回最终 `violations`（可能非空，若候选池无解）

### Prompt 结构

```
System: You are a professional radio session curator…
        [能量曲线规则 + remaining 槽位说明]

User:   User profile: {mem0 memories}
        Session intent: mood=…, scene=…
        Already played: [{id, …}]
        Last played energy: {last_played_energy}   ← 重排时必填
        Remaining slots: {n}
        Candidate tracks: [{id, energy, tempo, genre, mood}, …]

Output: JSON — {session_title?, tracklist: [{id, flow_position, reason}]}
```

### 设计原则

1. **Structured output（JSON schema）**：可解析、可写 `session_events`  
2. **`reason` 字段**：便于评估审查与 ablation 分析  
3. **输入含已播列表**：保证重排不重复已播曲目  

每次重排写入 `session_events`：`event_type: replan`，payload 含 diff。

---

## Step 3 — Live DJ（Gemini Live，非 TTS）

| 项 | 说明 |
|----|------|
| 运行位置 | `apps/api` → Gemini Live WS（`@google/genai`） |
| 模型 | **`gemini-3.1-flash-live-preview`** |
| 内容 | 曲间介绍、转场、共情回应（闲聊） |
| 风格 | **固定 systemInstruction**（电台主持人格）+ mem0 事实 + 当前 track 上下文 |
| 结构化意图 | **function calling**：`skip_track`, `mood_change`, `pause_playback`, `record_preference`；闲聊由 Live 自然处理，无需 tool |
| 音频 | Live 输出 24k PCM → WS → web `djGain`；**不**经离线 TTS API |

### systemInstruction 要点（示意）

- 你是 Auracle 电台 DJ，简短、有温度  
- 用户只能在 **曲与曲之间** 改歌单；播歌中若用户说话，先简短回应，引导曲间再改  
- 收到 tool 结果后口头确认变化  
- 不要念完整个 tracklist  

### 曲间触发

- 曲终前 ~4s：web 可收 `phase` 或本地定时，music fade out  
- Fastify：曲间经 **`realtimeInput` 文本 cue** 注入 context（track N/8、mem0、next track）；见 3.1 Live API  

---

## Condition 差异（评估）

| 条件 | Step 2 Flow | mem0 | 跨 session skip 权重 | 打断重排 |
|------|-------------|------|----------------------|----------|
| A Baseline | ❌ 简单选曲 | ❌ | ❌ | skip/pause only，**不**重排 |
| B Ablation | ✅ | ❌ | ❌ | ✅ |
| C Full | ✅ | ✅ | ✅ | ✅ |

A/B/C 共用同一 Live UI 壳（见 `auracle_evaluation_design.md`、`auracle_personalization_plan.md`）。

---

## 待实现

- [ ] JSON schema 精确定义（`packages/shared`）  
- [ ] Baseline 选曲 prompt（无 Flow 规则）  
- [ ] Live systemInstruction 终稿 + tool 定义  
- [ ] Phase 2：`tracks.intro_offset_ms` 与 fade 对齐  

---

## 相关文档

- 架构：`auracle_architecture_storage.md`  
- API / WS 协议：`auracle_api_protocol.md`  
