import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Two build targets from one codebase:
//   default mode  → the cloud app (Vercel + Supabase) — configuration
//                   identical to before the desktop work; lib/supabase.ts
//                   resolves normally and none of lib/local/* is bundled.
//   --mode desktop → the local-data app (embedded PGlite Postgres, no
//                   accounts). A resolve alias substitutes
//                   lib/supabase.local.ts wherever './supabase' or
//                   '../lib/supabase' is imported. Used by npm run
//                   dev:desktop / build:desktop and, later, the Tauri shell.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  ...(mode === 'desktop'
    ? {
        resolve: {
          alias: [
            {
              // Matches './supabase' and '../lib/supabase' (any ../ depth),
              // but never the '@supabase/…' packages.
              find: /^(\.{1,2}\/)+(lib\/)?supabase$/,
              replacement: fileURLToPath(new URL('./src/lib/supabase.local.ts', import.meta.url)),
            },
          ],
        },
        optimizeDeps: {
          // PGlite ships its own WASM assets; pre-bundling breaks them.
          exclude: ['@electric-sql/pglite'],
        },
      }
    : {}),
}));
