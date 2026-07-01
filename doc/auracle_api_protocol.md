# Auracle — API & Live WebSocket 协议

> Demo Live 模型：**`gemini-3.1-flash-live-preview`**  
> 生产优化路径见 `auracle_architecture_storage.md` § Demo vs 生产。

---

## 当前运行时（2026-07）

编排已拆为多服务；**session REST 由 `agent-harness` 提供**（非下文「进程内 `apps/api`」单体式）。

```
apps/web
  REST  /sessions*     → agent-harness :3000
  WebRTC offer         → rt_llm_proxy
agent-harness
  session/             → lifecycle · planning · delivery（见 auracle_personalization_plan.md §3）
  POST …/tool          → memory-service 转发（Lane 1）
  inject               → rt_llm_proxy（Lane 3：tracklist_updated、cue、queue_refresh）
music-engine           → plan / search_catalog / getTrack
memory-service         → mem0 · session_events · auth resolve
```

### `agent-harness` Session REST

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/sessions` | 创建 session（provisional plan + 异步 refine） |
| `GET` | `/sessions/:id` | 当前 snapshot（指针、remaining、copy） |
| `GET` | `/sessions/:id/registration` | DJ 预注册包（proxy 连接前） |
| `POST` | `/sessions/:id/tool` | Gemini function call（Lane 1，proxy 转发） |
| `POST` | `/sessions/:id/now_playing` | 浏览器 playhead 镜像；触发 extend / skip-swap |
| `POST` | `/sessions/:id/cue` | break / outro cue（Lane 3 inject） |
| `POST` | `/sessions/:id/host-mode` | UI 切换主持风格 |
| `POST` | `/sessions/:id/playlist-feedback` | like / dislike / **regenerate**（UI 与 DJ tool 统一路径） |
| `POST` | `/sessions/:id/extend` | E6：手动重试 rolling extend |
| `POST` | `/sessions/:id/events` | 客户端 telemetry（`track_started` 等） |

**Regenerate**：仅 `POST /playlist-feedback`，body `{ "feedback": "regenerate" }`；响应在 `regenerate` 字段（`RegenerateSessionResponse`）。~~`POST /regenerate`~~ 已移除。

**Channel 规则**（`session/delivery/queue-update.ts`）：client-initiated 变更（Regenerate HTTP）只走 response；server-initiated（mood_change replan、extend、skip-swap、refine）走 proxy `ui_events`，不双推。

类型定义：`packages/shared/src/api.ts`。

---

## 设计原则（Demo 单体式 — 历史参考）

以下 §「进程内模块」描述早期 **单 Fastify `apps/api`** 原型；字段语义仍适用于 web，但路径与进程边界以上表为准。

- **一个后端进程**，避免 Go + Node 双栈调度
- API key 只在服务端；浏览器不直连 Gemini
- Live 与 Flow 共用 `@google/genai`，类型走 `packages/shared`
- 协议语义参考 [thinkinbig/rt_llm_proxy](https://github.com/thinkinbig/rt_llm_proxy) 的 Gemini 适配器（**非运行时依赖**）

---

## 进程内模块（`apps/api`）

```
Fastify :3000
├── REST     sessions / tracks / events
├── WS       /sessions/:id/live   ←→  Gemini Live (BidiGenerateContent)
├── live/    Gemini setup · tools · phase · PCM 转发
├── flow/    Step 1 检索 + Step 2 JSON 重排
├── memory/  mem0
└── db/      SQLite
```

Intent 处理、重排、写 `session_events` 均为 **进程内函数调用**，无跨服务 REST。

---

## REST

### `POST /sessions`

创建 session，Step 1 + Step 2 生成初始 8 首。

**Request**

```json
{ "mood": "calm", "scene": "study", "duration_min": 25 }
```

**Response**

```json
{
  "session_id": "uuid",
  "session_title": "…",
  "tracklist": [{ "id": "…", "flow_position": 1, "reason": "…" }],
  "mem0_context": "…",
  "live_ws_url": "/sessions/uuid/live"
}
```

### `GET /sessions/:id`

返回当前 plan、播放指针、remaining（供 UI）。

**Response**

```json
{
  "session_id": "uuid",
  "session_title": "…",
  "current_track_index": 2,
  "tracklist": [{ "id": "…", "flow_position": 1, "reason": "…" }],
  "remaining": [{ "id": "…", "flow_position": 3 }],
  "mem0_context": "…"
}
```

### `POST /sessions/:id/playlist-feedback`

Like / dislike / regenerate。`regenerate` 时响应含嵌套 `regenerate`（曲目、changed_ids 等）。与 DJ `playlist_feedback` tool 共用 `session/planning/playlist-feedback.ts`。

```json
{ "feedback": "like" | "dislike" | "regenerate" }
```

### `POST /sessions/:id/events`

Web 上报播放事实。

```json
{ "event_type": "track_started", "payload": { "track_id": "t3" } }
```

### `GET /tracks/:id/audio`

返回 mp3（或 signed URL）；Demo 可静态文件。

---

## Live WebSocket — `WS /sessions/:id/live`

连接前应先 `POST /sessions`；同一 `session_id` 绑定 Gemini Live 会话与内存状态机。

### 客户端 → 服务端

| 类型 | 格式 | 说明 |
|------|------|------|
| 麦克风 | Binary | PCM s16le mono **16kHz**（与 Gemini Live 一致） |
| 曲间触发 DJ | JSON | `{ "type": "cue_dj", "track_index": 2 }` → 服务端转 **Gemini `realtimeInput` 文本** |
| 控制 | JSON | `{ "type": "ping" }` |

### 服务端 → 客户端

| 类型 | 格式 | 说明 |
|------|------|------|
| DJ 音频 | Binary | PCM s16le mono **24kHz** chunks |
| 字幕 | JSON | `{ "type": "transcript", "role": "user"|"model", "text": "…" }` |
| Phase | JSON | `{ "type": "phase", "phase": "dj_turn_end", "track_index": 2 }` |
| 重排结果 | JSON | `{ "type": "tracklist_updated", "remaining": […] }` |
| 错误 | JSON | `{ "type": "error", "message": "…" }` |

### Phase 枚举

| phase | 触发 |
|-------|------|
| `dj_turn_start` | 曲间 Live 开讲 |
| `dj_turn_end` | Gemini `turnComplete` |
| `user_barge_in` | Gemini `Interrupted` / VAD |
| `user_barge_end` | 用户停说（可选，Demo 可省略） |

浏览器用 phase 驱动 Web Audio gain（见 `auracle_pwa_audio_notes.md`）。

---

## Gemini Live（服务端实现要点）

**Demo 模型**：`gemini-3.1-flash-live-preview`（Gemini 3.1 Flash Live Preview）

Setup 需包含：

- `model`: `models/gemini-3.1-flash-live-preview`  
- `systemInstruction` — DJ 人格、混合场、仅曲间可改歌单  
- `responseModalities: ["AUDIO"]`  
- `tools` — `skip_track`, `mood_change`, `pause_playback`, `record_preference`（闲聊由 Live 自然处理，无需 tool）  
- I/O transcription — UI 字幕 + log  

**3.1 Live 注意**（与 2.5 native-audio 不同）：

- 会话中追加文本/口播 cue 用 **`realtimeInput`**，不用 `clientContent`（后者仅 seed 初始上下文）  
- 单条 `serverContent` 可含 **多 part**（audio + transcript 同时）— 需全部处理  
- **Function calling 仅同步**：`mood_change` 重排时 Live 会等待 `toolResponse`；重排应尽量快（<2s），或先返回 pending 文案  

Tool 调用 **同进程**：

```text
tool mood_change → flow.replan(session, intent) → session_events
                → WS 推送 tracklist_updated
                → sendToolResponse → Live 口头确认
```

协议参考：`rt_llm_proxy/internal/model/gemini/gemini.go`（字段名对照用，非运行时依赖）。

---

## 会话时序

```
1. web  POST /sessions                    → tracklist + live_ws_url
2. web  WS  /sessions/:id/live            → Fastify ↔ Gemini Live
3. web  播放曲 1（Web Audio）
4. 曲终 web → { cue_dj } 或 Fastify 自动  → dj_turn_start
5. DJ PCM → web                           → dj_turn_end → crossfade 曲 2
6. 用户曲间说话 → tool mood_change        → 进程内 replan → tracklist_updated
7. Fastify 写 session_events
```

---

## 前端 PCM 播放（Demo）

- 上行：麦克风 `AudioWorklet` 降采样 16k → WS binary  
- 下行：24k PCM queue + `AudioWorklet` 排程 → `djGain`  
- 音乐：mp3 + `musicGain`（与 Live 无关）

无需 WebRTC / Opus；Chrome Desktop 足够。

---

## 实现检查清单

**apps/api**

- [ ] Fastify REST + `@fastify/websocket`  
- [ ] `live/gemini-session.ts` — Live WS + setup + tools + phase  
- [ ] `flow/replan.ts` — Step 2 JSON  
- [ ] mem0 + SQLite  
- [ ] `packages/shared` — Tracklist、Phase、Intent 类型  

**apps/web**

- [ ] WS client + PCM capture/playback  
- [ ] Web Audio crossfade  
- [ ] Session UI + transcript（见 `auracle_ui_design.md`）

---

## 参考：rt_llm_proxy（非 Demo 依赖）

| 可参考 | 不必搬 |
|--------|--------|
| Gemini WS 字段、`turnComplete`、`Interrupted` | WebRTC / pion / Opus 桥 |
| 字幕 delta 累积 | Kafka / Redis side-channel |
| Cascade `OnLLMToken` 意图拦截思路 | 整仓 Go 部署 |

生产若需 WebRTC、TURN、多实例，可再引入独立媒体层；Demo 不阻塞。
