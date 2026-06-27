import { describe, expect, it } from 'vitest';
import { parsePlaylistInput } from './playlistImportParser';

describe('parsePlaylistInput', () => {
  it('parses CSV metadata with flexible headers', () => {
    const parsed = parsePlaylistInput(
      'Track Name,Artist Name(s),Album Name,Release Date,Genres\n"Night, Drive",Nova Pulse,After Hours,2014-02-01,Synthwave',
      'csv',
    );
    expect(parsed.tracks).toEqual([
      { title: 'Night, Drive', artist: 'Nova Pulse', album: 'After Hours', genre: 'Synthwave', year: 2014 },
    ]);
  });

  it('parses Spotify streaming history JSON', () => {
    const parsed = parsePlaylistInput(
      JSON.stringify([
        {
          master_metadata_track_name: 'Glass Coast',
          master_metadata_album_artist_name: 'Mirrorline',
          master_metadata_album_album_name: 'Archive',
          ts: '2020-01-02T00:00:00Z',
        },
      ]),
      'spotify_export',
    );
    expect(parsed.tracks[0]).toMatchObject({ title: 'Glass Coast', artist: 'Mirrorline', album: 'Archive', year: 2020 });
  });

  it('parses manual lines and skips malformed entries', () => {
    const parsed = parsePlaylistInput('Velvet Room, Nova Pulse, Midnight, House, 2018\nbad line', 'manual');
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]).toMatchObject({ title: 'Velvet Room', artist: 'Nova Pulse', genre: 'House', year: 2018 });
    expect(parsed.warnings[0]).toContain('Skipped');
  });
});
