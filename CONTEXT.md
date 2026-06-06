# Auracle — Live Audio Context

The live layer that weaves a synthesized DJ voice together with music
playback. This glossary fixes the language for how the DJ speaks, how music
gives way to it, and how a listener skips past either.

## Language

**DJ turn** (口播 / voice-over):
A single bounded stretch of synthesized DJ speech. It opens when the DJ
starts speaking and closes on completion, a barge-in, or a skip.
_Avoid_: announcement, narration, segment.

**Talk-over**:
The arrangement where the DJ speaks *over the intro of the now-playing
track* while the music is ducked — not in a silent gap between tracks.
_Avoid_: crossfade, interlude.

**Duck**:
Temporarily lowering the music to a low level (not silence) so the DJ
voice sits on top of it during a talk-over.
_Avoid_: fade-out, mute.

**Cue**:
The signal that makes the DJ speak for a given track — opening, segue, or
outro depending on the track's position.
_Avoid_: prompt, trigger.

**Barge-in**:
The listener interrupting an active DJ turn by speaking into the mic.
_Avoid_: interrupt, cut-in.

**Skip track**:
Advancing to the next track in the tracklist before the current one ends.
_Avoid_: next, forward.

**Skip voice-over**:
Cutting the current DJ turn short while the current track keeps playing.
Distinct from **skip track** — it drops the talk, not the song.
_Avoid_: mute DJ, skip DJ.

## Relationships

- A **Track** beginning playback triggers one **Cue**, which produces one **DJ turn** that **talk-overs** that track's intro.
- During a **DJ turn** the music is **ducked**; the turn ends on completion, a **barge-in**, or a **skip voice-over**, after which the music returns to full.
- A **Skip track** ends the current track (cutting any in-flight **DJ turn**) and begins the next, which **Cues** its own **DJ turn**.

## Example dialogue

> **Dev:** "When the listener hits Next while the DJ is mid-sentence, is that a **skip voice-over** or a **skip track**?"
> **Domain expert:** "Skip track — the song goes too. **Skip voice-over** is the other control: it silences the DJ but keeps the song. After a **skip track** the next song still gets its own **Cue**."

## Flagged ambiguities

- "skip" was used for both **skip track** and **skip voice-over** — resolved: these are distinct controls with distinct effects.
- The DJ↔music relationship was specified two ways: a between-track **crossfade** (in `doc/auracle_pwa_audio_notes.md`) versus **talk-over** ducking (in code). Resolved in favor of **talk-over** — see `docs/adr/0001-talk-over-instead-of-crossfade.md`.
