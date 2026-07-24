import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const HOW_TO_BASE = '/how-to-2';

// Dev: `npm run dev` serves the SPA and proxies /api to a local functions
// runtime (e.g. `vercel dev` on :3000). In production the /api/cascade and
// /api/text-to-video endpoints run as serverless functions so provider API
// keys never reach the browser.
export default defineConfig({
  // Served at the /how-to-2 route (assets resolve under /how-to-2/…). The SPA
  // and its serverless /api functions sit behind that path on deployment.
  base: `${HOW_TO_BASE}/`,
  plugins: [react()],
  server: {
    port: 5178,
    // The client calls `${BASE_URL}api/...` = `/how-to-2/api/...`. With a
    // non-relative base, proxy keys must include that base, so map the prefixed
    // API route to the local functions runtime and strip the public route.
    proxy: {
      [`${HOW_TO_BASE}/api`]: {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(HOW_TO_BASE, ''),
      },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { target: 'es2020', sourcemap: true },
});
