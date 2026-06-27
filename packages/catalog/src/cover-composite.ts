import sharp from "sharp";

const COVER_SIZE = 1024;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Composite album title + artist name onto a square cover background (DejaVu Sans). */
export async function compositeCover(
  background: Buffer,
  albumTitle: string,
  artistName: string,
): Promise<Buffer> {
  const svg = `<svg width="${COVER_SIZE}" height="${COVER_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${COVER_SIZE - 300}" width="${COVER_SIZE}" height="300" fill="url(#fade)"/>
  <text x="56" y="${COVER_SIZE - 120}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="52" font-weight="bold" fill="white">${escapeXml(albumTitle)}</text>
  <text x="56" y="${COVER_SIZE - 56}" font-family="DejaVu Sans, Liberation Sans, sans-serif" font-size="30" fill="white" opacity="0.92">${escapeXml(artistName)}</text>
</svg>`;

  return sharp(background)
    .resize(COVER_SIZE, COVER_SIZE, { fit: "cover" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
