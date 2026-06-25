import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogManifest, TastePreference } from "@auracle/shared";
import { buildCatalogIndex, type CatalogIndex } from "../src/catalog-index.js";
import { planMigration, runMigration } from "../src/taste-migrate.js";
import { TasteStore } from "../src/taste-store.js";

function catalog(artistId: string, trackIds: string[], rev: string): CatalogIndex {
  const manifest = {
    artists: [{ id: artistId, name: "Lana Delay", slug: "lana-del-delay" }],
    albums: [{ id: "al-1", title: "Born to Delay", slug: "born-to-delay", artistId }],
    tracks: trackIds.map((id) => ({ id })),
  } as unknown as CatalogManifest;
  return buildCatalogIndex(manifest, { genres: [{ slug: "lo-fi", label: "Lo-Fi" }], mapping: {} }, rev);
}

const PREFS: TastePreference[] = [
  { entityType: "artist", entityId: "lana-del-delay", polarity: "prefer", source: "onboarding" },
  { entityType: "genre", entityId: "lo-fi", polarity: "prefer", source: "onboarding" },
  { entityType: "track", entityId: "t02", polarity: "avoid", source: "session" },
];

let store: TasteStore;

beforeEach(() => {
  store = new TasteStore(join(mkdtempSync(join(tmpdir(), "taste-migrate-")), "taste.sqlite"));
  store.saveProfile("user-a", PREFS, undefined, "rev-1");
});
afterEach(() => store.close());

describe("taste-migrate", () => {
  it("keeps slug-based prefs active across an artist id change; orphans a removed track", () => {
    // Rebuild: artist keeps its slug but gets a new id; t02 is gone.
    const reloaded = catalog("a-lana-delay-v2", ["t01"], "rev-2");
    const { active, orphaned } = planMigration(store.getProfile("user-a").preferences, reloaded);

    expect(active.map((p) => p.entityType).sort()).toEqual(["artist", "genre"]);
    const artist = active.find((p) => p.entityType === "artist");
    expect(artist?.resolvedId).toBe("a-lana-delay-v2"); // survived the id change via stable slug
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]).toMatchObject({ entityType: "track", entityId: "t02" });
  });

  it("prunes orphans idempotently", () => {
    const reloaded = catalog("a-lana-delay-v2", ["t01"], "rev-2");

    const first = runMigration(store, reloaded, { prune: true });
    expect(first[0]!.orphaned).toHaveLength(1);
    // t02 removed from the store; artist/genre remain.
    expect(store.getProfile("user-a").preferences.map((p) => p.entityId).sort()).toEqual(["lana-del-delay", "lo-fi"]);

    const second = runMigration(store, reloaded, { prune: true });
    expect(second[0]!.orphaned).toHaveLength(0); // idempotent

    expect(runMigration(store, reloaded, { prune: false })[0]!.orphaned).toHaveLength(0);
  });

  it("reports every user with a stored profile", () => {
    store.saveProfile("user-b", [{ entityType: "genre", entityId: "lo-fi", polarity: "avoid", source: "onboarding" }], undefined, "rev-1");
    const report = runMigration(store, catalog("a-lana-delay", ["t01", "t02"], "rev-1"), { prune: false });
    expect(report.map((r) => r.userId).sort()).toEqual(["user-a", "user-b"]);
  });
});
