import { API_BASE, fetchSpotify, requireTasteToken } from './spotifyTaste';

/**
 * Scenes actually reachable from IntentOnboarding.tsx's VIBE_LIBRARY (chill / study /
 * commute / gym / party) — not the wider, unused DOING_OPTIONS taxonomy in
 * data/intentOptions.ts, which nothing imports and includes a "focus" scene no preset uses.
 */
const SCENE_KEYWORDS: Record<string, string[]> = {
  study: ['study', 'studying', 'homework', 'library', 'exam', 'revision'],
  chill: ['chill', 'relax', 'lofi', 'lo-fi', 'calm', 'mellow', 'vibes', 'unwind'],
  commute: ['commute', 'drive', 'driving', 'road trip', 'train ride', 'travel'],
  gym: ['gym', 'workout', 'cardio', 'run', 'running', 'hiit', 'lifting', 'training', 'pump up'],
  party: ['party', 'turn up', 'turnt', 'dance', 'club', 'rager', 'night out', 'pregame'],
};

interface SpotifyPlaylistsResponse {
  items: Array<{ name: string; description: string | null } | null>;
}

/**
 * Best-guess scene from the listener's own Spotify playlist names/descriptions
 * (e.g. a "Study Session" playlist -> "study"). Best-effort: any failure or missing
 * signal returns undefined and the picker just falls back to its normal default.
 */
export async function getSuggestedScene(): Promise<string | undefined> {
  try {
    const token = await requireTasteToken();
    const res = await fetchSpotify<SpotifyPlaylistsResponse>(token, `${API_BASE}/me/playlists?limit=50`);
    return topScene(res.items);
  } catch {
    return undefined;
  }
}

function topScene(items: SpotifyPlaylistsResponse['items']): string | undefined {
  const votes = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    const text = `${item.name} ${item.description ?? ''}`.toLowerCase();
    for (const [scene, keywords] of Object.entries(SCENE_KEYWORDS)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        votes.set(scene, (votes.get(scene) ?? 0) + 1);
      }
    }
  }
  let best: string | undefined;
  let bestVotes = 0;
  for (const [scene, count] of votes) {
    if (count > bestVotes) {
      best = scene;
      bestVotes = count;
    }
  }
  return best;
}
