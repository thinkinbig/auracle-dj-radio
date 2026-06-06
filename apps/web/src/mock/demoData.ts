import type { CreateSessionResponse } from '@auracle/shared';

export const DEMO_SESSION: CreateSessionResponse = {
  session_id: 'demo-session',
  session_title: 'Quiet Hours, vol. 3',
  session_subtitle: '25 min · winds down',
  host_mode: 'curator',
  tracklist: [
    { id: 't01', flow_position: 1, reason: 'Soft opener for focus' },
    { id: 't02', flow_position: 2, reason: 'Gentle lift without distraction' },
    { id: 't03', flow_position: 3, reason: 'Mid-session warmth' },
    { id: 't04', flow_position: 4, reason: 'Deep focus sustain' },
    { id: 't05', flow_position: 5, reason: 'Breathing room' },
    { id: 't06', flow_position: 6, reason: 'Late-night drift' },
    { id: 't07', flow_position: 7, reason: 'Closing arc' },
    { id: 't08', flow_position: 8, reason: 'Soft landing' },
  ],
  mem0_context: '',
  mem0_available: true,
  live_ws_url: '/sessions/demo-session/live',
};
