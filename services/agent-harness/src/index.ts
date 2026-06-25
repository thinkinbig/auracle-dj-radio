import { config } from "./config.js";
import { HttpMemoryServiceClient } from "./memory-service-client.js";
import { HttpMusicEngineClient } from "./music-engine-client.js";
import { HttpProxyClient } from "./proxy-client.js";
import { buildServer } from "./server.js";
import { SessionStore } from "./session/store.js";

const app = buildServer({
  store: new SessionStore(),
  memory: new HttpMemoryServiceClient(config.memoryServiceUrl),
  music: new HttpMusicEngineClient(config.musicEngineUrl),
  proxy: new HttpProxyClient(config.proxyUrl),
  proxyPublicUrl: config.proxyPublicUrl,
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`agent-harness listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
