import type { CatalogAlbum, CatalogArtist } from "@auracle/shared";

const IMAGE_GUARDRAILS =
  "No text, no typography, no logos, no watermarks. NOT a real-person lookalike — stylized fictional character or graphic design only.";

/** Build a Gemini Image prompt for album cover background art (text added later via sharp). */
export function buildCoverPrompt(artist: CatalogArtist, album: CatalogAlbum): string {
  const subject =
    album.coverSubject ?? `${album.concept}. Visual language: ${artist.visualHomage}.`;
  return [
    "Square album cover background illustration, 1:1 composition, professional album-art quality.",
    IMAGE_GUARDRAILS,
    subject,
    `Design era reference (graphic language only, no celebrity likeness): ${artist.visualHomage}.`,
    "Cohesive color palette, strong focal point, square crop safe for thumbnail display.",
  ].join(" ");
}

/** Build a Gemini Image prompt for a fictional artist press portrait. */
export function buildArtistPhotoPrompt(artist: CatalogArtist): string {
  const subject =
    artist.photoSubject ??
    `Stylized fictional musician. ${artist.persona}. Visual era: ${artist.visualHomage}.`;
  return [
    "Square press portrait of a fictional musical artist, 1:1 composition, studio lighting, sharp focus.",
    IMAGE_GUARDRAILS,
    subject,
    `Design era reference (graphic language only, no celebrity likeness): ${artist.visualHomage}.`,
  ].join(" ");
}
