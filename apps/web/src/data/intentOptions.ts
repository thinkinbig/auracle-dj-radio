/** Chip options aligned with catalog mood/scene tags (manifest.json). */
export const FEEL_OPTIONS = [
  { value: 'calm', label: 'Calm' },
  { value: 'mellow', label: 'Mellow' },
  { value: 'warm', label: 'Warm' },
  { value: 'focused', label: 'Focused' },
  { value: 'uplifting', label: 'Uplifting' },
  { value: 'energetic', label: 'Energetic' },
  { value: 'euphoric', label: 'Euphoric' },
] as const;

export const DOING_OPTIONS = [
  { value: 'study', label: 'Studying' },
  { value: 'focus', label: 'Deep focus' },
  { value: 'chill', label: 'Chilling' },
  { value: 'commute', label: 'Commuting' },
  { value: 'gym', label: 'Working out' },
  { value: 'party', label: 'Partying' },
] as const;
