import { config } from "./config.js";
import { AuthStore } from "./auth-store.js";
import { loadCatalogIndex } from "./catalog-index.js";
import { EventsDb } from "./events-db.js";
import { createMemoryClient } from "./memory/client.js";
import { PlaylistStore } from "./playlist-store.js";
import { TasteStore } from "./taste/taste-store.js";
import { buildServer } from "./server.js";

const app = buildServer({
  events: new EventsDb(config.eventsDbPath),
  memory: createMemoryClient(),
  auth: new AuthStore(config.authDbPath),
  taste: new TasteStore(config.tastePrefsDbPath),
  playlists: new PlaylistStore(config.playlistDbPath),
  catalog: loadCatalogIndex(),
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`memory-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
