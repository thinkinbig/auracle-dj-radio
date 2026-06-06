import { createRequire } from "node:module";
import sharp from "sharp";

const require = createRequire(import.meta.url);

const COVER_SIZE = 1024;

const FONT_REGULAR = require.resolve(
  "@fontsource/dejavu-sans/files/dejavu-sans-latin-400-normal.woff",
);
const FONT_BOLD = require.resolve(
  "@fontsource/dejavu-sans/files/dejavu-sans-latin-700-normal.woff",
);

export interface AlbumCoverOverlayInput {
  background: Buffer;
  albumTitle: string;
  artistName: string;
  size?: number;
}

/** Escape user text for safe inclusion in SVG. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** SVG text + bottom gradient layered over the generated background. */
export function buildCoverOverlaySvg(
  albumTitle: string,
  artistName: string,
  size: number,
  fontRegularPath: string,
  fontBoldPath: string,
): string {
  const artist = escapeXml(artistName.toUpperCase());
  const title = escapeXml(albumTitle);
  const pad = Math.round(size * 0.06);
  const artistSize = Math.round(size * 0.038);
  const titleSize = Math.round(size * 0.072);
  const titleY = size - pad;
  const artistY = titleY - titleSize - Math.round(size * 0.02);
  const titleMaxWidth = size - pad * 2;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'CoverSans';
        src: url('file://${fontRegularPath}') format('woff');
        font-weight: 400;
      }
      @font-face {
        font-family: 'CoverSans';
        src: url('file://${fontBoldPath}') format('woff');
        font-weight: 700;
      }
    </style>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="52%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.72"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.85"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#fade)"/>
  <text x="${pad}" y="${artistY}" fill="#f5f5f5" font-family="CoverSans" font-size="${artistSize}" font-weight="400" letter-spacing="0.14em" filter="url(#shadow)">${artist}</text>
  <text x="${pad}" y="${titleY}" fill="#ffffff" font-family="CoverSans" font-size="${titleSize}" font-weight="700" filter="url(#shadow)" textLength="${titleMaxWidth}" lengthAdjust="spacingAndGlyphs">${title}</text>
</svg>`;
}

/** Resize background to square, composite typography, emit JPEG. */
export async function overlayAlbumCover(input: AlbumCoverOverlayInput): Promise<Buffer> {
  const size = input.size ?? COVER_SIZE;
  const svg = buildCoverOverlaySvg(
    input.albumTitle,
    input.artistName,
    size,
    FONT_REGULAR,
    FONT_BOLD,
  );

  return sharp(input.background)
    .resize(size, size, { fit: "cover", position: "centre" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
