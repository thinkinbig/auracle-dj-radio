import { config } from "./config.js";
import { Catalog } from "./catalog-store.js";
import { buildServer } from "./server.js";

const catalog = Catalog.fromManifest();

// The manifest is the single source of truth; an empty catalog means it is
// missing or empty. Fail loudly instead of serving empty tracklists, which
// silently degrade every session to the client's demo fallback (the exact bug
// this refactor removes).
if (catalog.allTracks().length === 0) {
  console.error(
    `music-engine: catalog is EMPTY (catalogDataDir=${config.catalogDataDir}). ` +
      `No tracklists can be planned — refusing to start. Check the manifest and its assets.`,
  );
  process.exit(1);
}

const { app } = buildServer(catalog);

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`music-engine listening on ${addr} (${catalog.allTracks().length} tracks)`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
