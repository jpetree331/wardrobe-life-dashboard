// Typed CRUD layer for `entries`. Both Timeline and Sanctuary write to the
// same table; the `room` column scopes them. RLS enforces ownership; we don't
// need to pass user_id from the client (Postgres reads it from the JWT).

import { supabase } from './supabase';

export type Room = 'sanctuary' | 'timeline';
export type EntryType = 'lectio' | 'examen' | 'prayer' | 'scripture' | 'journal' | null;

export type Entry = {
  id: string;
  user_id: string;
  room: Room;
  entry_date: string;        // 'YYYY-MM-DD'
  title: string | null;
  body: string | null;
  body_type: 'rich' | 'plain';
  tags: string[];
  scripture_refs: string[];
  entry_type: EntryType;
  created_at: string;
  updated_at: string;
};

export type TimelineRow = {
  id: string;
  user_id: string;
  entry_date: string;
  title: string | null;
  summary: string | null;     // body, aliased
  tags: string[];
  created_at: string;
  updated_at: string;
  sanctuary_id: string | null;
  sanctuary_title: string | null;
  sanctuary_scripture_refs: string[] | null;
};

// ── Timeline ─────────────────────────────────────────────────────────────

export async function listTimeline(year: number | 'all'): Promise<TimelineRow[]> {
  let q = supabase
    .from('timeline_with_sanctuary')
    .select('*')
    .order('entry_date', { ascending: false });
  if (year !== 'all') {
    q = q.gte('entry_date', `${year}-01-01`).lte('entry_date', `${year}-12-31`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as TimelineRow[];
}

export async function timelineYears(): Promise<{ year: number; count: number }[]> {
  // Derive client-side from a lightweight projection — avoids needing an RPC.
  const { data, error } = await supabase
    .from('entries')
    .select('entry_date')
    .eq('room', 'timeline');
  if (error) throw error;
  const counts = new Map<number, number>();
  for (const row of data || []) {
    const y = Number((row.entry_date as string).slice(0, 4));
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, count]) => ({ year, count }));
}

// Timeline edits go through here — the partial unique index on
// (user_id, entry_date) WHERE room='timeline' cannot be used with ON CONFLICT
// (Postgres requires the conflict target to match a full unique constraint),
// so we branch insert vs. update by id rather than upserting.
export async function upsertTimelineEntry(input: {
  id?: string;
  entry_date: string;
  summary: string;
  tags: string[];
}): Promise<Entry> {
  if (input.id) {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_date: input.entry_date,
        body: input.summary,
        body_type: 'plain',
        tags: input.tags,
      })
      .eq('id', input.id)
      .eq('room', 'timeline')
      .select()
      .single();
    if (error) throw error;
    return data as Entry;
  }
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      room: 'timeline',
      entry_date: input.entry_date,
      title: null,
      body: input.summary,
      body_type: 'plain',
      tags: input.tags,
      scripture_refs: [],
      entry_type: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}

// Bulk insert from import — partial unique index can't be ON CONFLICT target,
// so we walk row-by-row. Single-user app; volumes are modest.
export async function bulkInsertTimeline(
  rows: Array<{ entry_date: string; summary: string; tags: string[] }>,
  mode: 'skip' | 'overwrite',
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const userId = await currentUserId();

  // Pre-fetch existing dates so we don't pay one round-trip per row to discover them.
  const { data: existingRows, error: fetchErr } = await supabase
    .from('entries')
    .select('id, entry_date')
    .eq('room', 'timeline');
  if (fetchErr) throw fetchErr;
  const existingByDate = new Map<string, string>();
  for (const r of existingRows || []) {
    existingByDate.set(r.entry_date as string, r.id as string);
  }

  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const existingId = existingByDate.get(r.entry_date);
    if (existingId) {
      if (mode === 'skip') {
        skipped++;
        continue;
      }
      const { error } = await supabase
        .from('entries')
        .update({ body: r.summary, body_type: 'plain', tags: r.tags })
        .eq('id', existingId)
        .eq('room', 'timeline');
      if (error) throw error;
      inserted++;
    } else {
      const { error } = await supabase.from('entries').insert({
        user_id: userId,
        room: 'timeline',
        entry_date: r.entry_date,
        title: null,
        body: r.summary,
        body_type: 'plain',
        tags: r.tags,
        scripture_refs: [],
        entry_type: null,
      });
      if (error) {
        if (error.code === '23505') {
          skipped++;
          continue;
        }
        throw error;
      }
      inserted++;
    }
  }
  return { inserted, skipped };
}

// ── Sanctuary ────────────────────────────────────────────────────────────

export async function listSanctuary(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('room', 'sanctuary')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Entry[];
}

export async function getSanctuaryEntry(id: string): Promise<Entry | null> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('id', id)
    .eq('room', 'sanctuary')
    .maybeSingle();
  if (error) throw error;
  return (data as Entry | null) || null;
}

export async function createSanctuaryEntry(input: {
  entry_date: string;
  title: string;
  body: string;
  entry_type?: EntryType;
  tags?: string[];
  scripture_refs?: string[];
}): Promise<Entry> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
      room: 'sanctuary',
      entry_date: input.entry_date,
      title: input.title,
      body: input.body,
      body_type: 'rich',
      entry_type: input.entry_type ?? null,
      tags: input.tags ?? [],
      scripture_refs: input.scripture_refs ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

export async function updateSanctuaryEntry(
  id: string,
  patch: Partial<Pick<Entry, 'title' | 'body' | 'entry_type' | 'tags' | 'scripture_refs' | 'entry_date'>>,
): Promise<Entry> {
  const { data, error } = await supabase
    .from('entries')
    .update(patch)
    .eq('id', id)
    .eq('room', 'sanctuary')
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

// Surface the day's timeline sentence inside a Sanctuary entry's inspector.
export async function timelineForDate(entry_date: string): Promise<TimelineRow | null> {
  const { data, error } = await supabase
    .from('timeline_with_sanctuary')
    .select('*')
    .eq('entry_date', entry_date)
    .maybeSingle();
  if (error) throw error;
  return (data as TimelineRow | null) || null;
}

// ── helpers ──────────────────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not signed in.');
  return data.user.id;
}
