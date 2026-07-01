import type { CreateSessionResponse, PlannedTrack } from '@auracle/shared';

/** A catalog demo slot; the web resolves its display metadata by id from the catalog. */
function demoLocal(id: string, flow_position: number, reason: string): PlannedTrack {
  return {
    id,
    uri: `local:${id}`,
    flow_position,
    reason,
    title: '',
    artist: '',
    albumTitle: '',
    albumCoverUrl: '',
    durationSec: 0,
    energy: 3,
    voicing: { artistPersona: '', albumConcept: '', lore: '' },
  };
}

export const DEMO_SESSION: CreateSessionResponse = {
  session_id: 'demo-session',
  session_title: 'Afterglow Radio, vol. 1',
  session_subtitle: '25 min · warm focus',
  host_mode: 'curator',
  tracklist: [
    demoLocal('t14', 1, 'Warm opener with motion'),
    demoLocal('t01', 2, 'Soft focus reset'),
    demoLocal('t02', 3, 'Gentle lift without distraction'),
    demoLocal('t03', 4, 'Mid-session warmth'),
    demoLocal('t04', 5, 'Deep focus sustain'),
    demoLocal('t05', 6, 'Breathing room'),
    demoLocal('t06', 7, 'Late-night drift'),
    demoLocal('t08', 8, 'Soft landing'),
  ],
  mem0_context: '',
  proxy_url: '',
  token: '',
};
