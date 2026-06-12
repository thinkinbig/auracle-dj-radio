import { config } from "./config.js";
import { buildServer } from "./server.js";

const { app } = buildServer(config.dbPath);

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`music-engine listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
