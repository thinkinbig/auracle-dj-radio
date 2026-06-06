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

### 数据来源（重要变更）

- 指标基于 **`session_events` 重建的实际播放序列** `played_track_ids[]`，而非初始 plan  
- 打断与重排后每人歌单可能不同 — 这是预期行为  
- 元数据来自 SQLite `tracks`，无需 Spotify API  

---

## 实验设计：3 个对比条件（同壳）

| 条件 | 后端差异 | Live DJ |
|------|----------|---------|
| **A — Baseline** | 简单 LLM 选曲；**无 Flow 规则、无 mem0**；打断仅 skip/pause，**不触发重排** | ✅ |
| **B — Ablation** | **有 Flow 重排**；无 mem0 | ✅ |
| **C — Full** | Flow + **mem0** | ✅ |

**Condition B 的作用**：单独量化 Flow 编排贡献，与记忆模块解耦。

**与旧版差异**：C 条件由「Flow + 记忆 + DJ 文案 + TTS」改为「Flow + 记忆 + **Live DJ**」；无离线 TTS。

**三条件 Live 行为差异**：

| Tool | A | B | C |
|------|---|---|---|
| `mood_change` | 后端 noop；`systemInstruction` 注明歌单不可变 | ✅ 触发重排 | ✅ 触发重排 |
| `record_preference` | 后端 noop | 后端 noop | ✅ 写入 mem0 |
| `skip_track` / `pause_playback` | ✅ | ✅ | ✅ |

---

## 标准化打断脚本（推荐）

为保证 cross-condition 可比，实验员发放 **同一张小抄**，例如：

- **第 3 首曲间**：「来点更轻的」（触发 `mood_change` + 重排，B/C）  
- **第 5 首曲间**：「下一首」（触发 `skip`）  

A 条件：`mood_change` **不**触发重排（仅 DJ 口头回应或 noop）。

---

## 实验规模

- 参与者：**18 人**（6 种条件顺序各 3 人，Latin Square counterbalancing）  
- 每人 3 个 session（A/B/C），counterbalanced 顺序  
- 每个 session：约 8 首、~25 分钟；Desktop Chrome  
- 听完填问卷；客观指标从 `session_events` 自动计算  

---

## 日志要求

Fastify 必须持久化：

- `intent_detected`（含 transcript / tool）  
- `replan`（重排前后 tracklist diff）  
- `track_started` / `track_skipped`  
- `pause`  

可选：WS `transcript` 消息与 `session_events` 关联。

---

## 待深挖

- [ ] Arc Adherence 目标曲线精确定义  
- [ ] Likert 措辞终稿  
- [ ] 样本量与统计检验（t-test / ANOVA）  
- [ ] Baseline「简单选曲」prompt 与 Flow 的公平性（时长、曲数一致）  

---

## 相关文档

- 架构：`auracle_architecture_storage.md`  
- Flow / intent：`auracle_flow_prompt_design.md`  
