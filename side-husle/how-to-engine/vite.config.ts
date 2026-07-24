import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `npm run dev` serves the SPA and proxies /api to a local functions
// runtime (e.g. `vercel dev` on :3000). In production the /api/cascade and
// /api/text-to-video endpoints run as serverless functions so provider API
// keys never reach the browser.
export default defineConfig({
  // Served at the /how-to route (assets resolve under /how-to/…). The SPA and
  // its serverless /api functions sit behind that path on the deployed domain.
  base: '/how-to/',
  plugins: [react()],
  server: {
    port: 5178,
    // The client calls `${BASE_URL}api/...` = `/how-to/api/...`. With a
    // non-relative base, proxy keys must include that base, so map
    // /how-to/api/* → the functions runtime (stripping the /how-to prefix).
    proxy: {
      '/how-to/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/how-to/, ''),
      },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { target: 'es2020', sourcemap: true },
});
