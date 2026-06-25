# Auracle — 结构化口味设计决策

> 状态：**已拍板**（2026-06）  
> 父 Epic：[GitHub #3](https://github.com/thinkinbig/auracle-dj-radio/issues/3)  
> 前置：`auracle_personalization_plan.md`（mem0 / skip / per-user）、`docs/adr/0003-catalog-manifest-staged-cli.md`（曲库流水线）

---

## 1. 背景

当前个性化以 **mem0 自然语言事实** + **skip 能量权重** 为主，缺少与曲库实体对齐的结构化层（genre / artist / album / track）。曲库目标规模约 **~100 首**（非千曲平台）；流水线仍可 `catalog:compose → seed → embed` 重跑，但若口味绑定裸 `entityId`，用户偏好会在换库后失效。

**首发必须迁移现有曲库**：当前 manifest / SQLite 中每首歌已有 metadata（`title`, `lore`, `energy`, `tempo`, `genre`, `mood`, `scene`, `filePath`, `introOffsetMs`, 人声字段等）**全部保留**；结构化改造只做 **additive** 字段（`slug`, `genreSlug`, `catalogRevision`），**不**重写或丢弃既有 tag。

本文件固定架构决策与 sub-issue 粒度，供 Epic #3 拆分引用。

---

## 2. 决策总览

| # | 问题 | 决策 |
|---|------|------|
| 1 | Genre 是否独立 taxonomy | **是** — 用户表单与检索过滤只用受控 taxonomy；曲目 `genre` 字段映射到 taxonomy |
| 2 | Artist / Album 是否加 `slug` | **是** — 用户口味以 `slug` 为稳定键；运行时解析为当前 `id` |
| 3 | 换库后如何对待用户口味 | **静默 migrate + 仅失效项提示**；高比例失效或 major revision 时才强提示「刷新口味」 |

---

## 3. Genre：独立 taxonomy

### 决策

**采用独立 `genre_taxonomy`**，与用户表单、检索降权/加权、Flow 约束共用同一套 slug。曲目 manifest 里的 `genre` 字符串 **不直接** 暴露给用户选择。

### 理由

- 扩库后 LLM 打标会产生同义/近义 tag（`deep-house` / `deep house` / `house`），全量暴露会弄脏表单与统计。
- Taxonomy 相对稳定，**换库后用户 genre 偏好通常无需重填**。
- 检索与「连续两首不重复 genre」等规则应对 **taxonomy** 运算，避免子 tag 绕过多样性约束。

### 数据形状

```text
genre_taxonomy.json          # 受控词表（slug, label, optional parent_slug）
manifest.tracks[].genre      # 建库原始 tag（可随 LLM 变化）
manifest.tracks[].genreSlug  # seed 时写入：map(genre) → taxonomy slug
```

用户口味行：

```text
entityType: "genre"
entityId:   <taxonomy slug>   # 例如 "lo-fi"，不是 "lo-fi jazzhop variant"
```

### Taxonomy 来源（v1）

- 目标曲库 **~100 首** → taxonomy **从现有曲库归纳**，非大平台式 20–40 父类。
- 初版：**产品/曲库维护者人工定表**（约 **12–15 个 slug**）；以当前 manifest 已出现的 tag 为种子（如 `ambient`, `lo-fi`, `house`, `nu-disco`, `synthwave`…），合并近义项，预留少量空位供扩库。
- 建库流水线：`seed` 将每首 **保留原 `genre` 字符串**，并写入 `genreSlug`；无法映射的 tag 记入 seed 报告，不阻塞入库。
- **不用** LLM 无监督聚类定 taxonomy（v1 为 **AFK 实现 ticket**，非独立 design HITL）；新 tag 出现时人工补 mapping 行即可。

### 与 mem0 的分工

- 结构化层：`genreSlug` + `prefer` / `avoid`（确定性）。
- mem0：「今天想听更爵士一点的」等语境句；不替代 taxonomy。

---

## 4. Artist / Album：稳定 `slug`

### 决策

在 `manifest.json` 的 **artist** 与 **album** 上增加 **`slug`** 字段。用户结构化口味 **持久化键为 `slug`**；`artistId` / `albumId` 仅作运行时解析结果。

Track 级口味仍用 **`trackId`**（粒度最细、最易因换库失效，见 §5 失效策略）。

### Slug 规则

| 实体 | 示例 `id`（可随 compose 变） | 示例 `slug`（跨 revision 稳定） |
|------|------------------------------|--------------------------------|
| Artist | `a-lana-delay` | `lana-del-delay` |
| Album | `alb-lana-delay-midnight` | `lana-del-delay/born-to-delay` |

约定：

- `slug` 全小写、kebab-case；album slug 建议 `{artist-slug}/{album-kebab-title}` 保证全局唯一。
- **Compose 生成新艺人/专辑时必须带 slug**；扩库时禁止修改已有 slug（只可 deprecated）。
- 用户口味表存 `(entityType, entitySlug)`；读偏好时 join 当前 manifest/SQLite 解析为 `id`。

### Track 与 slug 的关系

- `prefer artist slug` → 该艺人下所有曲目加权（除非 track 级 `avoid` 覆盖）。
- `prefer album slug` → 该专辑下曲目加权。
- `trackId` 不引入 slug：换库后靠 migrate 或标记 orphan（§5）。

### 理由

`catalog:compose` 全量重写时 `a-lana-delay` 类 id 可能变化；slug 对齐用户心智（艺人名/专辑名），便于 `taste:migrate` 脚本做 fuzzy 回退。

---

## 5. 换库：`catalogRevision` 与口味失效策略

### 决策

**默认：静默 migrate + 仅失效项提示。**  
不在每次 `catalogRevision` 变化时打断用户做全量「刷新口味」 onboarding。

### `catalogRevision`

- 每次 `export-catalog` + `seed` 成功后 bump。
- 值：**manifest 内容 hash**（`artists` + `albums` + `tracks` 稳定序列化后 SHA-256 前 12 位），或显式写入 `data/catalog/.revision`。
- 用户口味档案记录 `taste.catalog_revision_at_save`（写入时 revision）与解析时当前 revision。

### 换库流水线（目标）

```text
manifest 更新 → export-catalog → seed → bump catalogRevision
                                      → taste:migrate (offline)
```

`taste:migrate`：

1. **Genre（taxonomy slug）**：无需 migrate（决策 §3）。
2. **Artist / Album**：按 `slug` 解析新 `id`；slug 缺失或 deprecated → 标 `orphaned`。
3. **Track**：按 `trackId` 校验；不存在则尝试 `(albumSlug, title)` 模糊匹配；失败 → `orphaned`。
4. **不删除** mem0 事实；结构化 orphan 不计入 plan 加权。

### 用户可见行为

| 场景 | UX |
|------|-----|
| 常规扩库（新增曲目/专辑，slug 不变） | **无弹窗**；新内容自动进入搜索索引 |
| 部分 track 口味失效 | 设置页「我的口味」**仅高亮失效项**（灰显 +「已从曲库移除」+ 移除按钮） |
| 失效比例 **> 30%**（按条数，track 权重×2 计入分母） | 登录后 **一次性横幅**：「曲库已大幅更新，请检查口味」→ 跳转设置页（**非**强制全屏 onboarding） |
| **Major revision**（manifest 设 `catalogBreaking: true` 或 major 版本号递增） | 同上横幅 + 评估脚本要求实验员核对被试口味档案 |

**明确不做：**

- revision 一变就强制全量重填 onboarding。
- 换库自动清空 mem0 或结构化口味全表。

### 评估 / QA

- 评估被试口味应用 **脚本 + API** 写入（可复现 slug / taxonomy）。
- QA 账号在 `catalogBreaking` 发布后跑：`taste:migrate` 报告 + 设置页 orphan 截图。

---

## 6. 用户口味行（实现参考）

与 Epic #3 对齐的目标形状：

```ts
interface TastePreference {
  entityType: "genre" | "artist" | "album" | "track";
  /** genre → taxonomy slug; artist/album → slug; track → trackId */
  entityId: string;
  polarity: "prefer" | "avoid";
  strength?: 1 | 2 | 3;
  source: "onboarding" | "search" | "session";
  status?: "active" | "orphaned";  // 读时填充，一般不持久化
}
```

冲突规则（表单 + plan 共用）：

- 具体优先：`track` > `album` > `artist` > `genre`。
- `avoid artist` 隐式 avoid 其下 album/track，除非子级有显式 `prefer track` 覆盖。

---

## 7. 现有曲库 metadata 迁移（首发阻塞）

结构化改造 **不改变** 既有曲目身份与展示字段。

### 必须保留（每首 track）

`id`, `albumId`, `title`, `energy`, `tempo`, `genre`, `mood`, `scene`, `filePath`, `introOffsetMs`, `lore`, `instrumental`, `lyrics`（若有）；artist/album 侧 `persona`, `concept`, 封面/照片路径等一并保留。

### 仅 additive 新增

| 层级 | 新字段 | 说明 |
|------|--------|------|
| `artists[]` | `slug` | 由现有 `id`/name 推导，**现有 5 艺人 id 不变** |
| `albums[]` | `slug` | `{artist-slug}/{album-kebab}` |
| `tracks[]` | `genreSlug` | 映射自现有 `genre`；**原 `genre` 不删** |
| 仓库 | `catalogRevision` | 每次 `export-catalog` + `seed` 成功后 bump（`data/catalog/.revision`） |

### 验收（S1 已完成，Demo 30 首）

- [x] 迁移前后 **track `id` 集合一致**（t01–t16 保留；扩库仅 **新增** id，不 rename 已有 id）— 当前 **30 首**（t01–t30）
- [x] `export-catalog` / `tracks.json` / SQLite seed 字段 **超集** 于迁移前（无字段丢失）
- [x] 每首曲目有非空 `genreSlug` 与可解析的 artist/album `slug`（写在 manifest；join 时对缺省项 fallback `slugify()`）
- [x] 曲库编辑流程：`manifest.json` → `pnpm --filter @auracle/catalog export-catalog` → `pnpm --filter @auracle/music-engine seed`

---

## 8. Sub-issue 粒度（Epic #3，已拍板）

相对原 7 条拆分，**~100 首规模下 7 条过碎**；合并为 **4 条 tracer bullet**。  
**不**把 plan weighting 拆成 Step1 / Flow 两条（同一 slice 内端到端验证歌单变化即可）。

| # | Title | Issue | Blocked by |
|---|--------|-------|------------|
| **S1** | Catalog taxonomy, slugs, revision | [#4](https://github.com/thinkinbig/auracle-dj-radio/issues/4) | — |
| **S2** | Taste profile API + mem0 summary | [#5](https://github.com/thinkinbig/auracle-dj-radio/issues/5) | #4 |
| **S3** | Taste onboarding UI | [#6](https://github.com/thinkinbig/auracle-dj-radio/issues/6) | #5 |
| **S4** | Plan weighting + taste migrate UX | [#7](https://github.com/thinkinbig/auracle-dj-radio/issues/7) | #5, P0 |

**依赖顺序**：`S1 → S2 → S3`；`S4` 与 S3 可并行，但 **评估前 S4 必须等 P0**（`auracle_personalization_plan.md` §3）。

### 五项拍板结论

| 问题 | 决策 |
|------|------|
| 7 条是否合适？ | **否** → **4 条**（上表） |
| #5 拆 Step1 / Flow？ | **否** — 合并在 **S4** |
| Genre taxonomy 谁定？ | **产品从现有曲库 tag 归纳 ~12–15 slug**；AFK 实现，非 LLM 聚类 HITL |
| `slug` 何时进 manifest？ | **直接写在 `manifest.json`**（艺人/专辑 `slug`、曲目 `genreSlug`）；无独立 backfill 步骤。`taste:migrate` 仅服务换库 remap |
| P0 阻塞？ | **S4 显式 blocked by P0**（per-user session / mem0 隔离） |
| 匿名用户？ | **登录才持久化口味**；`auracle_anonymous` **不**做 onboarding / 本地暂存（v1 减 scope） |

---

## 9. 产品 IA（Sound 品位工程）

结构化口味是 **Sound** 产品的 L1 层；完整入口、文案与 Station 边界见 **`auracle_sound_ia.md`**。

| Sound 区块 | 本文件对应 |
|------------|------------|
| Your taste（L1） | §3–§7 `TastePreference`、taxonomy、slug |
| Learned（L3） | mem0（`auracle_memory_decision.md`） |
| Signals（L2） | skip / events（`auracle_personalization_plan.md`） |

Epic #3 实现切片 S1–S4 交付 Sound 页；**Studio 明确不做**。

---

## 10. 相关文档

- 产品 IA（Station / Sound）：`auracle_sound_ia.md`
- 个性化路线图：`auracle_personalization_plan.md`
- 曲库流水线：`docs/adr/0003-catalog-manifest-staged-cli.md`
- Embedding 阶段：`docs/adr/0002-phased-catalog-embedding.md`
- 父 Epic：[GitHub #3](https://github.com/thinkinbig/auracle-dj-radio/issues/3)

---

## 附录 A：Taste API（S2 实现，[#5](https://github.com/thinkinbig/auracle-dj-radio/issues/5)）

memory-service（:3020）持久化 per-user 结构化口味，并在保存时向 mem0 双写一条人读摘要。
**必须登录**（`Authorization: Bearer <token>`）；匿名身份不持久化口味（§8）。
存储：SQLite `taste_profile`（user_id 主键 + `catalog_revision_at_save` + `free_text`）与
归一化 `taste_prefs(user_id, entity_type, entity_id, polarity, strength, source)`。

### `GET /users/me/taste`

读取当前用户口味，按 **live catalog（S1）** 解析 slug → 当前 `id`，对失效项填 `status: "orphaned"`（不持久化）。

**200**

```json
{
  "preferences": [
    { "entityType": "artist", "entityId": "lana-del-delay", "polarity": "prefer",
      "source": "onboarding", "status": "active", "resolvedId": "a-lana-delay" },
    { "entityType": "track", "entityId": "t99", "polarity": "avoid",
      "source": "session", "status": "orphaned" }
  ],
  "freeText": "more jazzy today",
  "catalogRevisionAtSave": "f6d80daa2a0f7ab3",
  "catalogRevision": "f6d80daa2a0f7ab3"
}
```

`401` 未认证。

### `PUT /users/me/taste`

整档替换。对每个 `entityId` 按 live catalog 校验（genre→taxonomy slug、artist/album→slug、track→trackId）；
任一不可解析 → `400`，不落库。保存成功后向 mem0 `add()` 一条摘要（per `user_id`，§3 mem0 层）。

**Request**

```json
{
  "preferences": [
    { "entityType": "genre", "entityId": "lo-fi", "polarity": "prefer", "source": "onboarding", "strength": 2 }
  ],
  "freeText": "more jazzy today"
}
```

**200** — 同 `GET` 形状（已解析），`catalogRevisionAtSave` = 当前 revision。

**400**

```json
{ "error": "unknown taste entities",
  "invalid": [{ "entityType": "artist", "entityId": "no-such-artist" }] }
```

字段形状非法（未知 `entityType`/`polarity`/`source`、空 `entityId`、`strength` ∉ {1,2,3}）同样 `400`。`401` 未认证。

---

## 附录 B：Plan weighting + migrate（S4 实现，[#7](https://github.com/thinkinbig/auracle-dj-radio/issues/7)）

结构化口味在 **Condition C** 下进入歌单规划（编排层加载 → music-engine 检索加权），不止 DJ 口播。P0（per-user session / mem0 隔离）为前置，已实现。

### `POST /taste/weights`（memory-service，内部）

服务间调用（同 `/memory/recall`，按 `user_id`，无 Bearer）。返回该用户 **active**（可解析）结构化偏好供加权；orphaned 不返回。

```json
// req: { "user_id": "..." }
// 200: { "preferences": [ { "entityType": "genre", "entityId": "house", "polarity": "avoid", "status": "active", ... } ] }
```

### 检索加权（music-engine `retrieve.ts`）

每个候选曲按 **最具体** 匹配偏好（§6：track > album > artist > genre）得到一个分数乘子，叠加在 cosine + skip-energy 之上：

- `prefer` → `× (1 + 0.3·strength)`；`avoid` → `× max(0.05, 1 − 0.3·strength)`（strength 默认 2）。
- 偏好按 **slug**（`genreSlug`/`artistSlug`/`albumSlug`）与 `trackId` 匹配 `TrackRow`，换库稳定。
- 编排层（agent-harness）在 `createSession` 载入 `taste` 存入 `SessionState`，初始 plan 与 replan 复用同一份；A/B 不加权。

### `pnpm --filter @auracle/memory-service taste:migrate [--prune]`

离线脚本（§5）：按当前 catalog 重解析每用户偏好；slug 型 artist/album 随 id 变更存活，已删除 track pin 标 `orphaned`。`--prune` 删除 orphaned 行；幂等（二次运行 0 orphaned）。不触碰 mem0。

> 设置页：orphaned 项灰显 + 移除（S3）；失效占比 > 30%（track 权重×2）时显示一次性横幅（S4）。
