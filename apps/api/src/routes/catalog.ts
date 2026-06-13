import { existsSync, createReadStream, statSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../context.js";
import { toTrackMeta, tracksWithAssets } from "../catalog/manifest.js";

/**
 * Track catalog + audio asset routes. Session orchestration and the live voice
 * channel moved to memory-service + rt_llm_proxy (refactor-three-services); this
 * service now only serves the catalog and the immutable track files.
 */
export function registerRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.get("/tracks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const meta = ctx.db.getTrackMeta(id);
    if (!meta) return reply.code(404).send({ error: "track not found" });
    return meta;
  });

  app.get("/catalog/tracks", async () => ({
    tracks: tracksWithAssets().map(toTrackMeta),
  }));

  app.get("/tracks/:id/audio", async (req, reply) => {
    const { id } = req.params as { id: string };
    const track = ctx.db.getTrack(id);
    if (!track || !existsSync(track.filePath)) {
      return reply.code(404).send({ error: "audio not available" });
    }
    // Content-Length lets the browser <audio> element report a real duration.
    reply.header("content-length", statSync(track.filePath).size);
    // Track files are immutable per id — cache so the client's next-track prefetch sticks.
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.type("audio/mpeg").send(createReadStream(track.filePath));
  });
}
