import type { CatalogAlbum, CatalogArtist } from "@auracle/shared";

/**
 * Image prompt for album **background art** (typography overlaid separately).
 * Each album's `coverSubject` should echo a specific source album layout, then foreground the pun.
 */
export function albumCoverPrompt(album: CatalogAlbum, artist: CatalogArtist): string {
  const punLine = artist.punOf
    ? `Parody of ${artist.punOf}. Album "${album.title}" by "${artist.name}". Fans must read the source album AND the pun twist instantly.`
    : "";

  const subject = album.coverSubject
    ? `Cover (source album homage + pun foreground): ${album.coverSubject}`
    : `Iconic markers: ${artist.visualHomage}. Concept: ${album.concept}`;

  return [
    "Square 1:1 album cover BACKGROUND ONLY — no text, no letters, no logos, no watermarks.",
    punLine,
    subject,
    "Bottom third slightly darker for title overlay. Print-ready matte finish.",
  ]
    .filter(Boolean)
    .join(" ");
}
