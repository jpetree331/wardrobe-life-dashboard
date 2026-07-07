// Desktop/local-mode stand-in for ./supabase.
//
// This file is substituted for lib/supabase.ts by a Vite alias ONLY when
// building/serving with `--mode desktop` (see vite.config.ts). The cloud
// build resolves lib/supabase.ts exactly as before — supabase.ts itself is
// untouched and none of the lib/local/* code is ever bundled for the web.
//
// The local client implements the precise supabase-js surface this app
// uses (see lib/local/queryBuilder.ts) over an embedded PGlite Postgres,
// so the seven data modules run unchanged with data on this computer.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLocalClient } from './local/client';

export const supabase = createLocalClient() as unknown as SupabaseClient;
