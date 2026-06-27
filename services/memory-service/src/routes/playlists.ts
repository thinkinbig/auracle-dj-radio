import type { FastifyInstance } from "fastify";
import { parseBearerToken, type PlaylistImportListResponse, type PlaylistImportResponse } from "@auracle/shared";
import type { AuthStore } from "../auth-store.js";
import type { MemoryClient } from "../memory/client.js";
import type { PlaylistStore } from "../playlist-store.js";
import { playlistMemoryFact, validatePlaylistImport } from "../playlist-store.js";

interface PlaylistRouteDeps {
  auth: AuthStore;
  playlists: PlaylistStore;
  memory: MemoryClient;
}

const PLAYLIST_RUN_ID_PREFIX = "playlist-import:";

export function registerPlaylistRoutes(app: FastifyInstance, deps: PlaylistRouteDeps): void {
  const { auth, playlists, memory } = deps;

  app.get("/users/me/playlists", async (req, reply) => {
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "authentication required" });
    const body: PlaylistImportListResponse = { playlists: playlists.list(user.id) };
    return body;
  });

  app.post("/users/me/playlists", async (req, reply) => {
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "authentication required" });

    const parsed = validatePlaylistImport(req.body);
    if ("error" in parsed) return reply.code(400).send({ error: parsed.error });

    const profile = playlists.create(user.id, parsed);
    await memory.remember(playlistMemoryFact(profile), `${PLAYLIST_RUN_ID_PREFIX}${profile.id}`, user.id);
    const body: PlaylistImportResponse = { profile };
    return reply.code(201).send(body);
  });
}
