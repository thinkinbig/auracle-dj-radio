import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev default is docker api on :3001; override via API_PROXY_TARGET when needed. */
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

export default defineConfig(() => {
  return {
    plugins: [react()],
    server: {
      proxy: {
        // ws:true so the Live WebSocket upgrade at /sessions/:id/live is proxied too.
        '/sessions': { target: apiTarget, ws: true },
        '/tracks': apiTarget,
      },
    },
  };
});
