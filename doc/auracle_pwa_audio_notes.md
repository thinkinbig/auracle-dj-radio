# Auracle — Web 音频播放注意事项

> Phase 1：**Desktop Chrome** 为主。iOS 双工 Live 为 Phase 2。

---

## 音频架构：双路混音

| 路 | 来源 | 进入方式 |
|----|------|----------|
| **DJ** | Gemini Live → Fastify WS | 24k PCM → AudioWorklet queue → `djGain` |
| **Music** | 曲库 mp3 | `<audio>` + `createMediaElementSource` → `musicGain`（流式加载，无需完整下载） |

**禁止**两个 `<audio>` 标签硬切。  
**禁止**假设 DJ 有固定时长；fade 由 **WS phase 事件** 驱动。

```
AudioContext
├── musicGain ──┐
├── djGain ─────┼── masterGain ── analyser ── destination
                              └── StageWaveform (getByteFrequencyData)
```

`AnalyserNode` 挂在 `masterGain` 与 `destination` 之间，混音后的 DJ + 曲库信号驱动 Stage 波形。**禁止**用 `Math.random()` 等假波形占位。

---

## 坑 1：必须用户手势启动 AudioContext 🔴

```js
const handleStart = async () => {
  await audioCtx.resume()
  await fetch('/sessions', { method: 'POST', … })
  connectLiveWebSocket(session.live_ws_url)
  getUserMedia → 16k PCM uplink
}
```

WS 连接、麦克风、第一场播放挂在 **同一点击事件** 链上。

---

## 坑 2：DJ ↔ 音乐 fade（talk-over 压音）🔴

> 决定改为 **talk-over**，不做曲间 crossfade —— 见 `docs/adr/0001-talk-over-instead-of-crossfade.md`。
> 原 crossfade 表（音乐淡到 0 → DJ 空档 → ~2s 进歌）已废弃。

DJ 盖在**当前曲前奏**上讲，音乐 duck 到 0.25，过渡用 ~0.4s 平滑 ramp：

| 场景 | musicGain | djGain | 时长 |
|------|-----------|--------|------|
| 开讲（talk-over 前奏） | 1 → 0.25 | 0 → 1 | 音乐 duck ~0.4s；DJ in ~0.15s |
| DJ 完 → 续播 | 0.25 → 1 | 1 → 0 | 音乐 restore ~0.4s；DJ out ~0.3s |
| 手动 skip track | dip → 0 → 1 | （如在讲则截断） | dip ~0.2s |
| skip voice-over | 0.25 → 1 | 1 → 0 | 服务端 `skip_dj` 截断 → `dj_turn_end` |
| 用户打断（barge-in） | duck → 0.25 | Live | ~300ms |

```js
// 仅用 phase 驱动 gain；djGain 由 dj_turn_start/end 淡入淡出。
onPhase('dj_turn_start', () => ramp(musicGain, 0.25, 0.4)) // duck
onPhase('dj_turn_end',   () => ramp(musicGain, 1.0, 0.4))  // restore
```

---

## 坑 3：phase 事件来源

| phase | 来源 |
|-------|------|
| `dj_turn_start` / `dj_turn_end` | Fastify → WS（Gemini `turnComplete`） |
| `user_barge_in` | Fastify（Gemini `Interrupted`） |
| `track_started` | web 本地 + `POST /sessions/:id/events` |

详见 `auracle_api_protocol.md`。

---

## 坑 4：单后端 — REST + WS 同 host 🔴

Demo 只连 **Fastify :3000**：

- `POST /sessions` — tracklist  
- `WS /sessions/:id/live` — Live PCM + JSON  
- `GET /tracks/:id/audio` — mp3  

开发时 Vite proxy 把 `/sessions` 和 `/ws` 转到 api 即可；**无需**第二个 Go 进程。

---

## 坑 5：PCM 上下行

| 方向 | 格式 |
|------|------|
| 上行（mic） | s16le mono **16kHz** |
| 下行（DJ） | s16le mono **24kHz** |

浏览器需 AudioWorklet 做重采样 / 播放队列（可参考 Gemini Live 前端示例；协议语义见 rt_llm_proxy 的 gemini 适配器，不必引入 Go）。

---

## 坑 6：Media Session API 🟡

播歌时更新 `navigator.mediaSession.metadata`（曲名、封面）。

---

## 坑 7：曲库格式 🟢

- 曲库 **mp3**（128kbps）  
- 不用 `.ogg`

---

## Phase 1 vs Phase 2

| 优先级 | 项 | Phase |
|--------|-----|-------|
| 🔴 | 手势 + AudioContext + WS Live | 1 |
| 🔴 | Web Audio crossfade + phase | 1 |
| 🟡 | Media Session | 1 |
| 🟡 | iOS 双工 / 后台 | 2 |
| 🟢 | WebRTC 媒体面（生产） | 2 |

---

## 相关文档

- 协议：`auracle_api_protocol.md`  
- 架构：`auracle_architecture_storage.md`
- UI：`auracle_ui_design.md`
