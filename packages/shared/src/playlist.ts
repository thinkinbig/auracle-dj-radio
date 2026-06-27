export type PlaylistImportSource = "csv" | "manual" | "spotify_export";

export interface PlaylistImportTrack {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  year?: number;
  moodTags?: string[];
  sourceId?: string;
}

export interface PlaylistImportRequest {
  name: string;
  source: PlaylistImportSource;
  tracks: PlaylistImportTrack[];
}

export interface PlaylistImportSummary {
  topArtists: string[];
  topGenres: string[];
  yearStart?: number;
  yearEnd?: number;
}

export interface ImportedPlaylistProfile {
  id: string;
  name: string;
  source: PlaylistImportSource;
  trackCount: number;
  summary: PlaylistImportSummary;
  createdAt: number;
}

export interface PlaylistImportResponse {
  profile: ImportedPlaylistProfile;
}

export interface PlaylistImportListResponse {
  playlists: ImportedPlaylistProfile[];
}
