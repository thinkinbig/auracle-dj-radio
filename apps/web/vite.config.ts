import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** apps/api still serves track audio + catalog; override via API_PROXY_TARGET. */
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';
/** memory-service owns session orchestration (refactor-three-services). */
const memoryTarget = process.env.MEMORY_PROXY_TARGET ?? 'http://localhost:3020';
/** Go rt_llm_proxy receives the browser's WebRTC SDP offer. */
const proxyTarget = process.env.PROXY_PROXY_TARGET ?? 'http://localhost:8080';

export default defineConfig(() => {
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Session orchestration moved off the apps/api relay to memory-service.
        '/sessions': memoryTarget,
        // WebRTC SDP offer: same-origin in dev (no CORS in Go). The /proxy prefix
        // is stripped so the proxy sees its native offer path at `/`.
        '/proxy': { target: proxyTarget, rewrite: (p) => p.replace(/^\/proxy/, '') },
        '/catalog': apiTarget,
        '/tracks': apiTarget,
        '/covers': apiTarget,
        '/artists': apiTarget,
      },
    },
  };
});
