/**
 * Stable, URL-safe slug from a human name/title. Deterministic: lowercase,
 * ASCII-fold spaces/underscores to hyphens, drop other
 * punctuation, collapse repeats, trim leading/trailing hyphens.
 *   "Lana Del Delay" → "lana-del-delay"   "Suit & Stripes" → "suit-stripes"
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
