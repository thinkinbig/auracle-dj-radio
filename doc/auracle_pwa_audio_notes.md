# Auracle — Web Audio Playback Notes

> Phase 1: **Desktop Chrome** primary target. iOS duplex Live is Phase 2.

---

## Audio Architecture: Two-Path Mixing

| Path | Source | Entry point |
|----|------|----------|
| **DJ** | Gemini Live → Fastify WS | 24k PCM → AudioWorklet queue → `djGain` |
| **Music** | Catalog mp3 | `<audio>` + `createMediaElementSource` → `musicGain` (streamed, no full download needed) |

**Forbidden**: hard-cutting between two `<audio>` tags.
**Forbidden**: assuming the DJ has a fixed duration; fades are driven by **WS phase events**.

```
AudioContext
├── musicGain ──┐
├── djGain ─────┼── masterGain ── analyser ── destination
                              └── StageWaveform (getByteFrequencyData)
```

`AnalyserNode` sits between `masterGain` and `destination`; the mixed DJ + catalog signal drives the Stage waveform. **Forbidden**: using `Math.random()` or similar as a fake waveform placeholder.

---

## Pitfall 1: AudioContext must be started by a user gesture 🔴

```js
const handleStart = async () => {
  await audioCtx.resume()
  await fetch('/sessions', { method: 'POST', … })
  connectLiveWebSocket(session.live_ws_url)
  getUserMedia → 16k PCM uplink
}
```

WS connection, microphone, and the first playback all hang off the **same click event** chain.

---

## Pitfall 2: DJ ↔ music fade (talk-over ducking) 🔴

> Decision: use **talk-over**, not a between-track crossfade — see `docs/adr/0001-talk-over-instead-of-crossfade.md`.
> The original crossfade table (music fades to 0 → DJ gap → ~2s fade-in) is deprecated.

The DJ speaks over the **current track's intro**; music ducks to 0.25, with a ~0.4s smooth ramp for the transition:

| Scenario | musicGain | djGain | Duration |
|------|-----------|--------|------|
| Talk begins (talk-over intro) | 1 → 0.25 | 0 → 1 | Music ducks ~0.4s; DJ in ~0.15s |
| DJ finishes → playback resumes | 0.25 → 1 | 1 → 0 | Music restores ~0.4s; DJ out ~0.3s |
| Manual skip track | dip → 0 → 1 | (cut short if speaking) | dip ~0.2s |
| skip voice-over | 0.25 → 1 | 1 → 0 | Server-side `skip_dj` cuts it short → `dj_turn_end` |
| User barge-in | duck → 0.25 | Live | ~300ms |

```js
// Gain is driven only by phase; djGain fades in/out on dj_turn_start/end.
onPhase('dj_turn_start', () => ramp(musicGain, 0.25, 0.4)) // duck
onPhase('dj_turn_end',   () => ramp(musicGain, 1.0, 0.4))  // restore
```

---

## Pitfall 3: Source of phase events

| phase | Source |
|-------|------|
| `dj_turn_start` / `dj_turn_end` | Fastify → WS (Gemini `turnComplete`) |
| `user_barge_in` | Fastify (Gemini `Interrupted`) |
| `track_started` | Local to web + `POST /sessions/:id/events` |

See `auracle_api_protocol.md` for details.

---

## Pitfall 4: Single backend — REST + WS on the same host 🔴

Demo only connects to **Fastify :3000**:

- `POST /sessions` — tracklist
- `WS /sessions/:id/live` — Live PCM + JSON
- `GET /tracks/:id/audio` — mp3

In dev, the Vite proxy forwards `/sessions` and `/ws` to the api; **no** second Go process is needed.

---

## Pitfall 5: PCM up/downlink

| Direction | Format |
|------|------|
| Uplink (mic) | s16le mono **16kHz** |
| Downlink (DJ) | s16le mono **24kHz** |

The browser needs an AudioWorklet for resampling / a playback queue (see Gemini Live's frontend examples for reference; protocol semantics live in rt_llm_proxy's gemini adapter — no need to introduce Go).

---

## Pitfall 6: Media Session API 🟡

Update `navigator.mediaSession.metadata` (track title, cover) during playback.

---

## Pitfall 7: Catalog format 🟢

- Catalog is **mp3** (128kbps)
- Do not use `.ogg`

---

## Phase 1 vs Phase 2

| Priority | Item | Phase |
|--------|-----|-------|
| 🔴 | Gesture + AudioContext + WS Live | 1 |
| 🔴 | Web Audio crossfade + phase | 1 |
| 🟡 | Media Session | 1 |
| 🟡 | iOS duplex / background | 2 |
| 🟢 | WebRTC media plane (production) | 2 |

---

## Related Docs

- Protocol: `auracle_api_protocol.md`
- Architecture: `auracle_architecture_storage.md`
- UI: `auracle_ui_design.md`
