import { describe, expect, it } from 'vitest';
import type { TastePreference } from '@auracle/shared';
import {
  canSetTrack,
  countByType,
  hydrateSelection,
  isOrphaned,
  ORPHAN_BANNER_THRESHOLD,
  orphanedEntries,
  orphanRatio,
  polarityOf,
  setPolarity,
  toSaveRequest,
  togglePolarity,
  type Selection,
} from './tasteSelection';

function pref(p: Partial<TastePreference> & Pick<TastePreference, 'entityType' | 'entityId' | 'polarity'>): TastePreference {
  return { source: 'onboarding', ...p };
}

describe('tasteSelection', () => {
  it('hydrates a keyed selection and reads polarity/status', () => {
    const sel = hydrateSelection([
      pref({ entityType: 'genre', entityId: 'lo-fi', polarity: 'prefer' }),
      pref({ entityType: 'track', entityId: 't99', polarity: 'avoid', status: 'orphaned' }),
    ]);
    expect(polarityOf(sel, 'genre', 'lo-fi')).toBe('prefer');
    expect(isOrphaned(sel, 'track', 't99')).toBe(true);
    expect(isOrphaned(sel, 'genre', 'lo-fi')).toBe(false);
  });

  it('toggles tri-state: set, clear by re-click, and switch polarity', () => {
    let sel: Selection = {};
    sel = togglePolarity(sel, 'genre', 'house', 'prefer');
    expect(polarityOf(sel, 'genre', 'house')).toBe('prefer');
    sel = togglePolarity(sel, 'genre', 'house', 'avoid');
    expect(polarityOf(sel, 'genre', 'house')).toBe('avoid');
    sel = togglePolarity(sel, 'genre', 'house', 'avoid');
    expect(polarityOf(sel, 'genre', 'house')).toBeUndefined();
  });

  it('preserves source when re-setting an existing pick', () => {
    let sel = hydrateSelection([pref({ entityType: 'artist', entityId: 'x', polarity: 'prefer', source: 'search' })]);
    sel = setPolarity(sel, 'artist', 'x', 'avoid');
    expect(sel['artist:x']?.source).toBe('search');
  });

  it('enforces track pin/block caps but always allows toggling off', () => {
    let sel: Selection = {};
    for (const id of ['t1', 't2', 't3', 't4', 't5']) sel = setPolarity(sel, 'track', id, 'prefer');
    expect(countByType(sel, 'track', 'prefer')).toBe(5);
    expect(canSetTrack(sel, 't6', 'prefer')).toBe(false); // cap reached
    expect(canSetTrack(sel, 't1', 'prefer')).toBe(true); // already pinned → can toggle off

    for (const id of ['b1', 'b2', 'b3']) sel = setPolarity(sel, 'track', id, 'avoid');
    expect(canSetTrack(sel, 'b4', 'avoid')).toBe(false);
  });

  it('builds a PUT payload that drops orphans and read-only fields', () => {
    const sel = hydrateSelection([
      pref({ entityType: 'genre', entityId: 'lo-fi', polarity: 'prefer', status: 'active', resolvedId: 'lo-fi' }),
      pref({ entityType: 'artist', entityId: 'gone', polarity: 'prefer', status: 'orphaned' }),
    ]);
    const req = toSaveRequest(sel, '  more jazz  ');
    expect(req.preferences).toEqual([
      { entityType: 'genre', entityId: 'lo-fi', polarity: 'prefer', source: 'onboarding' },
    ]);
    expect(req.freeText).toBe('more jazz');
    expect(orphanedEntries(sel)).toHaveLength(1);
  });

  it('omits freeText when blank', () => {
    expect(toSaveRequest({}, '   ').freeText).toBeUndefined();
  });

  it('computes a track-weighted orphan ratio for the banner threshold', () => {
    expect(orphanRatio({})).toBe(0);
    // 1 active genre + 1 orphaned genre → 1/2 = 0.5 > threshold.
    const half = hydrateSelection([
      pref({ entityType: 'genre', entityId: 'lo-fi', polarity: 'prefer', status: 'active' }),
      pref({ entityType: 'genre', entityId: 'gone', polarity: 'prefer', status: 'orphaned' }),
    ]);
    expect(orphanRatio(half)).toBeCloseTo(0.5);
    expect(orphanRatio(half)).toBeGreaterThan(ORPHAN_BANNER_THRESHOLD);

    // Track orphans count double: 4 active-genre weight vs 1 orphaned track ×2 = 2/6 ≈ 0.33.
    const weighted = hydrateSelection([
      pref({ entityType: 'genre', entityId: 'a', polarity: 'prefer', status: 'active' }),
      pref({ entityType: 'genre', entityId: 'b', polarity: 'prefer', status: 'active' }),
      pref({ entityType: 'genre', entityId: 'c', polarity: 'prefer', status: 'active' }),
      pref({ entityType: 'genre', entityId: 'd', polarity: 'prefer', status: 'active' }),
      pref({ entityType: 'track', entityId: 't99', polarity: 'avoid', status: 'orphaned' }),
    ]);
    expect(orphanRatio(weighted)).toBeCloseTo(2 / 6);
  });
});
