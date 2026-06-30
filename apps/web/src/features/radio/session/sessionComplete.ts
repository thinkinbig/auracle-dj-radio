export type SessionCompleteSurface = 'controls' | 'summary';

export function deriveSessionCompleteCopy(
  surface: SessionCompleteSurface,
  extendPending: boolean,
  extendFailed: boolean,
): { title?: string; body: string } {
  if (extendPending) {
    return {
      body:
        surface === 'controls'
          ? 'Finding more music for your station…'
          : 'Holding the outro while we queue the next batch.',
    };
  }

  if (extendFailed) {
    return {
      title: surface === 'controls' ? 'Session complete' : undefined,
      body:
        surface === 'controls'
          ? 'We could not fetch the next batch. You can try again or start a fresh session.'
          : 'The station paused here. Continue listening or start a new session.',
    };
  }

  return {
    title: surface === 'controls' ? 'Session complete' : undefined,
    body:
      surface === 'controls'
        ? 'This set has played through. Keep listening or start something new.'
        : 'This set has played through. Start a new session when you are ready.',
  };
}
