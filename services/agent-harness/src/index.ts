import { config } from "./config.js";
import { HttpProfileServiceClient, HttpMusicEngineClient, HttpProxyClient } from "@auracle/clients";
import { buildServer } from "./server.js";
import { SessionStore } from "./session/state.js";

const app = buildServer({
  store: new SessionStore(),
  profile: new HttpProfileServiceClient(config.profileServiceUrl),
  music: new HttpMusicEngineClient(config.musicEngineUrl),
  proxy: new HttpProxyClient(config.proxyUrl, config.proxyRegisterSecret || undefined),
  proxyPublicUrl: config.proxyPublicUrl,
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`agent-harness listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
