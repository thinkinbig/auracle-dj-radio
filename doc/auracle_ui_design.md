# Auracle — Web UI 设计规范

> Phase 1：**Desktop Chrome** 单列播放器界面。参考 mock：暗色 DJ 舞台 + 白色内容卡片 + 实时字幕。  
> 音频行为见 `auracle_pwa_audio_notes.md`；数据绑定见 `auracle_api_protocol.md`。

---

## 设计目标

Auracle 的 UI 不是通用音乐播放器，而是 **「AI 电台 DJ 在说话」** 的可视化：

| 用户需要感知 | UI 表达 |
|--------------|---------|
| DJ 正在/即将说话 | 暗色舞台区 + 绿色 Live 状态 + 大波形 |
| 当前在播什么歌 | 白色卡片标题 / 艺术家 / 进度 |
| DJ 说了什么 | 字幕区滚动 + 当前句高亮 |
| 整体仍在播放 | 底部 mini 控制条 + 时间 |

**辨识度公式**：高对比明暗分区 + 波形主线 + 点阵复古点缀 + 绿色仅标记 Live + 字幕三层状态。

---

## 参考 mock 结构

```
┌─────────────────────────────┐
│  Stage（暗色 ~35%）          │
│  · 头像 + 点阵 DJ 名         │
│  · ● Speaking… + 会话计时    │
│  · 全宽大波形（白竖条）       │
├─────────────────────────────┤  ← 波形作为明暗交界，非硬分割线
│  Sheet（白色圆角卡片 ~65%）   │
│  · session / track 标题      │
│  · 进度条 + 暂停             │
│  ┌─────────────────────┐    │
│  │ Transcript（浅灰内层） │    │
│  │ · meta + 正文         │    │
│  │ · 当前句 / 淡化句      │    │
│  └─────────────────────┘    │
├─────────────────────────────┤
│  Mini bar                    │
│  · 小波形 + 时间 + 暂停       │
└─────────────────────────────┘
```

### Reference mock 信号与噪音（`doc/image.png`）

参考图来自 **视频截图**，其中部分文字是截图转录/OCR 残留，**不是产品设计**。实现时只取布局与 TranscriptPanel 行为，勿复刻噪音层。

| 区域 | 示例 | 判定 | 实现 |
|------|------|------|------|
| **TranscriptPanel**（浅灰内层滚动区） | `Auracle • 0:05` + `Back in 1971, David Gates picked up a nylon-string guitar…` | ✅ **信号** | WS `{ type: "transcript" }` → 追加/合并；active / past / upcoming 三层样式；可选词级 pill |
| **Overlay 描边大字**（叠在 transcript 区上的白描边黑字） | `David Gates用一把` 等 | ❌ **噪音** | **不实现**。视频硬字幕/截图 OCR 误识别，与 Auracle Live 协议无关 |
| Stage / Sheet / Mini bar 布局 | 暗色舞台、曲名进度、底栏波形 | ✅ **信号** | 按本文 tokens 与组件规范 |

**结论**：产品需要的「caption」= **TranscriptPanel 内的滚动口播转录**，不是 mock 里那层叠加大字。若未来要做双语/强调句，需 **单独 PRD**，不得从 `image.png` 截图文字反推需求。

---

## 风格定位

| 维度 | 决策 |
|------|------|
| **名称** | Neo-Minimal Live Radio UI |
| **模式** | **Hybrid**：顶部暗色沉浸 + 下方亮色内容（非纯 dark / 非纯 light） |
| **气质** | 克制、高对比、内容优先；像电台控制台，不像炫酷音乐 App |
| **装饰** | 点阵网格纹理、点阵/像素 Display 字体；用量少、低 opacity |
| **禁止** | emoji 作图标、全屏渐变、多 accent 色、波形 3D/发光过度 |

---

## Design Tokens

实现时使用 CSS 变量（或 Tailwind theme extension），**组件内禁止散落 hex**。

### 色彩

| Token | 值 | 用途 |
|-------|-----|------|
| `--stage-bg` | `#0A0A0A` | 顶部舞台背景 |
| `--stage-bg-gradient` | `#0F0F23` → `#0A0A0A` | 可选极淡纵深 |
| `--card-bg` | `#FFFFFF` | 主内容 sheet |
| `--transcript-bg` | `#F3F4F6` | 字幕内层容器 |
| `--text-primary` | `#111827` | 标题、当前字幕 |
| `--text-secondary` | `#9CA3AF` | 艺术家、meta、未激活控件 |
| `--text-faded` | `rgba(17, 24, 39, 0.35)` | 已读/未读淡化句 |
| `--text-on-stage` | `#FFFFFF` | 暗区用户名、波形 |
| `--accent-live` | `#22C55E` | Speaking 圆点、Live 高亮 |
| `--highlight-bg` | `rgba(34, 197, 94, 0.25)` | 当前词/句 pill 背景 |
| `--wave-active` | `#FFFFFF`（stage）/ `#111827`（mini bar） | 已播放波形 |
| `--wave-idle` | `#6B7280` / `#E5E7EB` | 未播放 / 静音波形 |
| `--progress-fill` | `#111827` | 曲目进度条 |
| `--progress-track` | `#E5E7EB` | 进度条轨道 |
| `--destructive` | `#EF4444` | 错误态（少用） |

对比度：正文 ≥ **4.5:1**（WCAG AA）；大标题 / 波形装饰 ≥ **3:1**。

### 字体

| 角色 | 字体 | 权重 | 场景 |
|------|------|------|------|
| **Display** | 点阵/像素（如 VT323、Press Start 2P，或自定义 dot-matrix） | 400 | DJ 名、电台呼号 |
| **Title** | Inter / system-ui | 600–700 | `session_title`、曲名 |
| **Body** | Inter | 400–500 | 字幕正文 |
| **Meta** | Inter | 400, 12px | `Auracle • 0:05` |
| **Timer** | Inter, `font-variant-numeric: tabular-nums` | 500 | 所有计时显示 |

Google Fonts 加载示例：

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=VT323&display=swap');
```

### 间距与圆角（8pt grid）

| Token | 值 |
|-------|-----|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--radius-sheet` | 28px（sheet 顶角） |
| `--radius-inner` | 16px（字幕容器） |
| `--radius-pill` | 6px（词级高亮） |
| `--radius-control` | 9999px（圆形按钮） |

### 阴影与纹理

```css
/* Sheet 轻 elevation */
--shadow-sheet: 0 -4px 24px rgba(0, 0, 0, 0.08);

/* 点阵背景（stage / transcript 共用） */
--dot-grid: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
--dot-size: 6px;
```

Stage 上 `--dot-grid` 用白色点；Transcript 内层用 `--text-secondary` 低 opacity 点。

### 动效

| Token | 值 | 用途 |
|-------|-----|------|
| `--duration-fast` | 150ms | 按钮按压、pill 淡入 |
| `--duration-normal` | 250ms | 字幕切换、sheet 进入 |
| `--duration-slow` | 300ms | 首次 layout 进入 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 进入 |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 退出（略快于进入） |

`prefers-reduced-motion: reduce` 时关闭 pulse、跳过 sheet 动画，字幕仍即时切换。

---

## 组件规范

### 1. StageHeader（暗色区）

**内容**

- 圆形头像 36–40px（DJ 人格图；Demo 可用占位）
- Display 字体 DJ 名（配置项，默认「Auracle」）
- 状态行：`● Speaking…` / `● Listening…` / `● Playing…`
- 右上角：会话 elapsed 或 DJ turn 计时

**状态与颜色**

| UI 状态 | 触发 | 绿点 | 文案 |
|---------|------|------|------|
| Speaking | `phase: dj_turn_start` 且收到 model PCM | 亮 + 可选 pulse | Speaking… |
| Listening | `user_barge_in` 或 mic 活跃 | 亮 | Listening… |
| Playing | 音乐 gain 主导、非 DJ turn | 灭 | Playing… |
| Idle | 未 start / 已结束 | 灭 | Tap to start |

**StageWaveform**

- 24–40 根竖条，宽 2–4px，gap 2–3px
- 高度由 `AnalyserNode`（DJ 或 master bus）驱动，更新用 `transform: scaleY()`，避免改 `height` 引发布局抖动
- DJ turn：白色条；Playing：可降低 opacity 或切灰

### 2. ContentSheet（白色卡片）

**内容**

- 主标题：`session_title`（`POST /sessions`）— 含节目名 + **期号** `vol. N`，如 `Quiet Hours, vol. 3`
- 节目 meta：`session_subtitle` — 时长 + 弧线，如 `25 min · winds down`
- 当前曲：`{track_title} — {artist}`（来自 tracklist / 当前曲 metadata）
- 一行控制：圆形暂停按钮（44×44 最小触控）+ 水平进度条 + `current / duration`
- 内嵌 `TranscriptPanel`

**Sheet 形态**

- `border-radius: var(--radius-sheet) var(--radius-sheet) 0 0`
- 占视口剩余高度；内容区 `overflow-y: auto`，底部为 mini bar 留 safe padding

### 3. TranscriptPanel（口播转录 / caption）

> **Caption 定义**：Gemini Live I/O transcription 在 UI 中的唯一载体。数据来自 WS `transcript`，展示在 Sheet 内浅灰滚动区。**不是**参考 mock 里叠在画面上方的描边大字（见 §Reference mock 信号与噪音）。

**单行结构**

```
[meta]  Auracle • 0:05
[body]  Back in 1971, my old man…
```

**三层视觉**

| 层级 | 样式 |
|------|------|
| **Active** | `--text-primary`；可选词级 `--highlight-bg` pill |
| **Past** | `--text-faded` |
| **Upcoming** | `--text-secondary`，opacity ~50% |

**行为**

- 新 `transcript` 追加或合并同 role 连续 delta（与 Gemini delta 累积策略一致）
- Active 行 `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
- 容器：浅灰底 + 点阵 pattern + `--radius-inner`

**Idle overlay**

- 未 `AudioContext.resume()` 前，字幕区可叠半透明 Play 三角 + 「Tap to start」
- 同一手势链：resume → `POST /sessions` → WS → mic（见 `auracle_pwa_audio_notes.md`）

### 4. MiniControlBar（底栏）

- 高度含 `env(safe-area-inset-bottom)`
- 横向波形：已播 `--wave-active`，未播 `--wave-idle`（可与曲目 progress 同步，Demo 可静态 mock）
- 左：当前时间；右：暂停（与 sheet 内按钮同步 state）
- **不含** overlay 描边大字 — 该元素为 `image.png` 截图噪音，见 §Reference mock 信号与噪音

### 5. 图标

- 使用 **Lucide** 或 Heroicons SVG，stroke 宽度统一（1.5–2px）
- 暂停 / 播放 / mic 均需 `aria-label`
- 禁止 emoji 作为结构图标

---

## 数据绑定

### REST

| UI 字段 | 来源 |
|---------|------|
| `session_title` | `POST /sessions` → `session_title` |
| 初始 tracklist | `POST /sessions` → `tracklist` |
| 当前指针 | `GET /sessions/:id` → `current_track_index` |
| 曲名 / 艺术家 | track metadata（shared `FlowTrackRef` + 本地 catalog） |
| 音频 URL | `GET /tracks/:id/audio` |

### Live WebSocket

类型定义：`packages/shared/src/live.ts`

| 消息 | UI 更新 |
|------|---------|
| `{ type: "transcript", role, text }` | TranscriptPanel 追加/更新 |
| `{ type: "phase", phase, track_index }` | Stage 状态、crossfade 指示、track 切换动画 |
| `{ type: "tracklist_updated", remaining }` | 更新 queue UI（Phase 1 可仅 toast /  subtle） |
| `{ type: "intent", intent }` | `pause_playback` → 同步暂停按钮 |
| `{ type: "error", message }` | 非阻塞 banner |
| Binary PCM | 不参与 UI 布局，仅驱动 Analyser + 播放 |

### Phase → UI 状态机

```
                    ┌──────────────┐
         start      │    Idle      │
        ──────────► │  (Tap start) │
                    └──────┬───────┘
                           │ user gesture + session ok
                           ▼
                    ┌──────────────┐
              ┌────│   Playing    │◄────┐
              │    │  (music)     │     │ track_started
              │    └──────┬───────┘     │
              │           │ cue_dj /   │
              │           │ dj_turn_*  │
              │           ▼            │
              │    ┌──────────────┐    │
              └───►│  DJ Turn     │────┘
                   │ (Speaking)   │
                   └──────┬───────┘
                          │ user_barge_in
                          ▼
                   ┌──────────────┐
                   │  Listening   │
                   └──────────────┘
```

---

## 电脑端适配

> Phase 1 主战场是 **Desktop Chrome**，但 **UI 形态仍是手机 mock**（单列 Stage + Sheet）。  
> 电脑端 ≠ 立刻做成宽屏仪表盘；先 **居中 phone frame**，再视需要扩展第二列。

### 策略总览

| 阶段 | 视口 | 做法 |
|------|------|------|
| **Phase 1 Demo** | Desktop ≥768px | 居中 **Phone Frame**（宽 390–430px，高 `min(100dvh, 844px)`），外围浅灰背景 |
| **Phase 1 Demo** | Desktop 窄窗 / 平板 | 与手机相同：frame 贴边或略缩进 |
| **Phase 2** | Desktop ≥1024px | 可选 **两栏**：左 Stage+波形，右 Sheet+字幕+歌单 |
| **Phase 2** | 真手机浏览器 | 去掉 frame 外壳，全宽贴边（见下节「响应式断点」） |

**原则**

1. **一套组件、多套 layout wrapper** — 不为 desktop 复制 React 树。  
2. **内容宽度 capped** — Stage / Sheet 视觉宽度不在宽屏上被拉成「横条播放器」。  
3. **交互双轨** — 触控尺寸保留；desktop 额外加 keyboard / hover，但不 **hover-only**。  
4. **音频逻辑与布局无关** — crossfade、WS、手势启动规则不变（`auracle_pwa_audio_notes.md`）。

### Phase 1：Phone Frame（推荐默认）

Desktop 打开时，用户看到的是 **居中「手机预览框」**，mock 比例不变：

```
┌──────────────────────────────────────── desktop viewport ────┐
│  #F4F4F5 或 --page-bg                                         │
│     ┌─────────────────────────┐                               │
│     │  Phone Frame 430×844    │  ← box-shadow + radius 可选   │
│     │  ┌───────────────────┐  │                               │
│     │  │ Stage             │  │                               │
│     │  │ Sheet + Transcript│  │                               │
│     │  │ Mini bar          │  │                               │
│     │  └───────────────────┘  │                               │
│     └─────────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

**CSS 骨架**

```css
.page {
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: stretch;
  background: var(--page-bg, #f4f4f5);
  padding: var(--space-md);
}

.phone-frame {
  width: 100%;
  max-width: 430px;
  min-height: min(100dvh, 844px);
  max-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--stage-bg);
  /* desktop 可选 */
  border-radius: 24px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12);
}

@media (max-width: 767px) {
  .page { padding: 0; }
  .phone-frame {
    max-width: none;
    min-height: 100dvh;
    border-radius: 0;
    box-shadow: none;
  }
}
```

**高度分配（frame 内）**

| 区域 | 竖屏 | 电脑矮窗（`max-height` 受限） |
|------|------|-------------------------------|
| Stage | `35%` 或 `min(280px, 35vh)` | 降至 `min(200px, 25vh)` |
| Sheet | `flex: 1; min-height: 0; overflow: hidden` | 同上，内部 Transcript 滚动 |
| Mini bar | 固定 `~64px` + safe-area | 不变 |

Stage 不要用 `height: 35vh` 在大显示器上撑满半屏；在 frame 内用 **百分比或 max-height cap**。

### Phase 1：Desktop 交互增强

在 phone frame 不变的前提下，可加：

| 能力 | 实现 |
|------|------|
| **键盘** | `Space` 暂停/继续；`Escape` 关闭 overlay（若有） |
| **Hover** | 暂停按钮、进度条 thumb：`opacity` / `scale` 150ms（非必须才显示） |
| **Focus** | Tab 顺序：Start → Pause → Transcript scroll region；可见 focus ring |
| **光标** | 可点击元素 `cursor: pointer` |
| **Mic** | Chrome 地址栏权限；UI 提示「允许麦克风」banner |
| **Resize** | frame 宽度 clamp(320px, 100%, 430px)；高度不足时优先压缩 Stage |

**不要**在 Phase 1 做：侧边歌单抽屉、多列 track grid、hover 才出现的唯一控制。

### Phase 2：宽屏两栏（可选）

当需要展示 **remaining tracklist** 或更长字幕历史时，≥1024px 可切换 layout mode：

```
┌────────────────────────────────────────────────────────────┐
│  page-bg                                                    │
│  ┌──────────────────────┬───────────────────────────────┐ │
│  │  Stage + 大波形       │  Sheet                        │ │
│  │  (max ~480px)        │  · 标题 / 进度                 │ │
│  │  DJ 状态 / 计时       │  · Transcript（更高可视区）     │ │
│  │                      │  · Track queue（remaining）    │ │
│  └──────────────────────┴───────────────────────────────┘ │
│  Mini bar 横跨两栏或仅右栏                                     │
└────────────────────────────────────────────────────────────┘
```

实现方式：

```tsx
// 同一套子组件，wrapper 切换
<div className={isWide ? 'layout-split' : 'layout-phone'}>
  <StageHeader />
  <ContentSheet showQueue={isWide} />
  <MiniControlBar />
</div>
```

- `isWide = matchMedia('(min-width: 1024px)').matches`  
- Split 时 Stage 固定宽或 `1fr`，Sheet `1.2fr`；**tokens 颜色/字体不变**  
- `<768px` 仍走 phone / 全宽，不启用 split

### 响应式断点（汇总）

| 断点 | 宽度 | Layout | 备注 |
|------|------|--------|------|
| **xs** | `< 375` | 全宽 frame | 最小支持 320；字幕字号勿小于 14px |
| **sm** | `375 – 767` | 全宽，无 shadow | 真手机 PWA Phase 2 |
| **md** | `768 – 1023` | 居中 phone frame | **Phase 1 Desktop 默认** |
| **lg** | `1024 – 1439` | frame 或 split（Phase 2 开关） | 开发机常见 |
| **xl** | `≥ 1440` | 同 lg，frame 仍 max 430（或 split 总宽 max ~960） |  ultrawide 两侧留白 |

**Landscape（手机横屏 / 矮 desktop 窗）**

- Stage `max-height: 25%`  
- Transcript `flex: 1` 必 scroll  
- Mini bar 保持 fixed 底

### Design Tokens（desktop 补充）

```css
:root {
  --page-bg: #f4f4f5;
  --frame-max-width: 430px;
  --frame-max-height: 844px;
  --frame-radius: 24px;
  --frame-shadow: 0 24px 48px rgba(0, 0, 0, 0.12);
  --split-gap: 24px;
  --split-max-width: 960px;
}

@media (max-width: 767px) {
  :root {
    --frame-radius: 0;
    --frame-shadow: none;
  }
}
```

### 验收清单（Desktop Chrome）

- [ ] 1920×1080：frame 居中，左右留白，无横向滚动  
- [ ] 1280×720：frame 全高可见，字幕区可滚  
- [ ] 窗口拖窄至 400px：布局不崩，控件仍可点  
- [ ] Tab 可聚焦暂停；Space 可切换播放  
- [ ] 首次点击 Start 仍能 resume AudioContext + 连 WS  
- [ ] DevTools 设备模拟 375×812 与 desktop 共用同一组件树

---

## 响应式与布局（移动优先）

移动优先设计；**电脑端见上一节「电脑端适配」**。

| 断点 | 行为 |
|------|------|
| `< 768px` | 全宽单列，sheet 贴底，无 frame 装饰 |
| `≥ 768px` | 居中 phone frame + `--page-bg` |
| Landscape | Stage 高度降至 ~25%，字幕区滚动 |

**Safe area**：Stage 顶、`MiniControlBar` 底使用 `env(safe-area-inset-*)`（PWA / 真机）。

---

## 无障碍（必做）

| 项 | 要求 |
|----|------|
| 对比度 | 正文 4.5:1；Live 绿点在暗底上仍需 3:1+ |
| 触控 | 所有控件 ≥ **44×44px**；图标可视觉 24px + padding |
| 焦点 | 可见 focus ring（2–4px，`--accent-live` 或 `--ring`） |
| 屏幕阅读 | 状态行用 `aria-live="polite"`；Speaking 变化播报 |
| 动效 | 尊重 `prefers-reduced-motion` |
| 颜色 | Speaking 不仅靠绿点，必须伴随文案「Speaking…」 |

---

## 实现切片（apps/web）

与 `auracle_api_protocol.md` 清单对齐：

| 优先级 | 切片 | 交付 |
|--------|------|------|
| **P0** | Shell + tokens | Vite + React、`--*` CSS variables、phone frame |
| **P0** | ContentSheet | 标题、进度、暂停（mock 数据） |
| **P1** | StageHeader | 状态机 + 大波形（mock analyser） |
| **P1** | Session 接入 | `POST /sessions`、`GET /tracks/.../audio` |
| **P2** | TranscriptPanel | WS `transcript` + 滚动 + active 样式 |
| **P2** | Live 音频 | PCM + crossfade（`auracle_pwa_audio_notes.md`） |
| **P3** | 纹理 | 点阵背景、Display 字体 |
| **P3** | MiniControlBar | 与 master 进度同步 |
| **P4** | 词级 pill 高亮 | 依赖 transcript 时间戳（有则做） |

**技术栈（拍板）**：Vite + React + TypeScript；**CSS Modules**（组件样式）+ `index.css`（全局 tokens / reset）。Tailwind 不使用。  
开发 proxy：`/sessions`、`/tracks` → `:3000`（见 `auracle_pwa_audio_notes.md` §坑 4）。

---

## 反模式（Avoid）

| 不要 | 原因 |
|------|------|
| 纯 dark 全屏 | 与 mock 不符；曲目信息可读性下降 |
| 多 accent 色 | 破坏「绿色 = Live」语义 |
| 两个 `<audio>` 硬切 | 见音频文档 |
| hover-only 交互 | 移动端无 hover |
| 波形改 DOM height 每帧 | 性能/jank |
| 未手势就连 WS | Chrome 自动播放策略 |
| 复刻 mock 叠层描边大字 | `image.png` 中如「David Gates用一把」等为视频截图 OCR 噪音，非产品 caption |

---

## 相关文档

| 文档 | 内容 |
|------|------|
| [auracle_pwa_audio_notes.md](auracle_pwa_audio_notes.md) | AudioContext、crossfade、PCM |
| [auracle_api_protocol.md](auracle_api_protocol.md) | REST + WS 字段 |
| [auracle_architecture_storage.md](auracle_architecture_storage.md) | Demo 总架构 |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-06 | 初版：自 reference mock 提炼 tokens、组件、数据绑定与实现切片 |
| 2026-06-06 | 补充「电脑端适配」：Phase 1 phone frame、Phase 2 两栏、断点与验收 |
| 2026-06-06 | 澄清 `image.png`：TranscriptPanel = 正式 caption；叠层描边大字 = 截图 OCR 噪音，不实现 |
| 2026-06-06 | 明确「产品号」= Flow `session_title` 内 `vol. N` + `session_subtitle` 弧线 meta |
| 2026-06-06 | 前端样式拍板：CSS Modules + 全局 tokens；StageWaveform 使用 `useWaveform` + `data-wave-bar` |
