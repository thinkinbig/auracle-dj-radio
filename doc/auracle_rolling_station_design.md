# Auracle — Rolling Station & on-air queue surgery

> 状态：**设计拍板**（2026-06-27）  
> 父 Epic：[GitHub #19](https://github.com/thinkinbig/auracle-dj-radio/issues/19)  
> 关联：`auracle_flow_prompt_design.md`、`auracle_sound_ia.md`、`docs/adr/0004-end-of-track-talk-window.md`

---

## 1. 问题陈述

当前 Station 存在三个产品缺口：

| 缺口 | 现象 | 根因 |
|------|------|------|
| **不像电台** | 固定 8 首播完 → `idle`，回到 onboarding | 无滚动续播；末曲无 extend |
| **重排无感** | `mood_change` → 全量 replan remaining，用户听不出差别 | 曲库小、replan 弧线锁 wind-down、硬约束压缩换歌空间 |
| **反馈不可见** | DJ 说「在调下一批」，queue UI 几乎不变 | 无 before/after diff |

`replan` 作为引擎能力保留，但**不应再是 mid-session 的默认路径**。个性化主战场留在 **开场 `createPlan`（Sound L1/L2/L3）**；空中只做 **局部、即时、可见** 的调整。

---

## 2. 核心决策

### 2.1 Station 模型：滚动窗口，非固定 session

```
[已播 …] [当前] [remaining ≤ 2] ──后台 extend──▶ append 下一批（默认 4 首）
```

- Session 持续 on air，直到用户主动结束（返回 setup / 关页）。
- `extend` **只增不减**：不改当前曲与已排队列（去重冲突除外）。
- 与 `replan`（replace remaining）语义分离。

### 2.2 On-air 调整三档

| 档位 | 触发 | 行为 | 是否调 Flow LLM |
|------|------|------|-----------------|
| **nudge** | `mood_change` 默认；`energy_delta` lighter/heavier | 只改下 **1–2** 槽 | 是（`remainingSlots ≤ 2`） |
| **steer** | mood 文本显著变化（非同义词微调） | 重填 remaining **后 50%** | 是 |
| **full** | UI **Regenerate**；显式「换一批」 | 现有全量 `replaceRemaining` | 是 |

**默认路径**：nudge。全量 replan 不再绑在每次曲间随口 mood 上。

### 2.3 确定性信号优先于等 DJ 调 tool

| 信号 | 动作 |
|------|------|
| 快速 skip（<60s） | 确定性 swap `remaining[0]`（不调 Flow） |
| Queue dislike | 未来：swap 下一首 |
| `record_preference` | mem0 写入；**跨 session** 影响下次 plan；可选 nudge 下一首 |

### 2.4 可见性

任何 queue 变更 payload 携带 `changed_ids` / `before_remaining_ids`；UI 高亮 30s + brief copy（「接下来 2 首已更新」）。

### 2.5 实验 / 个性化

- Condition C vs B：主指标改为 **开场 plan 差异** + **skip 后下一首变化** + **nudge 后 Δenergy**。
- 全量 replan 保留给 Regenerate / steer，不作为默认 mood 路径。

---

## 3. 与现有架构的关系

```
Sound (L1/L2/L3) ──读取──▶ createPlan (mode: full)     ← 个性化主战场
                              │
Station on-air ──────────────┼── extend (append)
                             ├── nudge / steer (partial replan)
                             ├── skip-swap (deterministic)
                             └── full replan (Regenerate only)
```

- **Playhead**：浏览器仍单写；harness 镜像用于 extend/replan 触发（`CONTEXT.md`）。
- **曲间 break**（ADR-0004）：非末曲仍开 window；末曲靠 extend 避免真·末曲。
- **Condition A**：所有 replan/extend 调整仍为 noop（ablation）。

---

## 4. API 草图

### 4.1 music-engine `POST /plan_tracklist`

| mode | 语义 |
|------|------|
| `full` | 初始 8 首弧（不变） |
| `replan` | replace remaining（Regenerate / steer） |
| `extend` | append N 首，exclude played + current |

`extend` body 示例：

```json
{
  "mode": "extend",
  "intent": { "mood": "calm", "scene": "study", "duration_min": 25 },
  "extend": { "playedIds": ["t01", "…"], "appendSlots": 4 }
}
```

### 4.2 harness 触发 extend

- 在 `markNowPlaying` 后：`remaining.length ≤ EXTEND_THRESHOLD`（默认 2）→ 后台 `extendQueue`。
- Debounce：`extendPending` 旗标，避免重复风暴。

### 4.3 `tracklist_updated` 扩展字段

```json
{
  "type": "tracklist_updated",
  "remaining": […],
  "changed_ids": ["t12", "t08"],
  "before_remaining_ids": ["t05", "t11"],
  "session_title": "…"
}
```

`extend` 可用同一 event，或新 `tracklist_extended`（实现时二选一，优先复用 + `op: "append"` 字段）。

---

## 5. 子 issue 映射

| Slice | Issue | 标题 | 优先级 |
|-------|-------|------|--------|
| Epic | [#19](https://github.com/thinkinbig/auracle-dj-radio/issues/19) | Rolling Station + on-air queue surgery | — |
| E1 | [#20](https://github.com/thinkinbig/auracle-dj-radio/issues/20) | Rolling extend 续播 | P0 |
| E2 | [#22](https://github.com/thinkinbig/auracle-dj-radio/issues/22) | mood_change 默认 nudge | P1 |
| E3 | [#23](https://github.com/thinkinbig/auracle-dj-radio/issues/23) | Queue diff 可视化 | P1 |
| E4 | [#21](https://github.com/thinkinbig/auracle-dj-radio/issues/21) | Skip 驱动下一首换轨 | P1 |
| E5 | [#25](https://github.com/thinkinbig/auracle-dj-radio/issues/25) | Intent 分档 steer / full | P2 |
| E6 | [#24](https://github.com/thinkinbig/auracle-dj-radio/issues/24) | 末曲 / idle 体验收尾 | P2 |

实现顺序建议：**E1 → E4 → E2 → E3 → E5 → E6**

---

## 6. 不在范围

- Catalog 扩容（但 [#12](https://github.com/thinkinbig/auracle-dj-radio/issues/12) 检索质量影响 extend/nudge 多样性）
- Sound 页 L1 编辑（Epic #3 已完成）
- Studio
- 末曲 talk break（默认不开；靠 extend）

---

## 7. HITL 待决（E5）

- [ ] steer 触发：纯规则（mood 编辑距离 / 关键词）vs LLM 分类
- [ ] steer 比例：50% remaining vs 固定 3 首
- [ ] extend 批次：4 首 vs 与 `FULL_SESSION_LENGTH/2` 对齐

---

## 8. 讨论记录

**2026-06-27** — 确认 replan 产品价值低：触发面窄、曲库 ~40 首、replan 弧线锁 wind-down、UI 无 diff。决议：Rolling Station + nudge 默认 + extend 续播；全量 replan 降级为显式 Regenerate。
