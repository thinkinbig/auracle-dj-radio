# Auracle — Catalog Context

The offline music library: fictional **Artists**, **Albums** with cover art, and instrumental **Tracks**
each carrying a short **Lore** blurb. Playback and Flow still schedule individual tracks.

## Language

**Track**:
A single playable instrumental in the library, with tags (mood, scene, energy, genre) and a file on disk.
_Avoid_: song (when meaning the whole product), clip, media item.

**Artist**:
A fictional performer or producer with a stable persona (name, bio, aesthetic); tracks are credited to one artist.
Demo catalog uses **pun stage names** — instant-recognition homophones plus audio/genre puns (e.g. Taylor Drift, Kayan East). Each **Artist** carries `punOf` (who the joke riffs on) and `visualHomage` (era/design language for cover prompts — no celebrity likeness). Homages by sound and visual era, not impersonation.
_Avoid_: singer (implies vocals — we stay instrumental), creator, user.

**Album**:
A named collection of tracks by one artist, with a cover image and optional album-level concept blurb.
Purely for credit and UI — Flow still schedules individual **Tracks**, not whole albums.
_Avoid_: playlist, session, release (unless speaking about the offline pipeline output).

**Artist photo**:
Square press-portrait of the fictional **Artist** — stylized character, not a celebrity likeness.
Generated offline via MiniMax; served at `/artists/:file` and shown in the now-playing UI beside the artist credit.
_Avoid_: avatar (too generic for product copy), headshot (implies real person).

**Album cover**:
The square artwork image for an album, generated offline and shown in the listener UI.
Pipeline: **MiniMax** `image-01` generates background art (no text); **sharp** composites artist + album title in DejaVu Sans.
Prompts use `punOf` + `visualHomage` so the model evokes the reference era without celebrity likeness.
_Avoid_: thumbnail, artwork (too generic).

**Lore**:
A short backstory (roughly two to four sentences) attached to a track — where it "came from," mood, or scene —
used by the DJ and the content UI for immersion; not spoken verbatim as a script.
In **curator** host mode the DJ may borrow one short phrase (about fifteen words); other modes do not use lore.
The UI may show the full lore text alongside the **Album cover**.
_Avoid_: synopsis, description, prompt.

## Relationships

- An **Artist** releases one or more **Albums**; each **Album** belongs to exactly one **Artist**.
- An **Album** contains one or more **Tracks**; each **Track** belongs to exactly one **Album** and one **Artist**.
- Each **Track** has its own **Lore**; an **Album** may additionally have a concept blurb (not **Lore**).
- An **Artist** has exactly one **Artist photo**.
- An **Album** has exactly one **Album cover**.

## Example dialogue

> **Dev:** "Flow picked three tracks from the same **Album** — is that a bug?"
> **Domain expert:** "No. **Album** is for credit and UI; Flow still picks **Tracks** individually for the energy arc. Same **Album** twice in one session is fine if the arc allows it."

> **Dev:** "Can the DJ read the full **Lore** on air?"
> **Domain expert:** "No — **Lore** is source material. The DJ may borrow one evocative phrase, not recite it."

## Flagged ambiguities

- "artist" on the existing `Track` row is a display string — resolved: migrate to **Artist** entity; track holds `artistId` plus denormalized display name.
- "AI singer" was used for fictional performers — resolved: **Artist** personas for instrumental catalog; no vocal generation in this scope.
- Whether **Album** constrains Flow scheduling — resolved: **presentation-only**; same album may appear multiple times in one session if the arc allows.
- Initial catalog scale — resolved: **~40–48 tracks**, **3–4 artists**, **6–8 albums**; migrate existing 16 tracks first (Batch 0), then compose ~24–32 new tracks (Batch 1).
- How **Lore** reaches the listener — resolved: **split** — UI shows cover + full lore; DJ uses lore only in **curator** mode, one evocative phrase, never verbatim.
