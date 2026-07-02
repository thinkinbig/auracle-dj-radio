# Auracle — 评估体系设计记录

> 状态：已更新（2026-06）— 适配实时 Live + 曲间打断

---

## 评估框架：主客观双轨 + 3 条件对比

---

## 主观评估 — 用户问卷（1–5 分 Likert scale）

| 维度 | 问题 |
|------|------|
| Relevance 相关性 | 曲子符合我的心情和场景吗？ |
| Coherence 连贯性 | 整个 session 听起来像被精心设计过吗？ |
| DJ Experience DJ 感 | 有电台主持的沉浸感吗？ |
| Personalization 个性化 | 感觉是专门为我选的吗？ |

**盲测**：A/B/C 使用 **同一套 Web + Live UI**，被试不知道条件代号；界面不暴露「ChatGPT / Auracle」标签。

---

## 客观评估 — Audio Feature 分析

| 指标 | 计算方式 | 含义 |
|------|----------|------|
| Energy Smoothness | σ(ΔEnergy) | 相邻曲子能量差值标准差，越小越平滑 |
| Tempo Smoothness | σ(ΔBPM) | 相邻曲子 BPM 差值标准差 |
| Arc Adherence | MSE vs 目标曲线 | 实际能量曲线与热身→高潮→收尾目标的偏差 |
| Genre Diversity | entropy | session 内曲风多样性 |
| **C vs B 歌单 Jaccard** | \|played_C ∩ played_B\| / \|played_C ∪ played_B\| | 同被试两条件实际播放序列重叠度（个性化：C 应更低或 replan 后能量偏移更明显） |
| **C replan Δenergy** | mean(energy_remaining_after) − before | 仅 C：第 3 首 mood 打断后剩余曲平均能量变化 |

### 数据来源（重要变更）

- 指标基于 **`session_events` 重建的实际播放序列** `played_track_ids[]`，而非初始 plan  
- 打断与重排后每人歌单可能不同 — 这是预期行为  
- 元数据来自 SQLite `tracks`，无需 Spotify API  

---

## 实验设计：3 个对比条件（同壳）

| 条件 | 后端差异 | Live DJ |
|------|----------|---------|
| **A — Baseline** | 简单 LLM 选曲；**无 Flow 规则**；**无 mem0**；**无跨 session skip 权重**；打断仅 skip/pause，**不触发重排** | ✅ |
| **B — Ablation** | **有 Flow 重排**（session 内）；**无 mem0**；**无跨 session skip 权重** | ✅ |
| **C — Full** | Flow + **mem0** + **跨 session skip 权重**（`skipRateByEnergy`） | ✅ |

**Condition B 的作用**：单独量化 Flow 编排贡献，与记忆模块及跨 session 行为偏置解耦。

**个性化信号按条件**（见 `auracle_personalization_plan.md` §1）：

| 信号 | A | B | C |
|------|---|---|---|
| mem0 读/写 | ❌ | ❌ | ✅ |
| 跨 session skip 权重（检索降权） | ❌ | ❌ | ✅ |
| session 内 `mood_change` → replan | ❌ | ✅ | ✅ |

**用户隔离（评估）**：每名被试 **独立登录账号**；mem0 与 skip 聚合均 **per `user_id`**。Demo 无 token 时 fallback `auracle_anonymous`（评估禁止使用）。

**与旧版差异**：C 条件由「Flow + 记忆 + DJ 文案 + TTS」改为「Flow + 记忆 + **Live DJ**」；无离线 TTS。

**18 人研究内的 C 效应说明**：每人仅 **1 次** C session（与 A、B 各 1 次配对）。主对比为 **同被试 C vs B**（初始 plan + replan 后歌单）。跨 session mem0 增益主要在 **同账号多次收听**（QA smoke、回访用户）；正式实验不假设被试有第二次 C。

**三条件 Live 行为差异**：

| Tool | A | B | C |
|------|---|---|---|
| `mood_change` | 后端 noop；`systemInstruction` 注明歌单不可变 | ✅ 触发重排 | ✅ 触发重排 |
| `record_preference` | 后端 noop | 后端 noop | ✅ 写入 mem0 |
| `skip_track` / `pause_playback` | ✅（记 events） | ✅（记 events） | ✅（记 events；C 且快速 skip 可写 mem0） |

---

## 标准化打断脚本（推荐）

为保证 cross-condition 可比，实验员发放 **同一张小抄**，例如：

- **第 3 首曲间**：「来点更轻的」（触发 `mood_change` + 重排，B/C）  
- **第 5 首曲间**：「下一首」（触发 `skip`）  

A 条件：`mood_change` **不**触发重排（仅 DJ 口头回应或 noop）。

**反馈回路（like / dislike / regenerate）utterance sheet 与打分表**：见
[`auracle_feedback_eval_runbook.md`](auracle_feedback_eval_runbook.md)（#66–#69 HITL 运行手册；离线打分用 `scripts/feedback-eval.mjs`）。

---

## 实验规模

- 参与者：**18 人**（6 种条件顺序各 3 人，Latin Square counterbalancing）  
- 每人 3 个 session（A/B/C 各一次），counterbalanced 顺序  
- **评估前**：为每人预注册独立账号；禁止共用浏览器 profile 或 `auracle_anonymous`  
- 每个 session：约 8 首、~25 分钟；Desktop Chrome  
- 听完填问卷；客观指标从 `session_events` 自动计算  

### 实验 SOP（评估部署）

1. **账号**：实验员为每名被试预注册独立账号（email + 密码记录在分配表）；被试仅使用自己的凭据登录。  
2. **部署**：构建 web 时设置 `VITE_EVAL_MODE=true`（隐藏「Try demo」/「Continue as guest」；onboarding 显示登录提示）。  
3. **浏览器**：每名被试使用 **独立 Chrome profile**（或独立机器）；session 间清除站点数据或换 profile，避免 token / localStorage 串台。  
4. **禁止**：guest 模式、`auracle_anonymous` 会话、多人共用同一浏览器 profile。  
5. **校验**：`POST /sessions` 必须带有效 Bearer；过期 token 返回 **401**（前端清 token 并退回登录），不得静默降为 anonymous。  
6. **条件分配**：由实验员在 harness 侧注入 `condition`（A/B/C）；被试界面不暴露条件代号。

---

## 日志要求

`memory-service` 的 `session_events`（SQLite）必须持久化，且 **`session_created` payload 含 `user_id`、`condition`、`intent`**：

| event_type | 说明 |
|------------|------|
| `session_created` | `intent`, `condition`, `tracklist`；响应体含 `mem0_context` 快照 |
| `replan` | mood 打断后重排；`before` / `after` track id 列表 |
| `replan_failed` | 重排或 Lane-3 push 失败 |
| `skip_latency` | skip 闭环耗时；payload 含 `energy` |
| `record_preference` | C only；`fact` |
| `pause_playback` | `action`: pause / resume |
| `change_host_mode` | UI 或 tool 切换主持风格 |
| `playlist_feedback` | like / dislike / regenerate；`track_id`, `remaining_ids`, `source`（`dj_tool` / `ui`） |
| `playlist_regenerate_requested` | regenerate 重排；`before` / `after` track id 列表 |

重建 `played_track_ids[]`：按 `now_playing` / playhead 镜像逻辑或专用 play 事件（以实现为准），**不用**初始 plan。

可选：Go side-channel `transcript` 与 `session_id` 离线 join。

**P0 验收与实验 SOP**：见 `auracle_personalization_plan.md` §3–§4。

### 反馈回路自动化测试 ↔ 评估项 (#66–#70)

#70 将 #66–#69 的反馈回路（voice / DJ tool only）固化为自动化回归测试；#68/#69 的实现（session taste + nudge replan + `POST /taste/session-feedback`）随 PR #80 落地，原 telemetry-only 守卫与 `it.todo` 已翻转为闭环测试。

| 评估项 | 测试 (文件 · 名称) | 状态 |
|--------|-------------------|------|
| #66 telemetry 捕获 | `agent-harness.test.ts` · "records playlist_feedback from the UI playlist-feedback route" / "...from a DJ tool call and surfaces it to the client" | ✅ |
| #66 regenerate 事件 | `agent-harness.test.ts` · "regenerates the remaining queue from a DJ playlist_feedback tool call" / "regenerates the remaining queue on request"（UI 走 `POST /playlist-feedback`） | ✅ |
| #68 in-session shift + #69 持久化（C, 登录） | `agent-harness.test.ts` · "dislike nudges the upcoming queue and persists session taste for a logged-in C user (#68/#69)" | ✅ |
| #68 B/匿名 nudge（不持久化）+ 去重 | `agent-harness.test.ts` · "like nudges without persisting for an anonymous B session; duplicate feedback derives once (#68)" | ✅ |
| #68 条件 A noop | `agent-harness.test.ts` · "condition A: dislike derives taste telemetry but leaves the fixed playlist alone" | ✅ |
| #69 plan 权重读取 session taste | `taste-weighting.test.ts` · "downranks an artist avoided via session feedback (source: session)" / "treats session-sourced prefer/avoid symmetrically with onboarding source" | ✅ |
| #69 feedback→taste consumer + mem0 镜像 | `memory-service.test.ts` · "derives and persists session-sourced prefs (+ mem0 mirror) from a dislike (#69)" | ✅ |
| #69 幂等/强化/翻转 | `memory-service.test.ts` · "keeps one row per entity: repeats strengthen (capped), a flip resets polarity (#69)" | ✅ |
| #69 匿名/persist-off 隔离 | `memory-service.test.ts` · "never persists feedback for the anonymous identity or when persist is off (#69)" | ✅ |
| #66 离线 timeline 读取 | `memory-service.test.ts` · "reads events back for offline eval scripts via /events/query (#66)" | ✅ |
| #67 工具 fidelity | HITL：`auracle_feedback_eval_runbook.md`（utterance sheet + 打分表），评分辅助 `scripts/feedback-eval.mjs` | 手动 |

`reducer` 同步（web，DJ tool path）：`playbackReducer.test.ts` · "records playlist feedback without mutating the queue (server owns the tracklist)"。

---

## 待深挖

- [ ] Arc Adherence 目标曲线精确定义  
- [ ] Likert 措辞终稿  
- [ ] 样本量与统计检验（t-test / ANOVA；**配对** C vs B）  
- [ ] Baseline「简单选曲」prompt 与 Flow 的公平性（时长、曲数一致）  
- [x] 个性化条件边界（skip 权重 / mem0 / per-user）→ `auracle_personalization_plan.md`  
- [x] C vs B 歌单 Jaccard 与 replan Δenergy 自动化脚本 → `scripts/feedback-eval.mjs`（`--compare` / `--session`，基于 `POST /events/query`）  

---

## 个性化实施 & 实验 Checklist

Grill 收束后的 **P0/P1 工程计划**、**18 人研究操作清单**、**C vs B 客观核对项**：

→ [`auracle_personalization_plan.md`](auracle_personalization_plan.md)

---

## 相关文档

- 架构：`auracle_architecture_storage.md`  
- Flow / intent：`auracle_flow_prompt_design.md`  
- 个性化计划：`auracle_personalization_plan.md`  
