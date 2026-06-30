import type { GenreCount, TrackMeta } from '@auracle/shared';

/**
 * Browse-first catalog model for the taste editor (#6): at ~100 tracks we group
 * the static catalog into artists → albums → tracks on the client instead of
 * standing up search infra. All options derive from the live catalog APIs.
 */
export interface BrowseAlbum {
  slug: string;
  title: string;
  coverUrl: string;
  concept: string;
  trackIds: string[];
}

export interface BrowseArtist {
  slug: string;
  name: string;
  photoUrl: string;
  persona: string;
  albums: BrowseAlbum[];
}

export interface BrowseTrack {
  id: string;
  title: string;
  artist: string;
  artistSlug: string;
  albumSlug: string;
  coverUrl: string;
  lore: string;
}

export interface BrowseCatalog {
  artists: BrowseArtist[];
  tracks: BrowseTrack[];
}

export const EMPTY_BROWSE_CATALOG: BrowseCatalog = { artists: [], tracks: [] };

/** Group flat catalog tracks into a stable artist/album/track tree (pure). */
export function groupCatalog(tracks: TrackMeta[]): BrowseCatalog {
  const artists = new Map<string, BrowseArtist>();
  const albums = new Map<string, BrowseAlbum>();

  for (const t of tracks) {
    let artist = artists.get(t.artistSlug);
    if (!artist) {
      artist = { slug: t.artistSlug, name: t.artist, photoUrl: t.artistPhotoUrl, persona: t.artistPersona, albums: [] };
      artists.set(t.artistSlug, artist);
    }
    let album = albums.get(t.albumSlug);
    if (!album) {
      album = { slug: t.albumSlug, title: t.albumTitle, coverUrl: t.albumCoverUrl, concept: t.albumConcept, trackIds: [] };
      albums.set(t.albumSlug, album);
      artist.albums.push(album);
    }
    album.trackIds.push(t.id);
  }

  const browseTracks: BrowseTrack[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    artistSlug: t.artistSlug,
    albumSlug: t.albumSlug,
    coverUrl: t.albumCoverUrl,
    lore: t.lore,
  }));

  // Sort albums within each artist (insertion order otherwise depends on the
  // order tracks arrive in), mirroring the artist/track sorts below.
  const sortedArtists = [...artists.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const artist of sortedArtists) artist.albums.sort((a, b) => a.title.localeCompare(b.title));

  return {
    artists: sortedArtists,
    tracks: browseTracks.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Filter catalog tree by title or artist name (client-side browse). */
export function filterCatalog(catalog: BrowseCatalog, query: string): BrowseCatalog {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;

  const tracks = catalog.tracks.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
  );
  const trackIds = new Set(tracks.map((t) => t.id));
  const artists = catalog.artists
    .map((artist) => ({
      ...artist,
      albums: artist.albums
        .map((album) => ({
          ...album,
          trackIds: album.trackIds.filter((id) => trackIds.has(id)),
        }))
        .filter((album) => album.trackIds.length > 0),
    }))
    .filter((artist) => artist.albums.length > 0);

  return { artists, tracks };
}

/** Live genre taxonomy + counts (GET /catalog/genres). */
export async function loadGenres(): Promise<GenreCount[]> {
  const res = await fetch('/catalog/genres');
  if (!res.ok) throw new Error('Failed to load genres');
  const body = (await res.json()) as { genres: GenreCount[] };
  return body.genres;
}

/** Full catalog grouped for browse (GET /catalog/tracks). */
export async function loadBrowseCatalog(): Promise<BrowseCatalog> {
  const res = await fetch('/catalog/tracks');
  if (!res.ok) throw new Error('Failed to load catalog');
  const body = (await res.json()) as { tracks: TrackMeta[] };
  return groupCatalog(body.tracks);
}
