# Auracle — Catalog Context

The offline music library: fictional **Artists**, **Albums** with cover art, and instrumental **Tracks**
each carrying a short **Lore** blurb. Playback and Flow still schedule individual tracks.

## Language

**Track**:
A single playable instrumental in the library, with tags (mood, scene, energy, genre) and a file on disk.
_Avoid_: song (when meaning the whole product), clip, media item.

**Artist**:
A fictional performer or producer with a stable persona (name, bio, aesthetic); tracks are credited to one artist.
_Avoid_: singer (implies vocals — we stay instrumental), creator, user.

**Album**:
A named collection of tracks by one artist, with a cover image and optional album-level concept blurb.
Purely for credit and UI — Flow still schedules individual **Tracks**, not whole albums.
_Avoid_: playlist, session, release (unless speaking about the offline pipeline output).

**Album cover**:
The square artwork image for an album, generated offline and shown in the listener UI.
_Avoid_: thumbnail, artwork (too generic).

**Lore**:
A short backstory (roughly two to four sentences) attached to a track — where it "came from," mood, or scene —
used by the DJ and the content UI for immersion; not spoken verbatim as a script.
_Avoid_: synopsis, description, prompt.

## Relationships

- An **Artist** releases one or more **Albums**; each **Album** belongs to exactly one **Artist**.
- An **Album** contains one or more **Tracks**; each **Track** belongs to exactly one **Album** and one **Artist**.
- Each **Track** has its own **Lore**; an **Album** may additionally have a concept blurb (not **Lore**).
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
