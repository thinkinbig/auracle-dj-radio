import type { CreateSessionResponse } from '@auracle/shared';

export const DEMO_SESSION: CreateSessionResponse = {
  session_id: 'demo-session',
  session_title: 'Afterglow Radio, vol. 1',
  session_subtitle: '25 min · warm focus',
  host_mode: 'curator',
  tracklist: [
    { id: 't14', flow_position: 1, reason: 'Warm opener with motion' },
    { id: 't01', flow_position: 2, reason: 'Soft focus reset' },
    { id: 't02', flow_position: 3, reason: 'Gentle lift without distraction' },
    { id: 't03', flow_position: 4, reason: 'Mid-session warmth' },
    { id: 't04', flow_position: 5, reason: 'Deep focus sustain' },
    { id: 't05', flow_position: 6, reason: 'Breathing room' },
    { id: 't06', flow_position: 7, reason: 'Late-night drift' },
    { id: 't08', flow_position: 8, reason: 'Soft landing' },
  ],
  mem0_context: '',
  proxy_url: '',
  token: '',
};
