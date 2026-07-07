// The assembled local client — a drop-in stand-in for the supabase-js
// client, backed by an embedded PGlite Postgres built from the app's real
// migrations. Selected ONLY by the desktop build (`vite --mode desktop`
// aliases lib/supabase → lib/supabase.local); the cloud build never imports
// any of this.

import { getDatabase } from './database';
import { LocalQueryBuilder } from './queryBuilder';
import { createAuthShim } from './authShim';
import { createStorageShim } from './storageShim';

export function createLocalClient() {
  // Kick off (or reuse) DB initialization; every query awaits it, so the
  // client itself can be constructed synchronously at module load.
  const ready = getDatabase();
  return {
    from: (table: string) => new LocalQueryBuilder(ready, table),
    auth: createAuthShim(),
    storage: createStorageShim(ready),
  };
}
