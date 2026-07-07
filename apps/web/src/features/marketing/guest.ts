import type { AuthUser } from '@auracle/shared';

export function isGuestUser(user: AuthUser): boolean {
  return user.id === 'guest';
}

export function isSpotifyUser(user: AuthUser): boolean {
  return user.provider === 'spotify';
}

export function firstNameFromUser(user: AuthUser): string {
  return user.name.split(/\s+/).filter(Boolean)[0] ?? 'there';
}
