import { readFileSync, writeFileSync } from "node:fs";
import { slugify, type CatalogManifest } from "@auracle/shared";
import { defaultManifestPath, loadGenreTaxonomy, writeCatalogRevision } from "./manifest.js";

/**
 * Additive, idempotent catalog backfill for structured taste (Epic: structured
 * taste profile, S1). Stamps a stable `slug` onto every artist/album and a
 * `genreSlug` onto every track using the checked-in `genre_taxonomy.json` mapping
 * — preserving every existing field and all track `id` values. Re-running is a
 * no-op once the manifest is fully backfilled.
 *
 *   pnpm --filter @auracle/catalog backfill
 */

/** Assign a unique slug, suffixing `-2`, `-3`… on collision. */
function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base || "untitled";
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function main(): void {
  const path = defaultManifestPath();
  const manifest = JSON.parse(readFileSync(path, "utf8")) as CatalogManifest;
  const taxonomy = loadGenreTaxonomy();

  const errors: string[] = [];
  const validSlugs = new Set(taxonomy.genres.map((g) => g.slug));
  for (const [tag, slug] of Object.entries(taxonomy.mapping)) {
    if (!validSlugs.has(slug)) errors.push(`mapping "${tag}" → "${slug}" is not a taxonomy genre`);
  }

  let artistsStamped = 0;
  let albumsStamped = 0;
  let tracksStamped = 0;

  const artistSlugs = new Set<string>();
  for (const a of manifest.artists) {
    if (a.slug) artistSlugs.add(a.slug);
  }
  for (const a of manifest.artists) {
    if (!a.slug) {
      a.slug = uniqueSlug(slugify(a.name), artistSlugs);
      artistsStamped++;
    }
  }

  const albumSlugs = new Set<string>();
  for (const al of manifest.albums) {
    if (al.slug) albumSlugs.add(al.slug);
  }
  for (const al of manifest.albums) {
    if (!al.slug) {
      al.slug = uniqueSlug(slugify(al.title), albumSlugs);
      albumsStamped++;
    }
  }

  for (const t of manifest.tracks) {
    if (t.genreSlug) continue;
    const slug = taxonomy.mapping[t.genre];
    if (!slug) {
      errors.push(`track ${t.id}: genre "${t.genre}" has no taxonomy mapping`);
      continue;
    }
    t.genreSlug = slug;
    tracksStamped++;
  }

  if (errors.length > 0) {
    console.error("backfill: aborted, manifest unchanged:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  const revision = writeCatalogRevision();

  console.log(
    `backfill: stamped ${artistsStamped} artist + ${albumsStamped} album slug(s), ` +
      `${tracksStamped} genreSlug(s); revision ${revision}`,
  );
}

main();
