// Typed CRUD layer for the Data room. Five tables, plus the dual-source
// merge that lets Sanctuary's `scripture_refs` flow into the Data tracker
// without needing a write hook on every Sanctuary save.
//
// Schema lives in supabase/migrations/0005_data.sql.

import { supabase } from './supabase';
import { parseBibleRef, type ParsedBibleRef } from './bibleRef';
import { verseCount } from './bibleVerseCounts';

// ── Types ──────────────────────────────────────────────────────────────

export type ScriptureRead = {
  id: string;
  user_id: string;
  read_date: string;
  book: string;
  chapter: number;
  verse_from: number | null;
  verse_to: number | null;
  note: string | null;
  /** 'manual' = explicit "+ Scripture" entry; 'sanctuary' = synthesized
   *  from a Sanctuary entry's scripture_refs tag. */
  source: 'manual' | 'sanctuary';
  created_at: string;
  updated_at: string;
};

export type BookRead = {
  id: string;
  user_id: string;
  finished_on: string;
  title: string;
  author: string;
  pages: number;
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  review: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyPageRead = {
  id: string;
  user_id: string;
  read_date: string;
  pages: number;
  title: string | null;
  author: string | null;
  created_at: string;
};

export type ReadingPlan = {
  id: string;
  user_id: string;
  name: string;
  books: string[];
  start_date: string;
  end_date: string;
  days_of_week: number[];
  unit: 'chapters' | 'verses';
  per_session: number;
  created_at: string;
  updated_at: string;
};

export type PlanCompletion = {
  id: string;
  user_id: string;
  plan_id: string;
  book: string;
  chapter: number;
  completed_at: string;
};

// ── Auth ──────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

// ── Scripture reads (manual log) ──────────────────────────────────────

export async function listManualScriptureReads(): Promise<ScriptureRead[]> {
  const { data, error } = await supabase
    .from('data_scripture_reads')
    .select('*')
    .order('read_date', { ascending: false });
  if (error) throw error;
  return ((data || []) as Omit<ScriptureRead, 'source'>[]).map((r) => ({ ...r, source: 'manual' }));
}

export async function createScriptureRead(input: {
  read_date: string;
  book: string;
  chapter: number;
  verse_from?: number | null;
  verse_to?: number | null;
  note?: string | null;
}): Promise<ScriptureRead> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('data_scripture_reads')
    .insert({
      user_id: userId,
      read_date: input.read_date,
      book: input.book,
      chapter: input.chapter,
      verse_from: input.verse_from ?? null,
      verse_to: input.verse_to ?? null,
      note: input.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as Omit<ScriptureRead, 'source'>), source: 'manual' };
}

export async function deleteScriptureRead(id: string): Promise<void> {
  const { error } = await supabase.from('data_scripture_reads').delete().eq('id', id);
  if (error) throw error;
}

// ── Sanctuary-derived scripture reads ─────────────────────────────────

/**
 * Read all Sanctuary entries that have any scripture_refs and synthesize
 * scripture reads from each parsed reference. Each synthesized read uses
 * the Sanctuary entry's `entry_date` and a deterministic id derived from
 * the entry id + ref index, so refreshes are stable and dedupe is easy.
 *
 * Refs that fail to parse (typos, free-text) are silently dropped.
 */
export async function listSanctuaryScriptureReads(): Promise<ScriptureRead[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, user_id, entry_date, title, scripture_refs, created_at, updated_at')
    .eq('room', 'sanctuary')
    .not('scripture_refs', 'is', null);
  if (error) throw error;
  const out: ScriptureRead[] = [];
  for (const e of (data || []) as Array<{
    id: string;
    user_id: string;
    entry_date: string;
    title: string | null;
    scripture_refs: string[];
    created_at: string;
    updated_at: string;
  }>) {
    if (!e.scripture_refs?.length) continue;
    e.scripture_refs.forEach((refStr, i) => {
      const parsed = parseBibleRef(refStr);
      if (!parsed) return;
      out.push({
        id: `sanctuary:${e.id}:${i}`,
        user_id: e.user_id,
        read_date: e.entry_date,
        book: parsed.book,
        chapter: parsed.chapter,
        verse_from: parsed.verseFrom ?? null,
        verse_to: parsed.verseTo ?? null,
        note: e.title || null,
        source: 'sanctuary',
        created_at: e.created_at,
        updated_at: e.updated_at,
      });
    });
  }
  return out;
}

/**
 * Merged dual-source list. If both a manual entry and a Sanctuary-derived
 * entry exist for the same (date, book, chapter, verse_from, verse_to),
 * keep the manual one — it represents the user's explicit intent and
 * may have a custom note attached.
 */
export async function listAllScriptureReads(): Promise<ScriptureRead[]> {
  const [manual, sanctuary] = await Promise.all([
    listManualScriptureReads(),
    listSanctuaryScriptureReads(),
  ]);
  const seen = new Set<string>();
  const key = (r: ScriptureRead) =>
    `${r.read_date}|${r.book}|${r.chapter}|${r.verse_from ?? ''}|${r.verse_to ?? ''}`;
  const out: ScriptureRead[] = [];
  for (const r of manual) {
    seen.add(key(r));
    out.push(r);
  }
  for (const r of sanctuary) {
    if (seen.has(key(r))) continue;
    out.push(r);
  }
  return out.sort((a, b) => b.read_date.localeCompare(a.read_date));
}

/**
 * Verses-read count for a single Scripture read entry. Whole-chapter
 * entries return the chapter's full verse count from the manifest.
 */
export function versesInRead(r: ScriptureRead): number {
  if (r.verse_from !== null && r.verse_to !== null) {
    return Math.max(0, r.verse_to - r.verse_from + 1);
  }
  return verseCount(r.book, r.chapter);
}

/** Chapters-read count for a Scripture read. Partial chapter = 1, whole = 1, range crossing chapters not currently supported. */
export function chaptersInRead(_r: ScriptureRead): number {
  // The schema records a single (book, chapter) per row, so each read
  // counts as one chapter — even a verse-range read still belongs to
  // exactly one chapter.
  return 1;
}

/** As-fraction-of-chapter measurement, useful for chapters-mode heatmap. */
export function chapterFractionInRead(r: ScriptureRead): number {
  if (r.verse_from !== null && r.verse_to !== null) {
    const chapVerses = verseCount(r.book, r.chapter);
    if (chapVerses <= 0) return 1;
    return Math.min(1, (r.verse_to - r.verse_from + 1) / chapVerses);
  }
  return 1;
}

// ── Book reads ────────────────────────────────────────────────────────

export async function listBookReads(): Promise<BookRead[]> {
  const { data, error } = await supabase
    .from('data_book_reads')
    .select('*')
    .order('finished_on', { ascending: false });
  if (error) throw error;
  return (data || []) as BookRead[];
}

export async function createBookRead(input: {
  finished_on: string;
  title: string;
  author?: string;
  pages?: number;
  rating?: number;
  review?: string | null;
}): Promise<BookRead> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('data_book_reads')
    .insert({
      user_id: userId,
      finished_on: input.finished_on,
      title: input.title,
      author: input.author ?? '',
      pages: input.pages ?? 0,
      rating: input.rating ?? 0,
      review: input.review ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BookRead;
}

export async function deleteBookRead(id: string): Promise<void> {
  const { error } = await supabase.from('data_book_reads').delete().eq('id', id);
  if (error) throw error;
}

// ── Daily page reads ─────────────────────────────────────────────────

export async function listDailyPageReads(): Promise<DailyPageRead[]> {
  const { data, error } = await supabase
    .from('data_daily_page_reads')
    .select('*')
    .order('read_date', { ascending: false });
  if (error) throw error;
  return (data || []) as DailyPageRead[];
}

export async function createDailyPageRead(input: {
  read_date: string;
  pages: number;
  title?: string | null;
  author?: string | null;
}): Promise<DailyPageRead> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('data_daily_page_reads')
    .insert({
      user_id: userId,
      read_date: input.read_date,
      pages: input.pages,
      title: input.title ?? null,
      author: input.author ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DailyPageRead;
}

// ── Reading plans ─────────────────────────────────────────────────────

export async function listReadingPlans(): Promise<ReadingPlan[]> {
  const { data, error } = await supabase
    .from('data_reading_plans')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ReadingPlan[];
}

export async function createReadingPlan(input: {
  name: string;
  books: string[];
  start_date: string;
  end_date: string;
  days_of_week: number[];
  unit?: 'chapters' | 'verses';
  per_session?: number;
}): Promise<ReadingPlan> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('data_reading_plans')
    .insert({
      user_id: userId,
      name: input.name,
      books: input.books,
      start_date: input.start_date,
      end_date: input.end_date,
      days_of_week: input.days_of_week,
      unit: input.unit ?? 'chapters',
      per_session: input.per_session ?? 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ReadingPlan;
}

export async function updateReadingPlan(
  id: string,
  patch: Partial<{
    name: string;
    books: string[];
    start_date: string;
    end_date: string;
    days_of_week: number[];
    unit: 'chapters' | 'verses';
    per_session: number;
  }>,
): Promise<ReadingPlan> {
  const { data, error } = await supabase
    .from('data_reading_plans')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ReadingPlan;
}

export async function deleteReadingPlan(id: string): Promise<void> {
  // Cascade in the schema deletes completions automatically.
  const { error } = await supabase.from('data_reading_plans').delete().eq('id', id);
  if (error) throw error;
}

// ── Plan completions ──────────────────────────────────────────────────
//
// Per the schema, completions are SEPARATE from data_scripture_reads —
// completing a plan session does NOT log a Scripture read and vice versa.
// They serve different purposes: completions track plan progress; reads
// track lived study.

export async function listPlanCompletions(planId: string): Promise<PlanCompletion[]> {
  const { data, error } = await supabase
    .from('data_plan_completions')
    .select('*')
    .eq('plan_id', planId);
  if (error) throw error;
  return (data || []) as PlanCompletion[];
}

export async function listAllPlanCompletions(): Promise<PlanCompletion[]> {
  const { data, error } = await supabase
    .from('data_plan_completions')
    .select('*');
  if (error) throw error;
  return (data || []) as PlanCompletion[];
}

/**
 * Toggle: if (plan, book, chapter) already exists, delete it; else insert.
 *
 * Concurrency: SELECT-then-INSERT is racy if the user double-taps. The
 * schema's `unique (plan_id, book, chapter)` constraint means the DB
 * rejects the second insert with code 23505; we treat that as success
 * ("already created by the prior call") rather than re-throwing, which
 * keeps the UI consistent with what the user sees.
 */
export async function togglePlanCompletion(
  planId: string,
  book: string,
  chapter: number,
): Promise<{ created: boolean }> {
  const userId = await currentUserId();
  // Find existing.
  const { data: existing, error: selErr } = await supabase
    .from('data_plan_completions')
    .select('id')
    .eq('plan_id', planId)
    .eq('book', book)
    .eq('chapter', chapter)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await supabase
      .from('data_plan_completions')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;
    return { created: false };
  }
  const { error } = await supabase
    .from('data_plan_completions')
    .insert({ user_id: userId, plan_id: planId, book, chapter });
  if (error) {
    // Postgres unique-violation = the row exists from a concurrent insert.
    // Treat as success — the UI will show it as completed either way.
    if ((error as { code?: string })?.code === '23505') {
      return { created: true };
    }
    throw error;
  }
  return { created: true };
}

// ── Cross-room calendar markers ──────────────────────────────────────

/**
 * Set of dates where the user has at least one entry in the named room.
 * Used by the calendar to render the Sanctuary circle / Timeline square
 * marker on each day.
 */
export async function listEntryDatesByRoom(room: 'sanctuary' | 'timeline'): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('entries')
    .select('entry_date')
    .eq('room', room);
  if (error) throw error;
  const out = new Set<string>();
  for (const r of (data || []) as Array<{ entry_date: string }>) out.add(r.entry_date);
  return out;
}

// ── Re-exports for convenience ────────────────────────────────────────

export type { ParsedBibleRef };
