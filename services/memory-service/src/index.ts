import { config } from "./config.js";
import { EventsDb } from "./events-db.js";
import { SessionStore } from "./session/store.js";
import { HttpMusicEngineClient } from "./music-engine-client.js";
import { createMemoryClient } from "./memory/client.js";
import { HttpProxyClient } from "./proxy-client.js";
import { buildServer } from "./server.js";

const app = buildServer({
  store: new SessionStore(),
  events: new EventsDb(config.eventsDbPath),
  music: new HttpMusicEngineClient(config.musicEngineUrl),
  memory: createMemoryClient(),
  proxy: new HttpProxyClient(config.proxyUrl),
  proxyPublicUrl: config.proxyPublicUrl,
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`memory-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
