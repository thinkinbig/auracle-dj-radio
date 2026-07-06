# Auracle DJ Radio

AI radio DJ: real-time voice conversation + energy-arc curation + Spotify-taste personalization. Currently a single-user web-app demo.

## Architecture Overview (current multi-service demo)

```
apps/web (React)
  · Spotify OAuth / taste summary / playback adapter
  · REST ↔ agent-harness
  · Web Audio (local catalog mp3 + DJ voice)
       │
       ▼
agent-harness · music-engine · rt_llm_proxy · profile-service
  · live session / queue / replan
  · deterministic planning
  · Live DJ media bridge
  · auth + session_events
```

See [`doc/`](doc/) for detailed design. Catalog retrieval MVP is deterministic structured scoring ([`docs/adr/0001-deterministic-structured-selection.md`](docs/adr/0001-deterministic-structured-selection.md)). Cross-session taste is provided by Spotify; Auracle only maintains the current live session plus eval/events. The old mem0/Qdrant memory design has been retired — see [`doc/auracle_memory_decision.md`](doc/auracle_memory_decision.md).

## Local Development

```bash
git clone https://github.com/thinkinbig/auracle-dj-radio.git
cd auracle-dj-radio

# Catalog mp3s are stored via Git LFS (install git-lfs before first clone)
git lfs install
git lfs pull

cp .env.example .env          # GEMINI_API_KEY; shared by local pnpm dev and Docker

pnpm install

# One command for the whole stack: music-engine(3010)+profile-service(3020)+agent-harness(3030)+proxy(:8090)+web(:5173)
# Reads GEMINI_API_KEY from the root .env and injects it into each service; Ctrl-C stops the whole group. Ports can be overridden (PROXY_PORT etc.).
pnpm dev                      # → http://localhost:5173
```

The catalog needs no seeding: music-engine loads the manifest from `packages/catalog/data` straight into memory at boot (refuses to start if the catalog is empty). After editing the catalog, just re-export the browser-facing `tracks.json`: `pnpm --filter @auracle/catalog export-catalog`.

### Docker Full Stack (demo defense / single-machine deployment)

```bash
pnpm docker:prod                   # build and start the full stack (reads .env)
# open http://localhost:8080 in a browser (WEB_PORT can be changed)
pnpm docker:down                   # stop containers, keep volumes
```

Compose: `docker-compose.prod.yml` (for demo defense / deployment; only exposes web; no longer starts the old Qdrant/mem0 dependencies).

Phase 1 Demo: **Desktop Chrome**. See `doc/auracle_pwa_audio_notes.md`.

## Documentation Index

### `doc/` — Product / Design Docs

Current docs:

| Doc | Content |
|------|------|
| [auracle_architecture_storage.md](doc/auracle_architecture_storage.md) | Overall architecture, demo vs. production, SQLite, Gemini division of labor |
| [auracle_gemini_integration.md](doc/auracle_gemini_integration.md) | **Deep Gemini integration** (mapped against the Group 24 four pillars) |
| [auracle_api_protocol.md](doc/auracle_api_protocol.md) | REST + Live WS protocol, implementation checklist |
| [auracle_flow_prompt_design.md](doc/auracle_flow_prompt_design.md) | Retrieval + Flow reranking + Live DJ |
| [auracle_personalization_plan.md](doc/auracle_personalization_plan.md) | Spotify taste / in-session adaptation boundary (current personalization product boundary) |
| [auracle_evaluation_design.md](doc/auracle_evaluation_design.md) | User experiments (A/B/C) and objective metrics; the canonical evaluation spec |
| [auracle_feedback_eval_runbook.md](doc/auracle_feedback_eval_runbook.md) | Feedback-loop HITL evaluation runbook |
| [auracle_rolling_station_design.md](doc/auracle_rolling_station_design.md) | Rolling station / on-air queue adjustment design (Epic #19) |
| [auracle_sound_ia.md](doc/auracle_sound_ia.md) | Station & Sound information architecture |
| [auracle_pwa_audio_notes.md](doc/auracle_pwa_audio_notes.md) | Web Audio fades, PCM WS, platform constraints |
| [auracle_ui_design.md](doc/auracle_ui_design.md) | Web UI style, design tokens, components and data binding |
| [catalog_expansion_100.md](doc/catalog_expansion_100.md) | Plan to expand the catalog to 100 tracks |
| [catalog_music_generation.md](doc/catalog_music_generation.md) | MiniMax offline track/cover generation pipeline |
| [auracle_pm_perspective_report.md](doc/auracle_pm_perspective_report.md) | PM-perspective assessment: personas, business metrics (English, for a product proposal report) |

Retired (historical record, not the current plan, kept only to trace prior decisions):

| Doc | Content |
|------|------|
| [auracle_memory_decision.md](doc/auracle_memory_decision.md) | Retirement decision for the old mem0/Qdrant long-term memory design |
| [auracle_structured_taste_design.md](doc/auracle_structured_taste_design.md) | Retirement decision for the old Auracle-owned long-term taste profile design |

### `docs/` — Architecture Decision Records (ADR) and Domain Glossaries

Different purpose from `doc/`: `docs/adr/` is a time-ordered engineering decision log (including superseded records, kept rather than deleted); `CONTEXT.md` / `docs/CONTEXT-catalog.md` are domain glossaries that pin down terminology — see [`CONTEXT-MAP.md`](CONTEXT-MAP.md).

| Doc | Content |
|------|------|
| [CONTEXT.md](CONTEXT.md) | Live Audio domain glossary (DJ turn, talk-over, barge-in, …) |
| [docs/CONTEXT-catalog.md](docs/CONTEXT-catalog.md) | Catalog domain glossary (Track/Artist/Album/Lore) |
| [docs/generated_music_catalog.md](docs/generated_music_catalog.md) | Archive of the catalog's original MiniMax generation prompts (not the runtime metadata source) |
| [docs/adr/0001-deterministic-structured-selection.md](docs/adr/0001-deterministic-structured-selection.md) | Deterministic structured track-selection pipeline |
| [docs/adr/0001-talk-over-instead-of-crossfade.md](docs/adr/0001-talk-over-instead-of-crossfade.md) | Talk-over replacing the between-track crossfade |
| [docs/adr/0002-phased-catalog-embedding.md](docs/adr/0002-phased-catalog-embedding.md) | Phased catalog embedding (superseded by 0001) |
| [docs/adr/0003-catalog-manifest-staged-cli.md](docs/adr/0003-catalog-manifest-staged-cli.md) | Catalog manifest with a staged offline CLI |
| [docs/adr/0004-end-of-track-talk-window.md](docs/adr/0004-end-of-track-talk-window.md) | End-of-track user voice interaction window |
| [docs/adr/0005-mixed-local-spotify-queue.md](docs/adr/0005-mixed-local-spotify-queue.md) | Single queue mixing local and Spotify tracks |

## License

See [LICENSE](LICENSE).
