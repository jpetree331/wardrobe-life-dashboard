// Local-mode database bootstrap: an embedded PGlite Postgres, initialized by
// the shim prelude + the app's real migrations. In the browser/desktop the
// data persists to IndexedDB ('idb://wardrobe-local' — later, the Tauri shell
// can move this to a plain file); in Node (tests) it runs in memory.

import { PGlite, types } from '@electric-sql/pglite';
import { PRELUDE_SQL } from './prelude';
import { MIGRATIONS } from './migrations';

/**
 * supabase-js (PostgREST) returns date/timestamp columns as STRINGS —
 * 'YYYY-MM-DD' and ISO timestamps — and the whole app depends on that
 * (string comparisons, .slice(0, 4), localeCompare ordering). PGlite's
 * default parsers would hand back JS Date objects instead, so we keep the
 * wire text: dates verbatim, timestamps with the space flipped to a 'T'.
 */
/** '2026-04-19 08:00:00.123+00' → '2026-04-19T08:00:00.123+00:00' — the
 *  shape PostgREST emits and `new Date(...)` reliably parses. */
function isoTimestamp(v: string): string {
  return v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
}

const POSTGREST_COMPATIBLE_PARSERS = {
  [types.DATE]: (v: string) => v,
  [types.TIMESTAMP]: isoTimestamp,
  [types.TIMESTAMPTZ]: isoTimestamp,
  // PostgREST emits numeric/bigint as JSON numbers; PGlite's default is the
  // wire string, which turns card-position math like `x + dx` into string
  // concatenation ("240" + 67 → "24067") and makes React drop unitless
  // "150"-style CSS values, stacking every Notes card at the canvas origin.
  [types.NUMERIC]: (v: string) => Number(v),
  [types.INT8]: (v: string) => Number(v),
};

/** Construct a PGlite with the app's parser settings. `dataDir` omitted →
 *  in-memory (tests); 'idb://…' → persistent (the running app). */
export function createPGlite(dataDir?: string): PGlite {
  return dataDir
    ? new PGlite(dataDir, { parsers: POSTGREST_COMPATIBLE_PARSERS })
    : new PGlite({ parsers: POSTGREST_COMPATIBLE_PARSERS });
}

/** Run the prelude + any not-yet-applied migrations. Exported so tests can
 *  initialize a throwaway in-memory instance with the exact same path. */
export async function initializeDatabase(pg: PGlite): Promise<PGlite> {
  await pg.exec(PRELUDE_SQL);
  for (const m of MIGRATIONS) {
    const applied = await pg.query('select 1 from local_migrations where name = $1', [m.name]);
    if (applied.rows.length > 0) continue;
    await pg.exec(m.sql);
    await pg.query('insert into local_migrations (name) values ($1)', [m.name]);
  }
  return pg;
}

let dbPromise: Promise<PGlite> | null = null;

/** The app-wide database handle. Lazy: nothing touches disk until the first
 *  query, and every query in the local client awaits this. */
export function getDatabase(): Promise<PGlite> {
  if (!dbPromise) {
    const persistent = typeof indexedDB !== 'undefined';
    const pg = createPGlite(persistent ? 'idb://wardrobe-local' : undefined);
    dbPromise = initializeDatabase(pg);
  }
  return dbPromise;
}
