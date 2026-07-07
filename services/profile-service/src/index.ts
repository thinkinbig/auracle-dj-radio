import { config } from "./config.js";
import { AuthStore } from "./auth-store.js";
import { loadCatalogIndex } from "./catalog-index.js";
import { EventsDb } from "./events-db.js";
import { buildServer } from "./server.js";

const app = buildServer({
  events: new EventsDb(config.eventsDbPath),
  auth: new AuthStore({
    supabaseUrl: config.supabaseUrl,
    jwtSecret: config.supabaseJwtSecret,
    jwksUrl: config.supabaseJwksUrl,
    issuer: config.supabaseJwtIssuer,
    audience: config.supabaseJwtAudience,
  }),
  catalog: loadCatalogIndex(),
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`profile-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
