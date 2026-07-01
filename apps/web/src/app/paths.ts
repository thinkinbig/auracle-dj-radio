export const paths = {
  home: '/',
  listen: '/listen',
  library: '/library',
  sound: '/sound',
  history: '/history',
} as const;

export type AppPath = (typeof paths)[keyof typeof paths];

export const PRODUCT_NAV: { path: AppPath; label: string; end?: boolean }[] = [
  { path: paths.home, label: 'Home', end: true },
  { path: paths.listen, label: 'Listen' },
  { path: paths.library, label: 'Library' },
  { path: paths.sound, label: 'Taste' },
  { path: paths.history, label: 'History' },
];
