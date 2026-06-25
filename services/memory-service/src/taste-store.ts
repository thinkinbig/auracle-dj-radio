import Database from "better-sqlite3";
import type { TasteProfile, TastePreference } from "@auracle/shared";

// Per-user structured taste profile (Epic #3, S2 — doc/auracle_structured_taste_design.md §6).
// One profile row per user (free text + revision-at-save) plus a normalized
// preference table keyed by (user_id, entity_type, entity_id) so plan weighting
// (S4) can query polarity/strength directly. Login is required upstream — no
// rows are written for the anonymous identity.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS taste_profile (
  user_id                  TEXT PRIMARY KEY,
  catalog_revision_at_save TEXT,
  free_text                TEXT,
  updated_at               INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS taste_prefs (
  user_id     TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  polarity    TEXT NOT NULL,
  strength    INTEGER,
  source      TEXT NOT NULL,
  PRIMARY KEY (user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_taste_prefs_user ON taste_prefs(user_id);
`;

interface PrefRow {
  entity_type: TastePreference["entityType"];
  entity_id: string;
  polarity: TastePreference["polarity"];
  strength: number | null;
  source: TastePreference["source"];
}

interface ProfileRow {
  catalog_revision_at_save: string | null;
  free_text: string | null;
}

export class TasteStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  /**
   * Load a user's stored profile. Returns an empty (but valid) profile when the
   * user has never saved one. `status`/`resolvedId` are left for the caller to
   * fill against the live catalog (§6: resolution state is not persisted).
   */
  getProfile(userId: string): TasteProfile {
    const profile = this.db
      .prepare(`SELECT catalog_revision_at_save, free_text FROM taste_profile WHERE user_id = ?`)
      .get(userId) as ProfileRow | undefined;

    const rows = this.db
      .prepare(`SELECT entity_type, entity_id, polarity, strength, source FROM taste_prefs WHERE user_id = ?`)
      .all(userId) as PrefRow[];

    const preferences: TastePreference[] = rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      polarity: r.polarity,
      ...(r.strength != null ? { strength: r.strength as 1 | 2 | 3 } : {}),
      source: r.source,
    }));

    return {
      preferences,
      ...(profile?.free_text ? { freeText: profile.free_text } : {}),
      ...(profile?.catalog_revision_at_save ? { catalogRevisionAtSave: profile.catalog_revision_at_save } : {}),
    };
  }

  /**
   * Replace a user's entire profile in one transaction (PUT semantics): clear
   * prior preferences, insert the new set, and stamp the revision at save time.
   */
  saveProfile(
    userId: string,
    preferences: TastePreference[],
    freeText: string | undefined,
    catalogRevision: string,
  ): void {
    const replace = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM taste_prefs WHERE user_id = ?`).run(userId);
      const insert = this.db.prepare(
        `INSERT INTO taste_prefs (user_id, entity_type, entity_id, polarity, strength, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const p of preferences) {
        insert.run(userId, p.entityType, p.entityId, p.polarity, p.strength ?? null, p.source);
      }
      this.db
        .prepare(
          `INSERT INTO taste_profile (user_id, catalog_revision_at_save, free_text, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             catalog_revision_at_save = excluded.catalog_revision_at_save,
             free_text = excluded.free_text,
             updated_at = excluded.updated_at`,
        )
        .run(userId, catalogRevision, freeText ?? null, Date.now());
    });
    replace();
  }

  close(): void {
    this.db.close();
  }
}
