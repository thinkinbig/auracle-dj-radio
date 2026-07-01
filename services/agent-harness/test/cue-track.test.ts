import { describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID, type PlannedTrack, type TrackMeta, type Voicing } from "@auracle/shared";
import type { MusicEngineClient, PlanResponse } from "@auracle/clients";
import { resolveCueTrack } from "../src/session/delivery/cue-track.js";
import { SessionStore } from "../src/session/state.js";

const EMPTY_VOICING: Voicing = { artistPersona: "", albumConcept: "", lore: "" };

/** A seeded (external) slot: self-describing — inline metadata + resolved voicing on the slot. */
function seedSlot(energy: 1 | 2 | 3 | 4 | 5, voicing: Voicing = EMPTY_VOICING): PlannedTrack {
  return {
    id: "spotify:track:1",
    uri: "spotify:track:1",
    flow_position: 1,
    reason: "r",
    title: "Spotify Song",
    artist: "Spotify Artist",
    albumTitle: "Spotify Album",
    albumCoverUrl: "https://img/1.jpg",
    durationSec: 200,
    energy,
    voicing,
  };
}

/** A music client whose getTrack must never be reached for a seeded slot. */
const throwingMusic: MusicEngineClient = {
  planTracklist: async (): Promise<PlanResponse> => {
    throw new Error("unused");
  },
  searchCatalog: async () => ({ candidates: [] }),
  getTrack: async () => {
    throw new Error("getTrack must not be called for a seeded slot");
  },
};

function stateWith(store: SessionStore, tracklist: PlannedTrack[]) {
  return store.create({
    userId: ANONYMOUS_USER_ID,
    intent: { mood: "calm", scene: "studying", duration_min: 25 },
    condition: "C",
    tieBreakSeed: "seed",
    title: "T",
    subtitle: "S",
    arc: "build",
    tracklist,
    candidatesById: new Map(),
    mem0Context: "",
  });
}

describe("resolveCueTrack (#75)", () => {
  it("builds a seeded CueTrack from inline metadata + resolved voicing, without hitting the catalog", async () => {
    const store = new SessionStore();
    const slot = seedSlot(4, {
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
      lore: "Cut in one take at 3am",
    });
    const state = stateWith(store, [slot]);

    const cue = await resolveCueTrack(throwingMusic, state, state.tracklist[0]);

    expect(cue).toEqual({
      title: "Spotify Song",
      artist: "Spotify Artist",
      albumTitle: "Spotify Album",
      energy: 4,
      tempo: 0,
      genre: "",
      lore: "Cut in one take at 3am",
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
    });
  });

  it("leaves voicing fields undefined when the slot carries empty voicing (DJ falls back to title/artist)", async () => {
    const store = new SessionStore();
    const state = stateWith(store, [seedSlot(3)]); // empty voicing

    const cue = await resolveCueTrack(throwingMusic, state, state.tracklist[0]);

    expect(cue).toMatchObject({ title: "Spotify Song", artist: "Spotify Artist", energy: 3 });
    expect(cue?.artistPersona).toBeUndefined();
    expect(cue?.albumConcept).toBeUndefined();
    expect(cue?.lore).toBeUndefined();
  });

  it("resolves a catalog (local:) slot through the catalog (getTrack)", async () => {
    const store = new SessionStore();
    const meta: TrackMeta = {
      id: "a",
      title: "Local Track",
      artist: "Local Artist",
      artistId: "ar1",
      albumId: "al1",
      albumTitle: "Local Album",
      albumCoverUrl: "/covers/a.jpg",
      artistPhotoUrl: "/artists/ar1.jpg",
      lore: "A gentle opener.",
      artistPersona: "Night-owl producer.",
      albumConcept: "3am ambient.",
      energy: 2,
      tempo: 70,
      genre: "ambient",
      mood: "calm",
      scene: "studying",
      filePath: "data/audio/a.mp3",
      introOffsetMs: null,
    };
    const music: MusicEngineClient = { ...throwingMusic, getTrack: async (id) => (id === "a" ? meta : undefined) };
    const localSlot: PlannedTrack = {
      id: "a",
      uri: "local:a",
      flow_position: 1,
      reason: "r",
      title: "",
      artist: "",
      albumTitle: "",
      albumCoverUrl: "",
      durationSec: 0,
      energy: 2,
      voicing: EMPTY_VOICING,
    };
    const state = stateWith(store, [localSlot]);

    const cue = await resolveCueTrack(music, state, state.tracklist[0]);

    expect(cue).toMatchObject({ title: "Local Track", artist: "Local Artist", energy: 2, tempo: 70, genre: "ambient" });
  });

  it("returns undefined for a missing slot", async () => {
    const store = new SessionStore();
    const state = stateWith(store, [seedSlot(3)]);
    expect(await resolveCueTrack(throwingMusic, state, undefined)).toBeUndefined();
  });
});
