// Typed CRUD over the treasury_verses table. The Treasury room's data
// layer — keep this file thin so the page component can think in domain
// objects without touching Supabase directly.
//
// Schema: app/supabase/migrations/0006_treasury.sql

import { supabase } from './supabase';

export type TreasuryKind = 'promise' | 'standout';

export type TreasuryVerse = {
  id: string;
  user_id: string;
  marked_on: string;          // 'YYYY-MM-DD'
  book: string;               // canonical name
  chapter: number;
  verse_from: number;
  verse_to: number | null;    // null = single-verse keep
  verse_text: string;
  translation: string;        // 'ESV' / 'KJV' / etc.
  kind: TreasuryKind;
  note: string | null;
  source_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Auth ──────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}

// ── Listing ───────────────────────────────────────────────────────────

/** All treasury verses for the current user, newest-marked first. */
export async function listTreasuryVerses(): Promise<TreasuryVerse[]> {
  const { data, error } = await supabase
    .from('treasury_verses')
    .select('*')
    .order('marked_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as TreasuryVerse[];
}

// ── Create / update / delete ─────────────────────────────────────────

export async function createTreasuryVerse(input: {
  marked_on: string;
  book: string;
  chapter: number;
  verse_from: number;
  verse_to?: number | null;
  verse_text: string;
  translation?: string;
  kind: TreasuryKind;
  note?: string | null;
  source_entry_id?: string | null;
}): Promise<TreasuryVerse> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('treasury_verses')
    .insert({
      user_id: userId,
      marked_on: input.marked_on,
      book: input.book,
      chapter: input.chapter,
      verse_from: input.verse_from,
      verse_to: input.verse_to ?? null,
      verse_text: input.verse_text,
      translation: input.translation ?? 'ESV',
      kind: input.kind,
      note: input.note ?? null,
      source_entry_id: input.source_entry_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TreasuryVerse;
}

export async function updateTreasuryVerse(
  id: string,
  patch: Partial<{
    marked_on: string;
    book: string;
    chapter: number;
    verse_from: number;
    verse_to: number | null;
    verse_text: string;
    translation: string;
    kind: TreasuryKind;
    note: string | null;
  }>,
): Promise<TreasuryVerse> {
  const { data, error } = await supabase
    .from('treasury_verses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TreasuryVerse;
}

export async function deleteTreasuryVerse(id: string): Promise<void> {
  const { error } = await supabase.from('treasury_verses').delete().eq('id', id);
  if (error) throw error;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Format a verse's reference for display: "John 3:16" or "John 3:16-17". */
export function formatReference(v: Pick<TreasuryVerse, 'book' | 'chapter' | 'verse_from' | 'verse_to'>): string {
  const base = `${v.book} ${v.chapter}:${v.verse_from}`;
  if (v.verse_to && v.verse_to !== v.verse_from) {
    return `${base}-${v.verse_to}`;
  }
  return base;
}
