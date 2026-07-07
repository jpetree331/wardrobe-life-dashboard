// Integration proof for local/desktop mode: a real PGlite Postgres is built
// from the app's REAL migrations (0001–0014) via the same initializeDatabase
// the desktop app uses, then the local client is exercised with the exact
// call shapes the app's data modules make against supabase-js.

import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createPGlite, initializeDatabase } from '../src/lib/local/database';
import { LocalQueryBuilder } from '../src/lib/local/queryBuilder';
import { createAuthShim } from '../src/lib/local/authShim';
import { createStorageShim } from '../src/lib/local/storageShim';
import { LOCAL_USER_ID } from '../src/lib/local/prelude';
import { MIGRATIONS } from '../src/lib/local/migrations';

let pg: PGlite;
let ready: Promise<PGlite>;
const from = (table: string) => new LocalQueryBuilder(ready, table);

beforeAll(async () => {
  pg = createPGlite(); // in-memory, with the app's PostgREST-style parsers
  ready = Promise.resolve(pg);
  await initializeDatabase(pg);
}, 120_000);

describe('database bootstrap', () => {
  it('applies every real migration exactly once (idempotent re-run)', async () => {
    const first = await pg.query<{ name: string }>('select name from local_migrations order by name');
    expect(first.rows.map((r) => r.name)).toEqual(MIGRATIONS.map((m) => m.name).sort());
    // Re-initializing must be a no-op, not a failure.
    await initializeDatabase(pg);
    const again = await pg.query('select count(*)::int as n from local_migrations');
    expect((again.rows[0] as { n: number }).n).toBe(MIGRATIONS.length);
  });

  it('seeds the single local user', async () => {
    const res = await pg.query('select id from auth.users');
    expect(res.rows).toEqual([{ id: LOCAL_USER_ID }]);
  });

  it('creates the cross-room view from migration 0002', async () => {
    const res = await pg.query(
      "select count(*)::int as n from information_schema.views where table_name = 'timeline_with_sanctuary'",
    );
    expect((res.rows[0] as { n: number }).n).toBe(1);
  });
});

describe('query builder — the shapes the app actually uses', () => {
  it('insert .select().single() round-trips arrays and jsonb', async () => {
    const { data, error } = await from('entries')
      .insert({
        user_id: LOCAL_USER_ID,
        room: 'sanctuary',
        entry_date: '2026-04-19',
        title: 'Emmaus',
        body: '<p>He was known to them in the breaking of the bread.</p>',
        body_type: 'rich',
        tags: ['_veil', 'grace'],
        scripture_refs: ['Luke 24:13-35'],
        entry_type: 'lectio',
        listening_prayer: true,
        stillness_sessions: [{ start: '06:30', end: '07:00', minutes: 30 }],
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.id).toBeTruthy();
    expect(data.tags).toEqual(['_veil', 'grace']);
    expect(data.scripture_refs).toEqual(['Luke 24:13-35']);
    expect(data.stillness_sessions).toEqual([{ start: '06:30', end: '07:00', minutes: 30 }]);
    expect(data.listening_prayer).toBe(true);
    // PostgREST compatibility: date + timestamps come back as STRINGS.
    expect(data.entry_date).toBe('2026-04-19');
    expect(typeof data.created_at).toBe('string');
    expect(data.created_at).toContain('T');
  });

  it('listSanctuary shape: select * + eq + double order', async () => {
    await from('entries').insert({
      user_id: LOCAL_USER_ID, room: 'sanctuary', entry_date: '2026-01-05',
      title: 'Older', body: '', body_type: 'rich', tags: [], scripture_refs: [],
      entry_type: null, listening_prayer: false, stillness_sessions: [],
    });
    const { data, error } = await from('entries')
      .select('*')
      .eq('room', 'sanctuary')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    expect(error).toBeNull();
    expect(data.length).toBe(2);
    expect(data[0].entry_date > data[1].entry_date).toBe(true);
  });

  it('update + eq + select single fires the updated_at trigger', async () => {
    const { data: row } = await from('entries')
      .select('*').eq('title', 'Emmaus').single();
    const before = row.updated_at;
    await new Promise((r) => setTimeout(r, 20));
    const { data: updated, error } = await from('entries')
      .update({ title: 'Road to Emmaus' })
      .eq('id', row.id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(updated.title).toBe('Road to Emmaus');
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });

  it('gte/lte range filters (heatmap/list shapes)', async () => {
    const { data } = await from('entries')
      .select('entry_date')
      .gte('entry_date', '2026-01-01')
      .lte('entry_date', '2026-01-31');
    expect(data).toEqual([{ entry_date: '2026-01-05' }]);
  });

  it('maybeSingle returns null on no rows; single errors with PGRST116', async () => {
    const none = await from('entries').select('*').eq('title', 'nope').maybeSingle();
    expect(none.error).toBeNull();
    expect(none.data).toBeNull();
    const single = await from('entries').select('*').eq('title', 'nope').single();
    expect(single.data).toBeNull();
    expect(single.error?.code).toBe('PGRST116');
  });

  it('enforces the migrations’ CHECK constraints (bogus card type rejected)', async () => {
    // First a board (notes_cards.board_id FK).
    const { data: board } = await from('notes_boards')
      .insert({ user_id: LOCAL_USER_ID, name: 'Home', is_root: true })
      .select()
      .single();
    const bad = await from('notes_cards').insert({
      user_id: LOCAL_USER_ID, board_id: board.id, type: 'bogus-type',
      x: 0, y: 0, payload: {},
    });
    expect(bad.error).not.toBeNull();
    expect(bad.error!.message).toMatch(/check|constraint/i);
  });

  it('.or() with json selectors and dotted values (storage-path lookup)', async () => {
    const { data: board } = await from('notes_boards')
      .select('*').eq('is_root', true).single();
    const path = `${LOCAL_USER_ID}/abc-orig.png`;
    await from('notes_cards').insert({
      user_id: LOCAL_USER_ID, board_id: board.id, type: 'image', x: 1, y: 2,
      payload: { storagePath: path, naturalW: 10, naturalH: 10 },
    });
    const { data, error } = await from('notes_cards')
      .select('id')
      .or(`payload->>storagePath.eq.${path},payload->>thumbPath.eq.${path}`)
      .limit(1);
    expect(error).toBeNull();
    expect(data.length).toBe(1);
    const miss = await from('notes_cards')
      .select('id')
      .or('payload->>storagePath.eq.zzz,payload->>thumbPath.eq.zzz')
      .limit(1);
    expect(miss.data.length).toBe(0);
  });

  it('numeric columns round-trip as JS numbers, not strings (card x/y/w/h)', async () => {
    // PostgREST emits numeric as JSON numbers; PGlite's default parser hands
    // back strings, which broke Notes card positioning ("240" + 67 → "24067").
    const { data: board } = await from('notes_boards')
      .select('*').eq('is_root', true).single();
    const { data: card } = await from('notes_cards')
      .insert({
        user_id: LOCAL_USER_ID, board_id: board.id, type: 'note',
        x: 150, y: 240.5, w: 240, h: 140, payload: {},
      })
      .select()
      .single();
    expect(typeof card.x).toBe('number');
    expect(typeof card.y).toBe('number');
    expect(typeof card.w).toBe('number');
    expect(card.x + 10).toBe(160);       // arithmetic, not concatenation
    expect(card.y).toBeCloseTo(240.5);
    // Read-back path (not just insert-returning) must parse the same way.
    const { data: again } = await from('notes_cards')
      .select('*').eq('id', card.id).single();
    expect(typeof again.x).toBe('number');
    expect(again.w + 67).toBe(307);
    await from('notes_cards').delete().eq('id', card.id);
  });

  it('bulk insert without .select() resolves with data: null', async () => {
    const rows = [1, 2, 3].map((n) => ({
      user_id: LOCAL_USER_ID, room: 'timeline', entry_date: `2026-03-0${n}`,
      title: null, body: `Day ${n}`, body_type: 'plain', tags: [],
      scripture_refs: [], entry_type: null,
    }));
    const { data, error } = await from('entries').insert(rows);
    expect(error).toBeNull();
    expect(data).toBeNull();
    const { data: back } = await from('entries').select('entry_date').eq('room', 'timeline');
    expect(back.length).toBe(3);
  });

  it('the timeline_with_sanctuary view joins across rooms', async () => {
    const { data, error } = await from('timeline_with_sanctuary')
      .select('*')
      .order('entry_date', { ascending: false });
    expect(error).toBeNull();
    expect(data.length).toBe(3);
    // View exposes the join columns the Timeline page reads.
    expect('sanctuary_id' in data[0]).toBe(true);
    expect('summary' in data[0]).toBe(true);
  });

  it('delete + eq removes exactly the matched rows', async () => {
    const { error } = await from('entries').delete().eq('entry_date', '2026-03-01');
    expect(error).toBeNull();
    const { data } = await from('entries').select('entry_date').eq('room', 'timeline');
    expect(data.length).toBe(2);
  });
});

describe('auth shim', () => {
  it('always reports the fixed local user, in supabase-js shapes', async () => {
    const auth = createAuthShim();
    const { data: u } = await auth.getUser();
    expect(u.user.id).toBe(LOCAL_USER_ID);
    const { data: s } = await auth.getSession();
    expect(s.session?.access_token).toBe('local');
    const events: string[] = [];
    const { data: sub } = auth.onAuthStateChange((event) => { events.push(event); });
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual(['SIGNED_IN']);
    expect(() => sub.subscription.unsubscribe()).not.toThrow();
    expect((await auth.signInWithOtp({})).error).toBeNull();
    expect((await auth.signOut()).error).toBeNull();
  });
});

describe('storage shim', () => {
  it('upload / signed-url / remove round-trip with byte fidelity', async () => {
    // jsdom lacks URL.createObjectURL — give the shim a stand-in.
    const urls: Blob[] = [];
    (URL as any).createObjectURL = (b: Blob) => { urls.push(b); return `blob:test-${urls.length}`; };
    (URL as any).revokeObjectURL = () => {};

    const storage = createStorageShim(ready);
    const bucket = storage.from('notes-media');
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 1, 2]);
    const up = await bucket.upload('u1/pic-orig.png', bytes, { contentType: 'image/png' });
    expect(up.error).toBeNull();

    const dup = await bucket.upload('u1/pic-orig.png', bytes);
    expect(dup.error).not.toBeNull(); // no silent overwrite without upsert

    const signed = await bucket.createSignedUrl('u1/pic-orig.png', 3600);
    expect(signed.error).toBeNull();
    expect(signed.data!.signedUrl).toMatch(/^blob:test-/);
    const stored = new Uint8Array(await urls[0].arrayBuffer());
    expect([...stored]).toEqual([...bytes]); // byte-for-byte
    expect(urls[0].type).toBe('image/png');

    const rm = await bucket.remove(['u1/pic-orig.png']);
    expect(rm.error).toBeNull();
    const gone = await bucket.createSignedUrl('u1/pic-orig.png', 3600);
    expect(gone.error).not.toBeNull();
  });
});
