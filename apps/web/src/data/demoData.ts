import type { CreateSessionResponse } from '@auracle/shared';

export const DEMO_SESSION: CreateSessionResponse = {
  session_id: 'demo-session',
  session_title: 'Afterglow Radio, vol. 1',
  session_subtitle: '25 min · warm focus',
  host_mode: 'curator',
  tracklist: [
    { id: 't14', flow_position: 1, reason: 'Warm opener with motion', source: 'local' },
    { id: 't01', flow_position: 2, reason: 'Soft focus reset', source: 'local' },
    { id: 't02', flow_position: 3, reason: 'Gentle lift without distraction', source: 'local' },
    { id: 't03', flow_position: 4, reason: 'Mid-session warmth', source: 'local' },
    { id: 't04', flow_position: 5, reason: 'Deep focus sustain', source: 'local' },
    { id: 't05', flow_position: 6, reason: 'Breathing room', source: 'local' },
    { id: 't06', flow_position: 7, reason: 'Late-night drift', source: 'local' },
    { id: 't08', flow_position: 8, reason: 'Soft landing', source: 'local' },
  ],
  mem0_context: '',
  proxy_url: '',
  token: '',
};
