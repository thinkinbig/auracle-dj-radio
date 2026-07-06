# Auracle — Web UI Design Spec

> Phase 1: **Desktop Chrome** single-column player interface. Reference mock: dark DJ stage + white content card + live captions.
> See `auracle_pwa_audio_notes.md` for audio behavior; `auracle_api_protocol.md` for data binding.

---

## Design Goals

Auracle's UI is not a generic music player — it's a visualization of **"an AI radio DJ talking"**:

| What the user needs to perceive | UI expression |
|--------------|---------|
| The DJ is speaking / about to speak | Dark stage area + green Live status + large waveform |
| What track is currently playing | White card title / artist / progress |
| What the DJ said | Scrolling caption area + active-line highlight |
| Playback is still going overall | Bottom mini control bar + timer |
| This live show is on air | StageHeader **ON AIR** pill (stays lit after session start) |

**Identity formula**: high-contrast light/dark zoning + a waveform spine + dot-matrix retro accents + **red ON AIR = session live** + **green = DJ turn** + a three-tier caption state.

---

## Reference Mock Structure

```
┌─────────────────────────────┐
│  Stage (dark, ~35%)          │
│  · Avatar + dot-matrix DJ name │
│  · ● Speaking… + session timer │
│  · Full-width large waveform (white bars) │
├─────────────────────────────┤  ← waveform as the light/dark boundary, not a hard divider
│  Sheet (white rounded card, ~65%) │
│  · session / track title      │
│  · progress bar + pause       │
│  ┌─────────────────────┐    │
│  │ Transcript (light-gray inner layer) │
│  │ · meta + body         │
│  │ · active line / faded line │
│  └─────────────────────┘    │
├─────────────────────────────┤
│  Mini bar                    │
│  · small waveform + time + pause │
└─────────────────────────────┘
```

## Style Positioning

| Dimension | Decision |
|------|------|
| **Name** | Neo-Minimal Live Radio UI |
| **Mode** | **Hybrid**: immersive dark top + light content below (neither pure dark nor pure light) |
| **Character** | Restrained, high-contrast, content-first; like a radio control console, not a flashy music app |
| **Decoration** | Dot-grid texture, dot-matrix/pixel display font; used sparingly, low opacity |
| **Forbidden** | Emoji as icons, full-screen gradients, multiple accent colors, over-glossy 3D/glow waveforms |

---

## Design Tokens

Use CSS variables at implementation time (or a Tailwind theme extension); **no stray hex values inside components**.

### Color

| Token | Value | Use |
|-------|-----|------|
| `--stage-bg` | `#0A0A0A` | Top stage background |
| `--stage-bg-gradient` | `#0F0F23` → `#0A0A0A` | Optional, very subtle depth |
| `--card-bg` | `#FFFFFF` | Main content sheet |
| `--transcript-bg` | `#F3F4F6` | Caption inner container |
| `--text-primary` | `#111827` | Titles, active caption |
| `--text-secondary` | `#9CA3AF` | Artist, meta, inactive controls |
| `--text-faded` | `rgba(17, 24, 39, 0.35)` | Read/unread faded lines |
| `--text-on-stage` | `#FFFFFF` | Username, waveform on the dark zone |
| `--accent-live` | `#22C55E` | DJ turn green dot (Speaking / Listening) |
| `--on-air-bg` | `#DC2626` | ON AIR pill background |
| `--on-air-fg` | `#FFFFFF` | ON AIR pill text |
| `--highlight-bg` | `rgba(34, 197, 94, 0.25)` | Current word/line pill background |
| `--wave-active` | `#FFFFFF` (stage) / `#111827` (mini bar) | Played portion of the waveform |
| `--wave-idle` | `#6B7280` / `#E5E7EB` | Unplayed / muted waveform |
| `--progress-fill` | `#111827` | Track progress bar |
| `--progress-track` | `#E5E7EB` | Progress bar track |
| `--destructive` | `#EF4444` | Error state (used sparingly) |

Contrast: body text ≥ **4.5:1** (WCAG AA); large titles / waveform decoration ≥ **3:1**.

### Typography

| Role | Font | Weight | Context |
|------|------|------|------|
| **Display** | Dot-matrix/pixel (e.g. VT323, Press Start 2P, or a custom dot-matrix font) | 400 | DJ name, station call sign |
| **Title** | Inter / system-ui | 600–700 | `session_title`, track title |
| **Body** | Inter | 400–500 | Caption body |
| **Meta** | Inter | 400, 12px | `Auracle • 0:05` |
| **Timer** | Inter, `font-variant-numeric: tabular-nums` | 500 | All timer displays |

Google Fonts loading example:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=VT323&display=swap');
```

### Spacing & Radius (8pt grid)

| Token | Value |
|-------|-----|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--radius-sheet` | 28px (sheet top corners) |
| `--radius-inner` | 16px (caption container) |
| `--radius-pill` | 6px (word-level highlight) |
| `--radius-control` | 9999px (circular buttons) |

### Shadow & Texture

```css
/* Light elevation for the Sheet */
--shadow-sheet: 0 -4px 24px rgba(0, 0, 0, 0.08);

/* Dot-grid background (shared by stage / transcript) */
--dot-grid: radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px);
--dot-size: 6px;
```

On the Stage, `--dot-grid` uses white dots; inside Transcript, it uses low-opacity `--text-secondary` dots.

### Motion

| Token | Value | Use |
|-------|-----|------|
| `--duration-fast` | 150ms | Button press, pill fade-in |
| `--duration-normal` | 250ms | Caption transitions, sheet entrance |
| `--duration-slow` | 300ms | Initial layout entrance |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits (slightly faster than entrances) |

Under `prefers-reduced-motion: reduce`, disable pulsing and skip sheet animations; captions still switch instantly.

---

## Component Spec

### 1. StageHeader (dark zone)

**Content**

- Circular avatar, 36–40px (DJ persona image; a placeholder is fine for the demo)
- Display-font DJ name (a config value, defaults to "Auracle")
- Top-right: **ON AIR** pill (session-level) + session elapsed timer
- Status line: green dot (turn-level) + `Speaking…` / `Listening…` / `Playing…`

**Two layers of broadcast semantics**

| Layer | Meaning | Control | When lit |
|------|------|------|--------|
| **Session** | This live show is on the air | Red `ON AIR` pill | `phase !== idle`; dimmed (opacity ~50%) when `paused` |
| **Turn** | The DJ / listener is currently speaking | Green dot + pulse | `speaking` / `listening` only |

The Play/Pause button stays a neutral color (transport control) — it does not compete with the ON AIR / Live-turn accent.

**State and color**

| UI state | Trigger | ON AIR | Green dot | Copy |
|---------|------|--------|------|------|
| Curating | User tapped Start, `POST /sessions` in flight | Lit | Lit | Tuning in… |
| Speaking | `phase: dj_turn_start` and model PCM received | Lit | Lit + pulse | Speaking… |
| Listening | `user_barge_in` or mic active | Lit | Lit | Listening… |
| Playing | Music gain dominant, not a DJ turn | Lit | Off | Playing… |
| Paused | User paused locally | Dim | Off | Paused |
| Idle | Not started / ended | Hidden | Off | Tap to start |

**StageWaveform**

- 24–40 vertical bars, 2–4px wide, 2–3px gap
- Height is driven by an `AnalyserNode` on the master bus (`musicGain` + `djGain` → `masterGain` → analyser); update via `transform: scaleY()`, avoid changing `height` to prevent layout jank
- **Forbidden**: random mock animation; bars settle to the idle floor height when there's no PCM / no analyser
- DJ turn (`speaking` / `listening`): white bars (`.live`)
- Playing: gray bars (non-`.live`)
- Curating / idle / paused: **do not drive** the analyser; bars settle to the idle floor height (no audio yet while the session plan is being generated)

| Phase | Waveform driven | Bar color |
|-------|----------|------|
| idle | No | idle |
| curating | No | idle |
| playing | Yes (catalog PCM) | gray |
| speaking / listening | Yes (DJ PCM, or catalog while ducked) | white |
| paused | No | idle |

### 2. ContentSheet (white card)

**Content**

- Main title: `session_title` (from `POST /sessions`) — includes the show name + an **episode number**, `vol. N`, e.g. `Quiet Hours, vol. 3`
- Show meta: `session_subtitle` — duration + arc, e.g. `25 min · winds down`
- Current track: `{track_title} — {artist}` (from the tracklist / current-track metadata)
- One control row: circular pause button (44×44 min touch target) + horizontal progress bar + `current / duration`
- Embedded `TranscriptPanel`

**Sheet shape**

- `border-radius: var(--radius-sheet) var(--radius-sheet) 0 0`
- Fills the remaining viewport height; content area is `overflow-y: auto`, with safe bottom padding for the mini bar

### 3. TranscriptPanel (voice-over transcript / caption)

> **Caption definition**: the sole UI carrier for Gemini Live I/O transcription. Data comes from the WS `transcript` message, shown in the Sheet's light-gray scroll area. This is **not** the outlined large overlay text from the reference mock (see §Reference Mock: Signal vs. Noise).

**Single-line structure**

```
[meta]  Auracle • 0:05
[body]  Back in 1971, my old man…
```

**Three visual tiers**

| Tier | Style |
|------|------|
| **Active** | `--text-primary`; optional word-level `--highlight-bg` pill |
| **Past** | `--text-faded` |
| **Upcoming** | `--text-secondary`, opacity ~50% |

**Behavior**

- New `transcript` events append, or merge into the same-role's running delta (consistent with Gemini's delta-accumulation strategy)
- The active line calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`
- Container: light-gray background + dot-grid pattern + `--radius-inner`

**Idle overlay**

- Before `AudioContext.resume()`, the caption area can show a semi-transparent Play triangle + "Tap to start"
- Same gesture chain: resume → `POST /sessions` → WS → mic (see `auracle_pwa_audio_notes.md`)

### 4. MiniControlBar (bottom bar)

- Height includes `env(safe-area-inset-bottom)`
- Horizontal waveform: played portion `--wave-active`, unplayed `--wave-idle` (can sync with track progress; a static mock is fine for the demo)
- Left: current time; right: pause (state synced with the button in the sheet)

### 5. Icons

- Use **Lucide** or Heroicons SVGs, consistent stroke width (1.5–2px)
- Pause / play / mic all need an `aria-label`
- No emoji as structural icons

---

## Data Binding

### REST

| UI field | Source |
|---------|------|
| `session_title` | `POST /sessions` → `session_title` |
| Initial tracklist | `POST /sessions` → `tracklist` |
| Current pointer | `GET /sessions/:id` → `current_track_index` |
| Track title / artist | Track metadata (shared `FlowTrackRef` + local catalog) |
| Audio URL | `GET /tracks/:id/audio` |

### Live WebSocket

Type definitions: `packages/shared/src/live.ts`

| Message | UI update |
|------|---------|
| `{ type: "transcript", role, text }` | TranscriptPanel append/update |
| `{ type: "phase", phase, track_index }` | Stage state, crossfade indicator, track-switch animation |
| `{ type: "tracklist_updated", remaining }` | Update queue UI (Phase 1 can be just a toast / subtle indicator) |
| `{ type: "intent", intent }` | `pause_playback` → sync the pause button |
| `{ type: "error", message }` | Non-blocking banner |
| Binary PCM | Does not affect UI layout, only drives the Analyser + playback |

### Phase → UI State Machine

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

## Desktop Adaptation

> Phase 1's primary target is **Desktop Chrome**, but **the UI form factor is still the phone mock** (single-column Stage + Sheet).
> Desktop ≠ immediately building a wide-screen dashboard; first **center a phone frame**, then expand to a second column if needed.

### Strategy Overview

| Stage | Viewport | Approach |
|------|------|------|
| **Phase 1 Demo** | Desktop ≥768px | Centered **Phone Frame** (width 390–430px, height `min(100dvh, 844px)`), light-gray surrounding background |
| **Phase 1 Demo** | Narrow desktop window / tablet | Same as phone: frame flush to edges or slightly inset |
| **Phase 2** | Desktop ≥1024px | Optional **two-column**: left Stage+waveform, right Sheet+transcript+playlist |
| **Phase 2** | Real mobile browser | Drop the frame shell, full-width flush to edges (see "Responsive Breakpoints" below) |

**Principles**

1. **One set of components, multiple layout wrappers** — do not duplicate the React tree for desktop.
2. **Content width is capped** — the Stage / Sheet visual width is not stretched into a "horizontal bar player" on wide screens.
3. **Dual-track interaction** — touch sizing is preserved; desktop adds keyboard / hover on top, but nothing is **hover-only**.
4. **Audio logic is layout-independent** — crossfade, WS, and gesture-start rules don't change (`auracle_pwa_audio_notes.md`).

### Phase 1: Phone Frame (recommended default)

On desktop, the user sees a **centered "phone preview frame"**, with the mock's proportions unchanged:

```
┌──────────────────────────────────────── desktop viewport ────┐
│  #F4F4F5 or --page-bg                                         │
│     ┌─────────────────────────┐                               │
│     │  Phone Frame 430×844    │  ← box-shadow + radius optional│
│     │  ┌───────────────────┐  │                               │
│     │  │ Stage             │  │                               │
│     │  │ Sheet + Transcript│  │                               │
│     │  │ Mini bar          │  │                               │
│     │  └───────────────────┘  │                               │
│     └─────────────────────────┘                               │
└──────────────────────────────────────────────────────────────┘
```

**CSS skeleton**

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
  /* optional on desktop */
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

**Height allocation (inside the frame)**

| Region | Portrait | Short desktop window (`max-height` constrained) |
|------|------|-------------------------------|
| Stage | `35%` or `min(280px, 35vh)` | Reduced to `min(200px, 25vh)` |
| Sheet | `flex: 1; min-height: 0; overflow: hidden` | Same, Transcript scrolls internally |
| Mini bar | Fixed `~64px` + safe-area | Unchanged |

Don't use `height: 35vh` for the Stage and let it fill half the screen on a large monitor; inside the frame, use a **percentage or a max-height cap**.

### Phase 1: Desktop Interaction Enhancements

With the phone frame unchanged, these can be added:

| Capability | Implementation |
|------|------|
| **Keyboard** | `Space` pause/resume; `Escape` closes an overlay (if any) |
| **Hover** | Pause button, progress-bar thumb: `opacity` / `scale` over 150ms (only shown when it adds value) |
| **Focus** | Tab order: Start → Pause → Transcript scroll region; visible focus ring |
| **Cursor** | `cursor: pointer` on clickable elements |
| **Mic** | Chrome address-bar permission; UI shows an "allow microphone" banner |
| **Resize** | Frame width `clamp(320px, 100%, 430px)`; when height is short, compress Stage first |

**Do not** build in Phase 1: a side playlist drawer, a multi-column track grid, or a hover-only control with no alternative.

### Phase 2: Wide-Screen Two-Column (optional)

When there's a need to show the **remaining tracklist** or a longer caption history, switch layout mode at ≥1024px:

```
┌────────────────────────────────────────────────────────────┐
│  page-bg                                                    │
│  ┌──────────────────────┬───────────────────────────────┐ │
│  │  Stage + large waveform │  Sheet                        │ │
│  │  (max ~480px)         │  · Title / progress             │ │
│  │  DJ state / timer      │  · Transcript (taller viewport) │ │
│  │                       │  · Track queue (remaining)      │ │
│  └──────────────────────┴───────────────────────────────┘ │
│  Mini bar spans both columns or just the right one            │
└────────────────────────────────────────────────────────────┘
```

Implementation:

```tsx
// Same set of sub-components, wrapper switches
<div className={isWide ? 'layout-split' : 'layout-phone'}>
  <StageHeader />
  <ContentSheet showQueue={isWide} />
  <MiniControlBar />
</div>
```

- `isWide = matchMedia('(min-width: 1024px)').matches`
- When split, Stage is fixed-width or `1fr`, Sheet is `1.2fr`; **token colors/fonts stay unchanged**
- `<768px` still goes phone / full-width, split is not enabled

### Responsive Breakpoints (summary)

| Breakpoint | Width | Layout | Notes |
|------|------|--------|------|
| **xs** | `< 375` | Full-width frame | Minimum support 320; caption font size no smaller than 14px |
| **sm** | `375 – 767` | Full-width, no shadow | Real mobile PWA, Phase 2 |
| **md** | `768 – 1023` | Centered phone frame | **Phase 1 Desktop default** |
| **lg** | `1024 – 1439` | Frame or split (Phase 2 toggle) | Common dev-machine size |
| **xl** | `≥ 1440` | Same as lg, frame still capped at 430 (or split total width capped at ~960) | Whitespace on both sides for ultrawide |

**Landscape (mobile landscape / short desktop window)**

- Stage `max-height: 25%`
- Transcript `flex: 1` must scroll
- Mini bar stays fixed to the bottom

### Design Tokens (desktop additions)

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

### Acceptance Checklist (Desktop Chrome)

- [ ] 1920×1080: frame centered, whitespace on both sides, no horizontal scroll
- [ ] 1280×720: frame fully visible at full height, caption area scrolls
- [ ] Window dragged narrow to 400px: layout doesn't break, controls still clickable
- [ ] Tab can focus pause; Space toggles playback
- [ ] First click on Start still resumes AudioContext + connects WS
- [ ] DevTools device emulation at 375×812 shares the same component tree as desktop

---

## Responsive & Layout (Mobile-First)

Mobile-first design; **see the previous section "Desktop Adaptation" for desktop**.

| Breakpoint | Behavior |
|------|------|
| `< 768px` | Full-width single column, sheet flush to bottom, no frame decoration |
| `≥ 768px` | Centered phone frame + `--page-bg` |
| Landscape | Stage height reduced to ~25%, caption area scrolls |

**Safe area**: Stage top and `MiniControlBar` bottom use `env(safe-area-inset-*)` (PWA / real devices).

---

## Accessibility (Required)

| Item | Requirement |
|----|------|
| Contrast | Body text 4.5:1; the Live green dot needs 3:1+ even on a dark background |
| Touch | All controls ≥ **44×44px**; icons can be visually 24px + padding |
| Focus | Visible focus ring (2–4px, `--accent-live` or `--ring`) |
| Screen reader | Status line uses `aria-live="polite"`; announces Speaking changes |
| Motion | Respect `prefers-reduced-motion` |
| Color | Speaking is never conveyed by the green dot alone — it must be paired with the "Speaking…" copy |

---

## Implementation Slices (apps/web)

Aligned with the `auracle_api_protocol.md` checklist:

| Priority | Slice | Deliverable |
|--------|------|------|
| **P0** | Shell + tokens | Vite + React, `--*` CSS variables, phone frame |
| **P0** | ContentSheet | Title, progress, pause (mock data) |
| **P1** | StageHeader | State machine + large waveform (mock analyser) |
| **P1** | Session integration | `POST /sessions`, `GET /tracks/.../audio` |
| **P2** | TranscriptPanel | WS `transcript` + scroll + active styling |
| **P2** | Live audio | PCM + crossfade (`auracle_pwa_audio_notes.md`) |
| **P3** | Texture | Dot-grid background, Display font |
| **P3** | MiniControlBar | Synced with master progress |
| **P4** | Word-level pill highlighting | Depends on transcript timestamps (do it if available) |

**Tech stack (locked)**: Vite + React + TypeScript; **CSS Modules** (component styles) + `index.css` (global tokens / reset). Tailwind is not used.
Dev proxy: `/sessions`, `/tracks` → `:3000` (see `auracle_pwa_audio_notes.md` §Pitfall 4).

---

## Anti-Patterns (Avoid)

| Don't | Why |
|------|------|
| Pure full-screen dark | Doesn't match the mock; hurts track-info readability |
| Overusing multiple accent colors | Breaks the "red = ON AIR, green = DJ turn" layering |
| Red/green for Play/Pause | Competes semantically with ON AIR / error states |
| Hard-cutting between two `<audio>` tags | See the audio doc |
| Hover-only interactions | No hover on mobile |
| Changing the waveform's DOM `height` every frame | Perf / jank |
| Connecting the WS before a user gesture | Chrome's autoplay policy |

---

## Related Docs

| Doc | Content |
|------|------|
| [auracle_pwa_audio_notes.md](auracle_pwa_audio_notes.md) | AudioContext, crossfade, PCM |
| [auracle_api_protocol.md](auracle_api_protocol.md) | REST + WS fields |
| [auracle_architecture_storage.md](auracle_architecture_storage.md) | Overall demo architecture |

---

## Changelog

| Date | Note |
|------|------|
| 2026-06-06 | Initial version: tokens, components, data binding, and implementation slices distilled from the reference mock |
| 2026-06-06 | Added "Desktop Adaptation": Phase 1 phone frame, Phase 2 two-column, breakpoints and acceptance criteria |
| 2026-06-06 | Defined "episode number" = the `vol. N` inside Flow's `session_title` + the `session_subtitle` arc meta |
| 2026-06-06 | Locked frontend styling: CSS Modules + global tokens; StageWaveform uses `useWaveform` + `data-wave-bar` |
| 2026-06-06 | StageWaveform wired to the master bus `AnalyserNode`; removed mock random animation; waveform is idle during the `curating` phase |
