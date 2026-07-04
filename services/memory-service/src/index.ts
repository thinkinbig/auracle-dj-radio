import { config } from "./config.js";
import { AuthStore } from "./auth-store.js";
import { loadCatalogIndex } from "./catalog-index.js";
import { EventsDb } from "./events-db.js";
import { TasteStore } from "./taste/taste-store.js";
import { buildServer } from "./server.js";

const app = buildServer({
  events: new EventsDb(config.eventsDbPath),
  auth: new AuthStore(config.authDbPath),
  taste: new TasteStore(config.tastePrefsDbPath),
  catalog: loadCatalogIndex(),
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`memory-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
