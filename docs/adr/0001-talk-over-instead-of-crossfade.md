# Talk-over the track intro instead of a between-track crossfade

`doc/auracle_pwa_audio_notes.md` §Pitfall 2 originally specified a radio-style
between-track crossfade: at track end the music fades fully to 0, the DJ
speaks in the gap, then a ~2s crossfade brings the next track up. We instead
duck the music to ~0.25 and let the DJ **talk over the intro of the
now-playing track**, with ~0.4s smooth ramps.

We chose talk-over because it works with a single `<audio>` element and one
`MediaElementSource` (a true A/B crossfade needs a second audio source), keeps
the DJ cue at track start where the relay already sends it, and gives a tighter
~0.4s feel rather than ~2.5s. The cost: there is no true song-to-song
crossfade — a manual skip dips the music to silence for ~0.2s rather than
blending tracks.

## Consequences

- Manual **skip track** uses a ~0.2s music dip → swap source → fade back in; natural track end stays gapless.
- **Skip voice-over** cuts the DJ turn via a `skip_dj` client frame: the relay stops forwarding the turn's audio/transcript, emits `dj_turn_end` (not a barge-in, so the UI returns to playing rather than listening), and best-effort interrupts Gemini with `sendClientContent({ turnComplete: false })` to save tokens. (We can't use `activityStart`/`activityEnd` — those require automatic VAD to be disabled, and the relay runs with default automatic VAD.)
