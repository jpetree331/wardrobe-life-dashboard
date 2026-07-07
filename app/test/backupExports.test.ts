import { describe, it, expect } from 'vitest';
import {
  backupFilename,
  buildJsonBackup,
  escapeHtml,
  formatLongDate,
} from '../src/lib/backupEnvelope';
import {
  buildTimelineBackupJson,
  buildTimelineReadableHtml,
  selectTimelineForExport,
} from '../src/lib/timelineExport';
import {
  buildDataBackupJson,
  buildDataReadableHtml,
  ownedScriptureReads,
  scriptureRef,
  type DataBackupTables,
} from '../src/lib/dataExport';
import type { TimelineRow } from '../src/lib/entries';
import type { BookRead, ReadingPlan, ScriptureRead } from '../src/lib/data';

const META = { exportedAt: '2026-07-07T12:00:00.000Z', dateStr: '2026-07-07' };

// ── Envelope ────────────────────────────────────────────────────────────────

describe('backupEnvelope', () => {
  it('wraps a payload losslessly with a self-describing header', () => {
    const json = buildJsonBackup('x-backup', 'a note', { entries: [{ a: 1 }], entry_count: 1 }, META);
    const p = JSON.parse(json);
    expect(p.app).toBe('Wardrobe');
    expect(p.kind).toBe('x-backup');
    expect(p.exported_at).toBe(META.exportedAt);
    expect(p.note).toBe('a note');
    expect(p.entries).toEqual([{ a: 1 }]);
    expect(json).toContain('\n  '); // pretty-printed
  });
  it('escapes html and formats dates without drift', () => {
    expect(escapeHtml('<a>&"\'')).toBe('&lt;a&gt;&amp;&quot;&#39;');
    expect(formatLongDate('2026-04-19')).toBe('Sunday, 19 April 2026');
  });
  it('produces timestamped filenames', () => {
    expect(backupFilename('timeline', 'json', '2026-07-07')).toBe('timeline-backup-2026-07-07.json');
    expect(backupFilename('data', 'html', '2026-07-07')).toBe('data-backup-2026-07-07.html');
  });
});

// ── Timeline ──────────────────────────────────────────────────────────────

function trow(over: Partial<TimelineRow>): TimelineRow {
  return {
    id: 'r' + Math.random(), user_id: 'u', entry_date: '2026-04-19', title: 'Event',
    summary: 'Something happened.', tags: [], created_at: '2026-04-19T08:00:00Z',
    updated_at: '2026-04-19T08:00:00Z', sanctuary_id: null, sanctuary_title: null,
    sanctuary_scripture_refs: null, ...over,
  };
}

describe('timelineExport', () => {
  const a = trow({ id: 'a', entry_date: '2026-01-05' });
  const b = trow({ id: 'b', entry_date: '2026-04-19' });
  const c = trow({ id: 'c', entry_date: '2026-07-01' });

  it('selects chronologically, filters by range + ids, never mutates input', () => {
    const input = [c, a, b];
    const snap = input.slice();
    expect(selectTimelineForExport(input).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(selectTimelineForExport(input, { from: '2026-02-01', to: '2026-05-01' }).map((r) => r.id)).toEqual(['b']);
    expect(selectTimelineForExport(input, { selectedIds: new Set(['a', 'c']) }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(input).toEqual(snap); // unmutated
  });

  it('JSON backup is lossless (full rows + count)', () => {
    const linked = trow({ id: 'x', sanctuary_id: 's1', sanctuary_title: 'Emmaus', tags: ['grace'] });
    const p = JSON.parse(buildTimelineBackupJson([linked], META));
    expect(p.kind).toBe('timeline-backup');
    expect(p.entry_count).toBe(1);
    expect(p.entries[0]).toEqual(linked);
  });

  it('readable HTML is self-contained, escapes summaries, groups by year, shows links', () => {
    const html = buildTimelineReadableHtml(
      [trow({ entry_date: '2026-04-19', title: 'A & B', summary: 'x < y', sanctuary_id: 's', sanctuary_title: 'Road' })],
      META,
    );
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('--page: #f6efde');
    expect(html).toContain('>2026<');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('x &lt; y');
    expect(html).toContain('linked to Sanctuary: Road');
  });
});

// ── Data ────────────────────────────────────────────────────────────────────

function sread(over: Partial<ScriptureRead>): ScriptureRead {
  return {
    id: 's' + Math.random(), user_id: 'u', read_date: '2026-04-19', book: 'Luke', chapter: 24,
    verse_from: null, verse_to: null, note: null, source: 'manual',
    created_at: '', updated_at: '', ...over,
  };
}
function bread(over: Partial<BookRead>): BookRead {
  return {
    id: 'b' + Math.random(), user_id: 'u', finished_on: '2026-03-01', title: 'Book', author: 'Auth',
    pages: 200, rating: 4, review: null, created_at: '', updated_at: '', ...over,
  };
}

describe('dataExport', () => {
  it('ownedScriptureReads keeps only manual rows (sanctuary reads are excluded)', () => {
    const reads = [sread({ id: 'm', source: 'manual' }), sread({ id: 's', source: 'sanctuary' })];
    expect(ownedScriptureReads(reads).map((r) => r.id)).toEqual(['m']);
  });

  it('scriptureRef formats book/chapter/verse ranges', () => {
    expect(scriptureRef(sread({ book: 'John', chapter: 1 }))).toBe('John 1');
    expect(scriptureRef(sread({ book: 'Luke', chapter: 24, verse_from: 13, verse_to: 35 }))).toBe('Luke 24:13-35');
    expect(scriptureRef(sread({ book: 'Ps', chapter: 23, verse_from: 1, verse_to: 1 }))).toBe('Ps 23:1');
  });

  it('JSON backup excludes synthesized reads but keeps all other tables verbatim', () => {
    const tables: DataBackupTables = {
      scriptureReads: [sread({ id: 'm', source: 'manual' }), sread({ id: 's', source: 'sanctuary' })],
      bookReads: [bread({ id: 'bk' })],
      dailyPages: [],
      plans: [],
      planCompletions: [],
    };
    const p = JSON.parse(buildDataBackupJson(tables, META));
    expect(p.kind).toBe('data-backup');
    expect(p.counts.scripture_reads).toBe(1); // manual only
    expect(p.scripture_reads.map((r: ScriptureRead) => r.id)).toEqual(['m']);
    expect(p.book_reads[0].id).toBe('bk');
  });

  it('readable report renders counts, a books table with stars, and escapes text', () => {
    const tables: DataBackupTables = {
      scriptureReads: [sread({ read_date: '2026-04-19', book: 'Mark', chapter: 5 })],
      bookReads: [bread({ title: 'A < B', author: 'X & Y', rating: 5, finished_on: '2026-03-01' })],
      dailyPages: [],
      plans: [{ id: 'p', user_id: 'u', name: 'NT 90', books: ['Matthew'], start_date: '2026-01-01', end_date: '2026-03-31', days_of_week: [], unit: 'chapters', per_session: 3, created_at: '', updated_at: '' } as ReadingPlan],
      planCompletions: [],
    };
    const html = buildDataReadableHtml(tables, META);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Books finished');
    expect(html).toContain('A &lt; B');
    expect(html).toContain('X &amp; Y');
    expect(html).toContain('★★★★★');
    expect(html).toContain('Mark 5');
    expect(html).toContain('NT 90');
  });

  it('readable report handles an empty Data room gracefully', () => {
    const empty: DataBackupTables = { scriptureReads: [], bookReads: [], dailyPages: [], plans: [], planCompletions: [] };
    const html = buildDataReadableHtml(empty, META);
    expect(html).toContain('No reading recorded yet.');
  });
});
