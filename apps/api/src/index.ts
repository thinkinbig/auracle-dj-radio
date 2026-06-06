import { config } from "./config.js";
import { buildContext } from "./context.js";
import { buildServer } from "./server.js";

const ctx = await buildContext();
const app = await buildServer(ctx);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
