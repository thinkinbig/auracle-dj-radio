# Catalog expansion — 100 tracks

> Status: **Batch 1 metadata landed** (t31–t42, audio pending).  
> Balance QA: `pnpm --filter @auracle/catalog catalog-balance-check`

## Principles

1. **Session mood** → `track.energy` only (Gaussian envelope). `track.mood` is display/DJ copy.
2. **Session scene** → exact match +1 in retrieval.
3. **Structured taste** → `genreSlug` / `artistSlug` / `albumSlug` / `trackId`; genre prefer is much stronger than artist prefer.
4. Each **genre slug** needs **≥2 artists** at ~10 tracks so genre taste ≠ artist taste.
5. Each **artist** needs **≥4 tracks** in their home-mood envelope so `prefer artist` is audible.

## Scale

| | Now (Batch 1) | Target |
|---|---------------|--------|
| Tracks | 42 (t01–t42) | 100 |
| Artists | 6 | 12 |
| Albums | 9 | ~21 |

## Artist roster & home mood

| Artist | Slug | Home mood | Target tracks | Primary genres |
|--------|------|-----------|---------------|----------------|
| Lana Del Delay | `lana-del-delay` | calm | 10 | ambient, lo-fi, downtempo |
| Jay-Zzz | `jay-zzz` | mellow | 10 | chillhop, lo-fi |
| Billie Eyelid | `billie-eyelid` | focused | 6 | ambient, lo-fi |
| Fleetwood Macchiato | `fleetwood-macchiato` | mellow | 5 | lo-fi, chillhop |
| Adele Lay | `adele-lay` | warm | 5 | downtempo, ambient |
| Justin Tiger | `justin-tiger` | uplifting | 10 | jazztronica |
| Drake & Bake | `drake-and-bake` | mellow | 6 | future-garage, deep-house |
| Radioheadache | `radioheadache` | focused | 4 | ambient, downtempo |
| Kayan East | `kayan-east` | energetic | **14 cap** | house, nu-disco, deep-house, future-garage |
| Dua Lift-a | `dua-lift-a` | euphoric | 8 | nu-disco, house |
| Taylor Drift | `taylor-drift` | energetic | 10 | synthwave |
| The Bee Geeps | `the-bee-geeps` | uplifting | 4 | house, nu-disco |

## Genre × artist (second-source rule)

| Genre | Artist A | Artist B |
|-------|----------|----------|
| ambient | Lana Del Delay | Billie Eyelid |
| lo-fi | Lana Del Delay | Fleetwood Macchiato |
| downtempo | Lana / Kayan | Adele Lay |
| chillhop | Jay-Zzz | Fleetwood Macchiato |
| jazztronica | Justin Tiger | — |
| deep-house | Kayan East | Drake & Bake |
| future-garage | Kayan East | Drake & Bake |
| house | Kayan / Dua Lift-a | The Bee Geeps |
| nu-disco | Kayan / Dua Lift-a | — |
| synthwave | Taylor Drift | — |

## Batches

### Batch 1 — 42 tracks ✅ metadata (t31–t42)

| ID | Title | Artist | Album | E | Scene | Genre |
|----|-------|--------|-------|---|-------|-------|
| t31 | Desk Fog | Jay-Zzz | Snooze Protocol | 1 | study | lo-fi |
| t32 | Library Loop | Jay-Zzz | Snooze Protocol | 1 | study | ambient |
| t33 | Pillow Logic | Jay-Zzz | Snooze Protocol | 2 | focus | chillhop |
| t34 | Last Platform | Justin Tiger | Night Shift Stripes | 2 | commute | jazztronica |
| t35 | Fluorescent Pocket | Justin Tiger | Night Shift Stripes | 3 | commute | jazztronica |
| t36 | Tiger Focus | Justin Tiger | Night Shift Stripes | 3 | focus | jazztronica |
| t37 | Warm Set | Dua Lift-a | Future Nostalgia Rep | 3 | gym | nu-disco |
| t38 | Squat Drop | Dua Lift-a | Future Nostalgia Rep | 4 | gym | house |
| t39 | PR Hour | Dua Lift-a | Future Nostalgia Rep | 5 | gym | nu-disco |
| t40 | Dancefloor Rep | Dua Lift-a | Future Nostalgia Rep | 5 | party | house |
| t41 | Mirror Ballast | Dua Lift-a | Future Nostalgia Rep | 4 | party | nu-disco |
| t42 | One More Set | Dua Lift-a | Future Nostalgia Rep | 5 | party | nu-disco |

### Batch 2 — 60 tracks (+18)

| Slot | Artist | Album (new) | Tracks | Fills |
|------|--------|-------------|--------|-------|
| 6 | Billie Eyelid | When We All Fall Asleep, the Desk Stays | 6 | focus/study E1–3 |
| 4 | Jay-Zzz | (Blueprint Nap vol. 2) | 4 | study/chill |
| 4 | Lana Del Delay | Echo Chamber | 4 | calm study/chill |
| 4 | Justin Tiger | (Suit & Stripes vol. 2) | 4 | commute/focus |

### Batch 3 — 80 tracks (+20)

| Slot | Artist | Album | Tracks | Fills |
|------|--------|-------|--------|-------|
| 6 | Drake & Bake | More Life, Less Heat | 6 | chill/commute garage |
| 5 | Adele Lay | 21 Grams of Nap | 5 | warm chill/commute |
| 5 | Taylor Drift | Midnight Touge | 5 | synthwave E3–5 |
| 4 | Kayan East | (East EP) | 4 | gym/party (under cap) |

### Batch 4 — 100 tracks (+20)

| Slot | Artist | Album | Tracks | Fills |
|------|--------|-------|--------|-------|
| 5 | Fleetwood Macchiato | Rumours & Foam | 5 | lo-fi/chillhop 2nd source |
| 4 | The Bee Geeps | Saturday Night Fever Dream | 4 | party E4–5 |
| 4 | Radioheadache | OK Computer, Not OK Back | 4 | focus E2–4 |
| 7 | Spread | existing artists | 7 | grid holes per balance-check |

## QA

```bash
# Progress toward 100 (warnings expected until complete)
pnpm --filter @auracle/catalog catalog-balance-check --goal 100

# Covers / artist photos (Gemini Image — see doc/catalog_music_generation.md)
pnpm --filter @auracle/catalog generate-covers --all --dry-run
pnpm --filter @auracle/catalog generate-covers --all
# Skips t01–t30 if MP3 exists and manifest unchanged; only missing or edited rows run.
pnpm --filter @auracle/catalog generate-tracks --track t31 --dry-run
pnpm --filter @auracle/catalog generate-tracks --all
```

After audio lands for a batch:

```bash
pnpm --filter @auracle/catalog export-catalog
pnpm --filter @auracle/music-engine seed
```

## Related

- `doc/catalog_music_generation.md` — MiniMax CLI + prompt diversity
- `doc/auracle_structured_taste_design.md` — taste entity keys
- `docs/adr/0001-deterministic-structured-selection.md` — mood → energy
- `packages/catalog/src/catalog-balance.ts` — scoring mirror of `retrieve.ts`
