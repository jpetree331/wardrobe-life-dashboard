import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the Supabase client BEFORE importing the module under test. ──
// We capture the last query for assertions.

type Captured = {
  table?: string;
  select?: string;
  filters: Array<{ method: string; args: unknown[] }>;
  insert?: unknown;
  update?: unknown;
  delete?: boolean;
  upsert?: { rows: unknown; opts?: unknown };
  finisher?: 'single' | 'maybeSingle' | null;
  ordering?: Array<{ column: string; opts?: unknown }>;
};

let captured: Captured;
let nextResult: { data: any; error: any } = { data: null, error: null };
let userId = 'user-1';
let getUserError: any = null;

function builder() {
  const b: any = {};
  const collect = (method: string) => (...args: unknown[]) => {
    captured.filters.push({ method, args });
    return b;
  };
  b.select = (s?: string) => { captured.select = s; return b; };
  b.eq    = collect('eq');
  b.neq   = collect('neq');
  b.gte   = collect('gte');
  b.lte   = collect('lte');
  b.in    = collect('in');
  b.order = (column: string, opts?: unknown) => {
    captured.ordering = captured.ordering || [];
    captured.ordering.push({ column, opts });
    return b;
  };
  b.insert = (rows: unknown) => { captured.insert = rows; return b; };
  b.update = (patch: unknown) => { captured.update = patch; return b; };
  b.delete = () => { captured.delete = true; return b; };
  b.upsert = (rows: unknown, opts?: unknown) => {
    captured.upsert = { rows, opts };
    return b;
  };
  b.single = () => { captured.finisher = 'single'; return Promise.resolve(nextResult); };
  b.maybeSingle = () => { captured.finisher = 'maybeSingle'; return Promise.resolve(nextResult); };
  b.then = (resolve: (v: any) => void) => resolve(nextResult);
  return b;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      captured.table = table;
      return builder();
    },
    auth: {
      getUser: () => Promise.resolve({
        data: { user: getUserError ? null : { id: userId } },
        error: getUserError,
      }),
    },
  },
}));

import {
  bulkInsertTimeline,
  createSanctuaryEntry,
  deleteEntry,
  getSanctuaryEntry,
  listSanctuary,
  listTimeline,
  timelineForDate,
  timelineYears,
  updateSanctuaryEntry,
  upsertTimelineEntry,
} from '../src/lib/entries';

beforeEach(() => {
  captured = { filters: [], finisher: null };
  nextResult = { data: null, error: null };
  userId = 'user-1';
  getUserError = null;
});

describe('listTimeline', () => {
  it('queries the timeline_with_sanctuary view, descending by date', async () => {
    nextResult = { data: [], error: null };
    await listTimeline('all');
    expect(captured.table).toBe('timeline_with_sanctuary');
    expect(captured.select).toBe('*');
    expect(captured.ordering?.[0]).toEqual({
      column: 'entry_date',
      opts: { ascending: false },
    });
    // No date range filters when 'all'.
    const filterMethods = captured.filters.map((f) => f.method);
    expect(filterMethods).not.toContain('gte');
    expect(filterMethods).not.toContain('lte');
  });

  it('applies year-range filters when given a numeric year', async () => {
    nextResult = { data: [], error: null };
    await listTimeline(2024);
    const filters = captured.filters;
    expect(filters).toContainEqual({ method: 'gte', args: ['entry_date', '2024-01-01'] });
    expect(filters).toContainEqual({ method: 'lte', args: ['entry_date', '2024-12-31'] });
  });

  it('throws when supabase returns an error', async () => {
    nextResult = { data: null, error: { message: 'rls denied' } };
    await expect(listTimeline('all')).rejects.toMatchObject({ message: 'rls denied' });
  });
});

describe('timelineYears', () => {
  it('aggregates counts per year, sorted newest first', async () => {
    nextResult = {
      data: [
        { entry_date: '2024-04-19' },
        { entry_date: '2024-12-25' },
        { entry_date: '2025-01-01' },
        { entry_date: '2023-06-12' },
      ],
      error: null,
    };
    const out = await timelineYears();
    expect(out).toEqual([
      { year: 2025, count: 1 },
      { year: 2024, count: 2 },
      { year: 2023, count: 1 },
    ]);
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['room', 'timeline'] });
  });

  it('returns empty array when no entries', async () => {
    nextResult = { data: [], error: null };
    expect(await timelineYears()).toEqual([]);
  });

  it('returns empty array when data is null (no rows)', async () => {
    nextResult = { data: null, error: null };
    expect(await timelineYears()).toEqual([]);
  });
});

describe('upsertTimelineEntry', () => {
  it('does an UPDATE (not insert) when id is provided', async () => {
    nextResult = { data: { id: 'e1' }, error: null };
    await upsertTimelineEntry({
      id: 'e1',
      entry_date: '2024-04-19',
      summary: 'walked',
      tags: ['easter'],
    });
    expect(captured.update).toMatchObject({
      entry_date: '2024-04-19',
      body: 'walked',
      body_type: 'plain',
      tags: ['easter'],
    });
    // The update path must scope by id AND by room='timeline' so a sanctuary
    // row can never be smashed by a timeline edit.
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['id', 'e1'] });
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['room', 'timeline'] });
    expect(captured.insert).toBeUndefined();
  });

  it('does an INSERT when id is missing', async () => {
    nextResult = { data: { id: 'new' }, error: null };
    await upsertTimelineEntry({
      entry_date: '2024-04-19',
      summary: 'walked',
      tags: [],
    });
    expect(captured.insert).toMatchObject({
      user_id: 'user-1',
      room: 'timeline',
      entry_date: '2024-04-19',
      body: 'walked',
      body_type: 'plain',
      tags: [],
      title: null,
      scripture_refs: [],
      entry_type: null,
    });
    expect(captured.update).toBeUndefined();
  });

  it('throws when not signed in', async () => {
    getUserError = { message: 'no session' };
    await expect(
      upsertTimelineEntry({ entry_date: '2024-04-19', summary: '', tags: [] }),
    ).rejects.toThrow(/not signed in/i);
  });

  it('propagates supabase errors', async () => {
    nextResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    await expect(
      upsertTimelineEntry({ entry_date: '2024-04-19', summary: '', tags: [] }),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('deleteEntry', () => {
  it('deletes by id', async () => {
    nextResult = { data: null, error: null };
    await deleteEntry('e1');
    expect(captured.delete).toBe(true);
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['id', 'e1'] });
  });

  it('throws on error', async () => {
    nextResult = { data: null, error: { message: 'gone' } };
    await expect(deleteEntry('e1')).rejects.toMatchObject({ message: 'gone' });
  });
});

describe('listSanctuary', () => {
  it('filters room=sanctuary, orders by date desc then created desc', async () => {
    nextResult = { data: [], error: null };
    await listSanctuary();
    expect(captured.table).toBe('entries');
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['room', 'sanctuary'] });
    expect(captured.ordering).toEqual([
      { column: 'entry_date', opts: { ascending: false } },
      { column: 'created_at', opts: { ascending: false } },
    ]);
  });
});

describe('getSanctuaryEntry', () => {
  it('returns null when not found (maybeSingle)', async () => {
    nextResult = { data: null, error: null };
    const out = await getSanctuaryEntry('missing');
    expect(out).toBeNull();
    expect(captured.finisher).toBe('maybeSingle');
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['id', 'missing'] });
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['room', 'sanctuary'] });
  });
});

describe('createSanctuaryEntry', () => {
  it('inserts a sanctuary row with sensible defaults', async () => {
    nextResult = { data: { id: 'new' }, error: null };
    await createSanctuaryEntry({
      entry_date: '2024-04-19',
      title: 'Test',
      body: '<p>hi</p>',
    });
    expect(captured.insert).toMatchObject({
      user_id: 'user-1',
      room: 'sanctuary',
      title: 'Test',
      body: '<p>hi</p>',
      body_type: 'rich',
      tags: [],
      scripture_refs: [],
      entry_type: null,
    });
  });

  it('respects explicit entry_type/tags/scripture_refs', async () => {
    nextResult = { data: { id: 'new' }, error: null };
    await createSanctuaryEntry({
      entry_date: '2024-04-19',
      title: 'Lectio',
      body: '',
      entry_type: 'lectio',
      tags: ['t'],
      scripture_refs: ['Luke 24'],
    });
    expect(captured.insert).toMatchObject({
      entry_type: 'lectio',
      tags: ['t'],
      scripture_refs: ['Luke 24'],
    });
  });
});

describe('updateSanctuaryEntry', () => {
  it('updates by id, scoped to room=sanctuary', async () => {
    nextResult = { data: { id: 'e1' }, error: null };
    await updateSanctuaryEntry('e1', { title: 'New Title' });
    expect(captured.update).toEqual({ title: 'New Title' });
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['id', 'e1'] });
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['room', 'sanctuary'] });
  });
});

describe('timelineForDate', () => {
  it('looks up the joined view by date, returns null when missing', async () => {
    nextResult = { data: null, error: null };
    const out = await timelineForDate('2024-04-19');
    expect(out).toBeNull();
    expect(captured.table).toBe('timeline_with_sanctuary');
    expect(captured.finisher).toBe('maybeSingle');
    expect(captured.filters).toContainEqual({ method: 'eq', args: ['entry_date', '2024-04-19'] });
  });
});

describe('bulkInsertTimeline (single-mode, exact-duplicate skip)', () => {
  it('returns 0/0 for empty input without any DB calls', async () => {
    const out = await bulkInsertTimeline([]);
    expect(out).toEqual({ inserted: 0, skipped: 0 });
  });

  it('skips a row whose (date, summary) pair already exists; inserts new ones', async () => {
    // Pre-fetch returns one existing pair; we send three rows.
    nextResult = {
      data: [{ entry_date: '2024-01-01', body: 'a' }],
      error: null,
    };
    const out = await bulkInsertTimeline([
      { entry_date: '2024-01-01', summary: 'a', tags: [] }, // exact dupe → skip
      { entry_date: '2024-01-02', summary: 'b', tags: [] }, // new → insert
      { entry_date: '2024-01-03', summary: 'c', tags: [] }, // new → insert
    ]);
    expect(out).toEqual({ inserted: 2, skipped: 1 });
  });

  it('keeps DISTINCT same-day entries (different text on the same date)', async () => {
    // Pre-fetch shows date 2024-01-01 already has summary "morning"; we send
    // a new sentence for that same date — must NOT be treated as a dupe.
    nextResult = {
      data: [{ entry_date: '2024-01-01', body: 'morning event' }],
      error: null,
    };
    const out = await bulkInsertTimeline([
      { entry_date: '2024-01-01', summary: 'morning event', tags: [] }, // dupe
      { entry_date: '2024-01-01', summary: 'evening event', tags: [] }, // distinct
    ]);
    expect(out).toEqual({ inserted: 1, skipped: 1 });
  });

  it('de-dupes within the import file itself (two identical rows = one inserted)', async () => {
    nextResult = { data: [], error: null };
    const out = await bulkInsertTimeline([
      { entry_date: '2024-01-01', summary: 'same', tags: [] },
      { entry_date: '2024-01-01', summary: 'same', tags: [] },
      { entry_date: '2024-01-01', summary: 'same', tags: [] },
    ]);
    expect(out).toEqual({ inserted: 1, skipped: 2 });
  });

  it('treats trailing whitespace as identical (avoids near-duplicate noise)', async () => {
    nextResult = {
      data: [{ entry_date: '2024-01-01', body: 'walked' }],
      error: null,
    };
    const out = await bulkInsertTimeline([
      { entry_date: '2024-01-01', summary: 'walked   ', tags: [] }, // trailing ws → dupe
    ]);
    expect(out).toEqual({ inserted: 0, skipped: 1 });
  });
});
