import { describe, it, expect } from "vitest";
import type { TrackRow } from "../src/db/index.js";
import { HashEmbedder } from "../src/flow/embedder.js";
import { retrieveCandidates } from "../src/flow/retrieve.js";

// Minimal track builder for tests.
function makeTrack(id: string, mood: string, scene: string, overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    id,
    title: id,
    artist: "test",
    artistId: "a-test",
    albumId: "alb-test",
    albumTitle: "Test Album",
    lore: "",
    albumCoverPath: "data/covers/test.svg",
    artistPhotoPath: "data/artists/a-test.jpg",
    energy: 2,
    tempo: 90,
    genre: "lo-fi",
    mood,
    scene,
    filePath: `/tracks/${id}.mp3`,
    introOffsetMs: null,
    instrumental: true,
    embedding: null,
    ...overrides,
  };
}

const embedder = new HashEmbedder();

async function withEmbeddings(tracks: TrackRow[]): Promise<TrackRow[]> {
  return Promise.all(tracks.map(async (t) => ({ ...t, embedding: await embedder.embedTrack(t) })));
}

describe("retrieveCandidates", () => {
  it("ranks tracks with matching mood/scene higher than unrelated ones", async () => {
    const tracks = await withEmbeddings([
      makeTrack("match", "calm", "study"),
      makeTrack("unrelated", "energetic", "gym"),
    ]);
    const results = await retrieveCandidates(embedder, tracks, { mood: "calm", scene: "study" });
    expect(results[0]?.id).toBe("match");
  });

  it("returns at most limit candidates", async () => {
    const tracks = await withEmbeddings(
      Array.from({ length: 30 }, (_, i) => makeTrack(`t${i}`, "calm", "study")),
    );
    const results = await retrieveCandidates(embedder, tracks, { mood: "calm", scene: "study", limit: 5 });
    expect(results).toHaveLength(5);
  });

  it("excludes ids in the exclusion set", async () => {
    const tracks = await withEmbeddings([
      makeTrack("a", "calm", "study"),
      makeTrack("b", "calm", "study"),
    ]);
    const results = await retrieveCandidates(embedder, tracks, {
      mood: "calm",
      scene: "study",
      excludeIds: new Set(["a"]),
    });
    expect(results.map((r) => r.id)).not.toContain("a");
  });

  it("skips tracks without an embedding silently", async () => {
    const tracks = [
      makeTrack("no-embed", "calm", "study"), // embedding: null
      ...(await withEmbeddings([makeTrack("with-embed", "calm", "study")])),
    ];
    const results = await retrieveCandidates(embedder, tracks, { mood: "calm", scene: "study" });
    expect(results.map((r) => r.id)).toContain("with-embed");
    expect(results.map((r) => r.id)).not.toContain("no-embed");
  });

  it("throws when query and track embedding dimensions differ", async () => {
    // Track embedded at 3-dim, query will be HashEmbedder's 768-dim → mismatch.
    const tracks = [makeTrack("bad", "calm", "study", { embedding: [1, 0, 0] })];
    await expect(
      retrieveCandidates(embedder, tracks, { mood: "calm", scene: "study" }),
    ).rejects.toThrow(/dimension mismatch/);
  });
});
