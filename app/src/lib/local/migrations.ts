// The app's REAL migrations, imported as raw SQL (Vite `?raw`). The local
// database is built by the exact files the cloud database was built by —
// same tables, same view, same triggers, same constraints. Adding migration
// 0015 later means adding one import + one array entry here.

import m0001 from '../../../supabase/migrations/0001_init.sql?raw';
import m0002 from '../../../supabase/migrations/0002_build2.sql?raw';
import m0003 from '../../../supabase/migrations/0003_relax_timeline_unique.sql?raw';
import m0004 from '../../../supabase/migrations/0004_notes.sql?raw';
import m0005 from '../../../supabase/migrations/0005_data.sql?raw';
import m0006 from '../../../supabase/migrations/0006_treasury.sql?raw';
import m0007 from '../../../supabase/migrations/0007_daybook.sql?raw';
import m0008 from '../../../supabase/migrations/0008_practice.sql?raw';
import m0009 from '../../../supabase/migrations/0009_notes_image_cards.sql?raw';
import m0010 from '../../../supabase/migrations/0010_notes_file_cards.sql?raw';
import m0011 from '../../../supabase/migrations/0011_notes_columns.sql?raw';
import m0012 from '../../../supabase/migrations/0012_notes_arrows.sql?raw';
import m0013 from '../../../supabase/migrations/0013_notes_swatch_comment.sql?raw';
import m0014 from '../../../supabase/migrations/0014_notes_starred.sql?raw';

export const MIGRATIONS: Array<{ name: string; sql: string }> = [
  { name: '0001_init', sql: m0001 },
  { name: '0002_build2', sql: m0002 },
  { name: '0003_relax_timeline_unique', sql: m0003 },
  { name: '0004_notes', sql: m0004 },
  { name: '0005_data', sql: m0005 },
  { name: '0006_treasury', sql: m0006 },
  { name: '0007_daybook', sql: m0007 },
  { name: '0008_practice', sql: m0008 },
  { name: '0009_notes_image_cards', sql: m0009 },
  { name: '0010_notes_file_cards', sql: m0010 },
  { name: '0011_notes_columns', sql: m0011 },
  { name: '0012_notes_arrows', sql: m0012 },
  { name: '0013_notes_swatch_comment', sql: m0013 },
  { name: '0014_notes_starred', sql: m0014 },
];
