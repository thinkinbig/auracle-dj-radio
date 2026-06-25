import type { TastePreference } from "@auracle/shared";
import { config } from "./config.js";
import { loadCatalogIndex, type CatalogIndex } from "./catalog-index.js";
import { resolvePreferences } from "./taste.js";
import { TasteStore } from "./taste-store.js";

/**
 * Offline `taste:migrate` (Epic #3, S4 — design §5). On a `catalogRevision`
 * change, re-resolve every stored preference against the current catalog:
 *
 * - genre / artist / album are keyed by *stable slug*, so they survive id churn
 *   from `catalog:compose` — they stay `active` as long as the slug exists.
 * - track preferences are keyed by `trackId`; a removed track becomes `orphaned`.
 *
 * Idempotent: with `prune`, orphaned rows are deleted, so a second run reports
 * zero orphans. mem0 facts are never touched (design §5).
 */
export interface UserMigration {
  userId: string;
  active: TastePreference[];
  orphaned: TastePreference[];
}

/** Partition one user's prefs into active/orphaned against the live catalog (pure). */
export function planMigration(prefs: TastePreference[], catalog: CatalogIndex): Omit<UserMigration, "userId"> {
  const resolved = resolvePreferences(prefs, catalog);
  return {
    active: resolved.filter((p) => p.status === "active"),
    orphaned: resolved.filter((p) => p.status === "orphaned"),
  };
}

/** Run the migration across all users; prunes orphaned rows when `prune` is set. */
export function runMigration(store: TasteStore, catalog: CatalogIndex, options: { prune: boolean }): UserMigration[] {
  const report: UserMigration[] = [];
  for (const userId of store.listUserIds()) {
    const { active, orphaned } = planMigration(store.getProfile(userId).preferences, catalog);
    if (options.prune) {
      for (const o of orphaned) store.deletePreference(userId, o.entityType, o.entityId);
    }
    report.push({ userId, active, orphaned });
  }
  return report;
}

function main(): void {
  const prune = process.argv.includes("--prune");
  const store = new TasteStore(config.tastePrefsDbPath);
  const catalog = loadCatalogIndex();
  try {
    const report = runMigration(store, catalog, { prune });
    const orphanTotal = report.reduce((n, u) => n + u.orphaned.length, 0);
    console.log(`taste:migrate · revision ${catalog.revision} · ${report.length} user(s) · ${orphanTotal} orphaned${prune ? " (pruned)" : ""}`);
    for (const u of report.filter((u) => u.orphaned.length > 0)) {
      const items = u.orphaned.map((o) => `${o.entityType}:${o.entityId}`).join(", ");
      console.log(`  ${u.userId}: ${u.orphaned.length} orphaned → ${items}`);
    }
    if (!prune && orphanTotal > 0) console.log("Re-run with --prune to remove orphaned rows.");
  } finally {
    store.close();
  }
}

// Run only when invoked as the CLI entry (not when imported by tests, where
// process.argv[1] is the vitest binary).
if (/taste-migrate\.(ts|js)$/.test(process.argv[1] ?? "")) {
  main();
}
