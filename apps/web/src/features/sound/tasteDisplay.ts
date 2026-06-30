import type { AuthUser, TastePreference } from '@auracle/shared';

export function resolveTasteWords(preferences: TastePreference[]): string[] {
  const active = preferences.filter((preference) => preference.status !== 'orphaned');
  const preferred = active.filter((preference) => preference.polarity === 'prefer');
  const source = preferred.length > 0 ? preferred : active;
  return source
    .sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))
    .slice(0, 3)
    .map((preference) =>
      preference.polarity === 'avoid' ? `Avoid ${humanizeTasteId(preference.entityId)}` : humanizeTasteId(preference.entityId),
    );
}

function humanizeTasteId(entityId: string): string {
  return entityId
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

type QueryLike = { isPending: boolean; isError: boolean };

export function resolveProfileTasteWords(user: AuthUser, words: string[], query: QueryLike): string[] {
  if (user.id === 'guest') return ['Demo catalog', 'Guest mode', 'Fresh session'];
  if (query.isPending) return ['Syncing taste'];
  if (query.isError) return ['Taste sync pending'];
  return words.length > 0 ? words : ['No saved DNA yet'];
}
