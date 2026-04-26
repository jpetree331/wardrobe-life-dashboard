// Typed access to client-side env vars. Vite exposes only `VITE_*` to the browser.

interface ClientEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

function readEnv(): ClientEnv {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
        'Copy app/.env.example to app/.env.local and fill in values.',
    );
  }
  return { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon };
}

export const env = readEnv();
