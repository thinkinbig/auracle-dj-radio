# Auracle — 产品 IA：Station & Sound

> 状态：**已拍板**（2026-06）  
> 关联：`auracle_structured_taste_design.md`（品位数据模型）、`auracle_personalization_plan.md`（mem0 / skip / per-user）

---

## 1. 三个名词的边界

| 概念 | 定义 | 用户心智 | v1 范围 |
|------|------|----------|---------|
| **Station** | 这一次听什么 — 单次 listening session | 调频、开播、on air | ✅ 已有（MoodPicker + Player） |
| **Sound** | 你是谁当听众 — **品位工程**（可编辑、可验证、影响选曲） | 建档案、调品位、看系统学到了什么 | 🚧 Epic #3（S1–S4） |
| ~~Studio~~ | 创作 / 混音 / 开播工具 | — | ❌ **明确不做** |

一句话：**Station 消费 Sound；Sound 不靠 DJ 随口记几句就完事。**

---

## 2. Sound — 品位工程三层

```
┌─────────────────────────────────────────────────┐
│  Sound — 品位工程                                │
├─────────────────────────────────────────────────┤
│  L1 结构化口味（显式）                            │
│      genre / artist / album / track prefer·avoid │
│      → auracle_structured_taste_design.md        │
├─────────────────────────────────────────────────┤
│  L2 行为信号（隐式）                              │
│      skip 能量权重、完播倾向                      │
│      → session_events + skipRateByEnergy (C)     │
├─────────────────────────────────────────────────┤
│  L3 语境记忆（自然语言）                          │
│      mem0 事实、「今晚想更爵士」                  │
│      → record_preference + 后端规则写入           │
└─────────────────────────────────────────────────┘
           │
           ▼ 读取
    Step1 检索降权 / Flow 排序 / replan
           ▲ 写入
    onboarding 表单 · 曲间对话 · skip/完播规则
```

**品位工程的核心价值**：L1 可复现、可评估；L2/L3 自动补全。Condition C 相对 B 的差异必须体现在 `played_track_ids` 上（见 `auracle_personalization_plan.md` §1）。

---

## 3. 入口与导航

### Landing（未登录）

| 元素 | 决策 |
|------|------|
| 顶栏 nav | **Listen** + **Sound** + Log in；**删除 Studio** |
| `#listen` | 锚到 hero（开播流程说明） |
| `#sound` | 锚到品位工程说明区块 |
| CTA | 「Start listening」→ 注册 / guest |

### App（已登录）

| 入口 | 行为 |
|------|------|
| 账号头像菜单 → **Sound** | 全屏 `SoundScreen`（品位工程主页） |
| 账号菜单 → Profile | 姓名 / 邮箱（不变） |
| 播放中品牌点击 | 「Set your station」→ 回到 mood/scene 选台 |

### Guest

- 可 **Listen**（demo station）
- **不** 做 Sound onboarding；不持久化品位（`auracle_anonymous` v1 不写 structured taste）

---

## 4. Sound 页信息架构（v1 → Epic #3）

### 三块内容

| 区块 | 内容 | 数据来源 | Slice |
|------|------|----------|-------|
| **Your taste** | genre chips + artist/album prefer·avoid 列表 | Taste profile API | S2, S3 |
| **Learned** | mem0 事实摘要（只读，带来源标签） | `GET /memory/recall` 或专用 summary | S2 |
| **Signals** | 行为洞察（例：「常在 energy 4–5 skip」） | `skipRateByEnergy` + events | S4 |

### 关键交互

| 动作 | 落点 |
|------|------|
| 注册后首次 | Sound onboarding（S3）：选 3–5 genre + 可选 artist |
| 听歌中 | DJ `record_preference` → Learned 新增 |
| skip 偏多 | L2 自动调权重 → Signals 可见 |
| 换库 | orphan 高亮 + 横幅（`structured_taste_design.md` §5） |

### 验收（Sound 闭环）

- [ ] 登录用户改 L1 口味 → 下次 station 的 `played_track_ids` 与改前可区分（S4）
- [ ] Guest 打开 Sound → 提示登录；无本地暂存
- [ ] Landing 无 Studio 链接；Sound 锚点可滚动

---

## 5. Station 文案规范

| 场景 | 文案 |
|------|------|
| 开播前 eyebrow | **Set your station** |
| 播放中返回 | **Set your station**（品牌点击 label） |
| 播放状态 | **On air** / **Now playing** |
| 账号概览（已登录） | **Your station**（当次 session 语境） |
| Guest | **Demo station** |
| 与 Sound 的关系 | 「Your sound shapes this station」 |

**不做（v1）**：多 station 并行、用户上传曲库、保存 preset 频道。

---

## 6. 与 Epic #3 的映射

| Slice | 产品交付 |
|-------|----------|
| **S1** Catalog backfill | 品位能绑到稳定 slug |
| **S2** Taste profile API | Sound 页后端 |
| **S3** Taste onboarding UI | Sound 首次建档 + Your taste 编辑 |
| **S4** Plan weighting | 品位工程闭环 — 改 Sound → 下次 station 歌单变 |

依赖：**S4 blocked by P0**（per-user 隔离，已实现）。

---

## 7. 相关文档

- 结构化口味数据模型：`auracle_structured_taste_design.md`
- 个性化路线图：`auracle_personalization_plan.md`
- Flow / replan：`auracle_flow_prompt_design.md`
- 父 Epic：[GitHub #3](https://github.com/thinkinbig/auracle-dj-radio/issues/3)
