import { describe, expect, it } from 'vitest';
import { queryKeys } from './keys';

describe('queryKeys', () => {
  it('uses stable taste and catalog keys', () => {
    expect(queryKeys.taste).toEqual(['taste']);
    expect(queryKeys.trackCatalog).toEqual(['trackCatalog']);
  });
});
