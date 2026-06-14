import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import type { ServerResponse } from 'node:http';

/** memory-service owns session orchestration (refactor-three-services). */
const memoryTarget = process.env.MEMORY_PROXY_TARGET ?? 'http://localhost:3020';
/** Go rt_llm_proxy receives the browser's WebRTC SDP offer. */
const proxyTarget = process.env.PROXY_PROXY_TARGET ?? 'http://localhost:8080';

/**
 * Serve the static catalog (packages/catalog/data) in dev — the api service was
 * retired, so this mirrors what nginx does in prod:
 *   GET /catalog/tracks      → catalog/tracks.json
 *   GET /tracks/:id          → catalog/track/<id>.json
 *   GET /tracks/:id/audio     → tracks/<id>.mp3
 *   GET /covers|artists/:file → image
 */
function catalogDev(): Plugin {
  const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/catalog/data');
  const send = (res: ServerResponse, file: string, type: string): void => {
    if (!existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', type);
    createReadStream(file).pipe(res);
  };
  const imageType = (f: string): string =>
    f.endsWith('.png') ? 'image/png'
      : f.endsWith('.webp') ? 'image/webp'
        : f.endsWith('.svg') ? 'image/svg+xml'
          : 'image/jpeg';
  return {
    name: 'auracle-catalog-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/catalog/tracks') return send(res, join(dataDir, 'catalog/tracks.json'), 'application/json');
        let m = url.match(/^\/tracks\/([^/]+)\/audio$/);
        if (m) return send(res, join(dataDir, 'tracks', `${m[1]}.mp3`), 'audio/mpeg');
        m = url.match(/^\/tracks\/([^/]+)$/);
        if (m) return send(res, join(dataDir, 'catalog/track', `${m[1]}.json`), 'application/json');
        m = url.match(/^\/(covers|artists)\/(.+)$/);
        if (m) return send(res, join(dataDir, m[1], m[2]), imageType(m[2]));
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), catalogDev()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Session orchestration → memory-service.
        '/sessions': memoryTarget,
        // WebRTC SDP offer: same-origin in dev (no CORS in Go). The /proxy prefix
        // is stripped so the proxy sees its native offer path at `/`.
        '/proxy': { target: proxyTarget, rewrite: (p) => p.replace(/^\/proxy/, '') },
      },
    },
  };
});
