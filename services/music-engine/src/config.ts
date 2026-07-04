import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
function resolveConfiguredPath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (isAbsolute(value)) return value;
  const candidates = [resolve(repoRoot, value), resolve(here, value), resolve(process.cwd(), value)];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}
// Load service-local .env if present, then the repo-root .env (no override of existing).
loadEnv();
loadEnv({ path: resolve(here, "../../../.env") });

export interface Config {
  port: number;
  /** Catalog data directory (manifest.json + audio/cover/photo assets) — @auracle/catalog. */
  catalogDataDir: string;
}

export const config: Config = {
  port: Number(process.env.MUSIC_ENGINE_PORT ?? 3010),
  catalogDataDir: resolveConfiguredPath(process.env.CATALOG_DATA_DIR, resolve(repoRoot, "packages/catalog/data")),
};
