import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys';

describe('queryKeys', () => {
  it('uses stable Spotify taste and catalog keys', () => {
    expect(queryKeys.spotifyTaste).toEqual(['spotifyTaste']);
    expect(queryKeys.trackCatalog).toEqual(['trackCatalog']);
  });
});
