/** Common single-dash typos → long options (pnpm/npm users often type `-all`). */
const LONG_OPTION_ALIASES: Record<string, string> = {
  "-all": "--all",
  "-force": "--force",
  "-dry-run": "--dry-run",
  "-clip": "--clip",
  "-covers-only": "--covers-only",
  "-artists-only": "--artists-only",
};

export function normalizeCatalogCliArgs(argv: string[]): string[] {
  return argv.map((arg) => LONG_OPTION_ALIASES[arg] ?? arg);
}
