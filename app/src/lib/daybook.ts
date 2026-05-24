// Typed CRUD over Daybook's four tables. Same patterns as src/lib/data.ts
// and src/lib/treasury.ts — auth check, throw on error, shaped return.
//
// Schema: app/supabase/migrations/0007_daybook.sql

import { supabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────────

export type DaybookCategory = {
  id: string;
  user_id: string;
  name: string;
  color: string;          // any CSS color: hex, oklch(), etc.
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DaybookRecur = 'none' | 'daily' | 'weekdays' | 'weekly';

export type DaybookBlock = {
  id: string;
  user_id: string;
  title: string;
  category_id: string | null;
  notes: string | null;
  start_at: string;       // ISO 8601 UTC
  end_at: string;
  recur: DaybookRecur;
  tracked_planned_min: number | null;
  tracked_actual_min: number | null;
  created_at: string;
  updated_at: string;
};

export type DaybookTemplate = {
  id: string;
  user_id: string;
  name: string;
  duration_min: number;
  category_id: string | null;
  start_hint: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A block as it appears in a rendered view. Same shape as DaybookBlock,
 * plus optional flags identifying phantom (recurrence-derived) instances.
 * For phantoms, the `id` is synthetic (combines master id + date) so
 * React keys stay unique; the underlying master id is in `_master_id`.
 */
export type DaybookBlockInstance = DaybookBlock & {
  _phantom?: boolean;
  _master_id?: string;
};

export type DaybookGoal = {
  id: string;
  user_id: string;
  text: string;
  done: boolean;
  meta: string | null;
  for_week: string | null;   // 'YYYY-MM-DD' (Sunday-anchored) or null
  created_at: string;
  updated_at: string;
};

// ── Auth ──────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

// ── Categories ────────────────────────────────────────────────────────

export async function listCategories(): Promise<DaybookCategory[]> {
  const { data, error } = await supabase
    .from('daybook_categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as DaybookCategory[];
}

export async function createCategory(input: {
  name: string;
  color: string;
  sort_order?: number;
}): Promise<DaybookCategory> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('daybook_categories')
    .insert({
      user_id: userId,
      name: input.name,
      color: input.color,
      sort_order: input.sort_order ?? 100,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DaybookCategory;
}

export async function updateCategory(
  id: string,
  patch: Partial<{ name: string; color: string; sort_order: number }>,
): Promise<DaybookCategory> {
  const { data, error } = await supabase
    .from('daybook_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DaybookCategory;
}

export async function deleteCategory(id: string): Promise<void> {
  // Blocks referencing this category get category_id = null via ON DELETE
  // SET NULL in the schema — they become "uncategorized" and render in a
  // neutral fallback color. No data is destroyed.
  const { error } = await supabase.from('daybook_categories').delete().eq('id', id);
  if (error) throw error;
}

/**
 * The 6 starter categories from the Daybook handoff (vibrant theme).
 * Inserted lazily on first room visit if the user has no categories yet.
 * Hex values approximate the oklch() originals from the design tokens.
 */
const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; color: string; sort_order: number }> = [
  { name: 'Deep Work', color: '#E73A1A', sort_order: 10 },
  { name: 'Meetings',  color: '#2664E0', sort_order: 20 },
  { name: 'Personal',  color: '#4FA336', sort_order: 30 },
  { name: 'Health',    color: '#E69132', sort_order: 40 },
  { name: 'Admin',     color: '#9636C9', sort_order: 50 },
  { name: 'Break',     color: '#E2C42E', sort_order: 60 },
];

/**
 * If the user has no categories yet, seed the 6 vibrant starters. Returns
 * the freshly-inserted list. Idempotent: a second call is a no-op once
 * categories exist, even if the user has only kept one.
 */
export async function seedDefaultCategoriesIfEmpty(): Promise<DaybookCategory[]> {
  const existing = await listCategories();
  if (existing.length > 0) return existing;
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('daybook_categories')
    .insert(DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId })))
    .select();
  if (error) throw error;
  return (data || []) as DaybookCategory[];
}

// ── Blocks ────────────────────────────────────────────────────────────

/**
 * List blocks whose start_at is between [startIso, endIso). Used by the
 * Day / Week / Month views — each computes its own range and asks for
 * blocks that touch it.
 */
export async function listBlocksForRange(
  startIso: string,
  endIso: string,
): Promise<DaybookBlock[]> {
  const { data, error } = await supabase
    .from('daybook_blocks')
    .select('*')
    .gte('start_at', startIso)
    .lt('start_at', endIso)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data || []) as DaybookBlock[];
}

/**
 * List all recurring "master" blocks that started before `beforeIso`.
 * Used to materialize phantom instances onto a date range — only masters
 * whose start_at predates the range can possibly project into it.
 */
export async function listRecurringMasters(
  beforeIso: string,
): Promise<DaybookBlock[]> {
  const { data, error } = await supabase
    .from('daybook_blocks')
    .select('*')
    .neq('recur', 'none')
    .lt('start_at', beforeIso)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data || []) as DaybookBlock[];
}

export async function createBlock(input: {
  title: string;
  category_id: string | null;
  notes?: string | null;
  start_at: string;
  end_at: string;
  recur?: DaybookRecur;
}): Promise<DaybookBlock> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('daybook_blocks')
    .insert({
      user_id: userId,
      title: input.title,
      category_id: input.category_id,
      notes: input.notes ?? null,
      start_at: input.start_at,
      end_at: input.end_at,
      recur: input.recur ?? 'none',
    })
    .select()
    .single();
  if (error) throw error;
  return data as DaybookBlock;
}

export async function updateBlock(
  id: string,
  patch: Partial<{
    title: string;
    category_id: string | null;
    notes: string | null;
    start_at: string;
    end_at: string;
    recur: DaybookRecur;
    tracked_planned_min: number | null;
    tracked_actual_min: number | null;
  }>,
): Promise<DaybookBlock> {
  const { data, error } = await supabase
    .from('daybook_blocks')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as DaybookBlock;
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('daybook_blocks').delete().eq('id', id);
  if (error) throw error;
}

// ── Date helpers ──────────────────────────────────────────────────────

/**
 * Sunday-anchored start of the week containing `d`, midnight local time.
 * Returns a fresh Date object — does not mutate the input.
 */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

/** End of the week (exclusive — start of next Sunday). */
export function endOfWeek(d: Date): Date {
  const out = startOfWeek(d);
  out.setDate(out.getDate() + 7);
  return out;
}

/** First-of-month at midnight local time. */
export function startOfMonth(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(1);
  return out;
}

/** Exclusive end of month — start of the following month. */
export function endOfMonth(d: Date): Date {
  const out = startOfMonth(d);
  out.setMonth(out.getMonth() + 1);
  return out;
}

/** Local-time YYYY-MM-DD (matches localToday from src/lib/dates.ts). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Start of the user's local day as a UTC ISO string — what we pass to
 * listBlocksForRange for the "give me today's blocks" query.
 */
export function localDayStartIso(d: Date): string {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** End of the local day (exclusive — i.e. start of next day). */
export function localDayEndIso(d: Date): string {
  const end = new Date(d);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

/** Whole local week (Sun-anchored) as a [start, end) ISO pair. */
export function localWeekRangeIso(d: Date): { startIso: string; endIso: string } {
  return {
    startIso: startOfWeek(d).toISOString(),
    endIso: endOfWeek(d).toISOString(),
  };
}

/** Whole local month as a [start, end) ISO pair. */
export function localMonthRangeIso(d: Date): { startIso: string; endIso: string } {
  return {
    startIso: startOfMonth(d).toISOString(),
    endIso: endOfMonth(d).toISOString(),
  };
}

/**
 * Combine a local YYYY-MM-DD with a local HH:MM and return a UTC ISO
 * timestamp. The block editor modal uses native <input type="date"> +
 * <input type="time"> which give us those two pieces.
 */
export function combineLocalDateTimeToIso(dateKey: string, timeHHMM: string): string {
  const [y, m, day] = dateKey.split('-').map((s) => parseInt(s, 10));
  const [h, min] = timeHHMM.split(':').map((s) => parseInt(s, 10));
  const d = new Date(y, (m || 1) - 1, day || 1, h || 0, min || 0, 0, 0);
  return d.toISOString();
}

/** Format an ISO timestamp as local HH:MM for an <input type="time">. */
export function isoToLocalTimeHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Format an ISO timestamp as a friendly "8:00 AM" / "9:30 PM" string. */
export function isoToLocalTime12h(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(m).padStart(2, '0');
  return `${h}:${mm} ${ap}`;
}
