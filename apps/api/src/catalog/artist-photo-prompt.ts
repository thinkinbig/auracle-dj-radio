import type { CatalogArtist } from "@auracle/shared";

/**
 * Press-photo prompt for a fictional artist avatar (no typography — the image is the portrait).
 * When `photoSubject` is set it drives the shot; otherwise `visualHomage` + persona.
 */
export function artistPhotoPrompt(artist: CatalogArtist): string {
  const punLine = artist.punOf
    ? `Parody of ${artist.punOf}. Stage name "${artist.name}". Fans must recognize the reference instantly.`
    : "";

  const body = artist.photoSubject
    ? `Subject: ${artist.photoSubject}`
    : [
        `Iconic markers: ${artist.visualHomage}`,
        `Persona: ${artist.persona}`,
        "Original character portrait — silhouette, gear, or stylized face.",
      ].join(" ");

  return [
    "Square 1:1 musician press photo. Bold visual parody homage.",
    punLine,
    body,
    "No text, no logos, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}
