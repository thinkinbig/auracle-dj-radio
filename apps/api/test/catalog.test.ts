import { describe, it, expect } from "vitest";
import {
  buildRichEmbedText,
  loadCatalogManifest,
  manifestToTracks,
  toTrackMeta,
  tracksWithAssets,
} from "../src/catalog/manifest.js";

describe("catalog manifest", () => {
  it("loads Batch 0 with 16 tracks and 5 pun artists", () => {
    const manifest = loadCatalogManifest();
    expect(manifest.artists).toHaveLength(5);
    expect(manifest.albums).toHaveLength(6);
    expect(manifest.tracks).toHaveLength(16);
    expect(manifest.artists.map((a) => a.name).sort()).toEqual([
      "Jay-Zzz",
      "Justin Tiger",
      "Kayan East",
      "Lana Del Delay",
      "Taylor Drift",
    ]);
  });

  it("only exposes tracks whose assets exist on disk", () => {
    const tracks = tracksWithAssets();
    expect(tracks).toHaveLength(16);
    expect(tracks.map((t) => t.id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `t${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("joins artist and album onto tracks", () => {
    const tracks = manifestToTracks(loadCatalogManifest());
    const t01 = tracks.find((t) => t.id === "t01");
    expect(t01?.artist).toBe("Lana Del Delay");
    expect(t01?.albumTitle).toBe("Born to Delay");
    expect(t01?.lore).toContain("Lana Del Delay");
    expect(t01?.instrumental).toBe(true);
  });

  it("defaults missing instrumental flag to true", () => {
    const tracks = manifestToTracks(loadCatalogManifest());
    expect(tracks.filter((t) => t.instrumental).length).toBe(11);
    expect(tracks.filter((t) => !t.instrumental).map((t) => t.id).sort()).toEqual([
      "t07",
      "t09",
      "t11",
      "t12",
      "t14",
    ]);
  });

  it("requires lyrics on every vocal track", () => {
    const manifest = loadCatalogManifest();
    const vocal = manifest.tracks.filter((t) => t.instrumental === false);
    expect(vocal).toHaveLength(5);
    for (const track of vocal) {
      expect(track.lyrics?.trim().length, `${track.id} missing lyrics`).toBeGreaterThan(40);
      expect(track.lyrics).toMatch(/\[Chorus\]/);
    }
  });

  it("builds rich embed text with lore", () => {
    const [track] = manifestToTracks(loadCatalogManifest());
    const text = buildRichEmbedText(track);
    expect(text).toContain("artist:");
    expect(text).toContain("lore:");
  });

  it("maps cover and artist photo paths to URLs", () => {
    const [track] = manifestToTracks(loadCatalogManifest());
    const meta = toTrackMeta(track);
    expect(meta.albumCoverUrl).toBe("/covers/alb-lana-delay-midnight.jpg");
    expect(meta.artistPhotoUrl).toBe("/artists/a-lana-delay.jpg");
  });
});
