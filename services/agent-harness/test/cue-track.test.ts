import { describe, expect, it } from "vitest";
import { ANONYMOUS_USER_ID, type Energy, type FlowTrackRef, type SpotifyTrackRef, type TrackCandidate, type TrackMeta } from "@auracle/shared";
import type { MusicEngineClient, PlanResponse } from "../src/music-engine-client.js";
import { resolveCueTrack } from "../src/session/delivery/cue-track.js";
import { SessionStore } from "../src/session/state.js";

function spotifyRef(): SpotifyTrackRef {
  return {
    uri: "spotify:track:1",
    title: "Spotify Song",
    artist: "Spotify Artist",
    albumTitle: "Spotify Album",
    albumCoverUrl: "https://img/1.jpg",
    durationSec: 200,
  };
}

/** A music client whose getTrack must never be reached for a Spotify slot. */
const throwingMusic: MusicEngineClient = {
  planTracklist: async (): Promise<PlanResponse> => {
    throw new Error("unused");
  },
  searchCatalog: async () => ({ candidates: [] }),
  getTrack: async () => {
    throw new Error("getTrack must not be called for a Spotify slot");
  },
};

function spotifyState(store: SessionStore, energy: Energy, voicing?: { artistPersona: string; albumConcept: string; lore: string }) {
  const s = spotifyRef();
  const tracklist: FlowTrackRef[] = [{ id: s.uri, flow_position: 1, reason: "r", source: "spotify", spotify: s }];
  const candidatesById = new Map<string, TrackCandidate>([[s.uri, { id: s.uri, energy, tempo: 0, genre: "", scene: "studying" }]]);
  return store.create({
    userId: ANONYMOUS_USER_ID,
    intent: { mood: "calm", scene: "studying", duration_min: 25 },
    condition: "C",
    tieBreakSeed: "seed",
    title: "T",
    subtitle: "S",
    arc: "build",
    tracklist,
    candidatesById,
    mem0Context: "",
    spotifyCandidates: [s],
    spotifyMatchedVoicing: voicing ? { [s.uri]: voicing } : undefined,
  });
}

describe("resolveCueTrack (#75)", () => {
  it("builds a Spotify CueTrack from inline metadata + resolved voicing, without hitting the catalog", async () => {
    const store = new SessionStore();
    const state = spotifyState(store, 4, {
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
      lore: "Cut in one take at 3am",
    });

    const cue = await resolveCueTrack(throwingMusic, state, state.tracklist[0]);

    expect(cue).toEqual({
      title: "Spotify Song",
      artist: "Spotify Artist",
      albumTitle: "Spotify Album",
      energy: 4, // from energyById (catalog-matched or inferred)
      tempo: 0,
      genre: "",
      lore: "Cut in one take at 3am",
      artistPersona: "Neon-lit synthwave nightrider",
      albumConcept: "A long drive through a sleeping city",
    });
  });

  it("leaves voicing fields undefined when none is resolved yet (DJ falls back to title/artist)", async () => {
    const store = new SessionStore();
    const state = spotifyState(store, 3); // no voicing seeded

    const cue = await resolveCueTrack(throwingMusic, state, state.tracklist[0]);

    expect(cue).toMatchObject({ title: "Spotify Song", artist: "Spotify Artist", energy: 3 });
    expect(cue?.artistPersona).toBeUndefined();
    expect(cue?.albumConcept).toBeUndefined();
    expect(cue?.lore).toBeUndefined();
  });

  it("resolves a local slot through the catalog (getTrack)", async () => {
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
    const state = store.create({
      userId: ANONYMOUS_USER_ID,
      intent: { mood: "calm", scene: "studying", duration_min: 25 },
      condition: "C",
      tieBreakSeed: "seed",
      title: "T",
      subtitle: "S",
      arc: "build",
      tracklist: [{ id: "a", flow_position: 1, reason: "r" }],
      candidatesById: new Map(),
      mem0Context: "",
    });

    const cue = await resolveCueTrack(music, state, state.tracklist[0]);

    expect(cue).toMatchObject({ title: "Local Track", artist: "Local Artist", energy: 2, tempo: 70, genre: "ambient" });
  });

  it("returns undefined for a missing slot", async () => {
    const store = new SessionStore();
    const state = spotifyState(store, 3);
    expect(await resolveCueTrack(throwingMusic, state, undefined)).toBeUndefined();
  });
});
