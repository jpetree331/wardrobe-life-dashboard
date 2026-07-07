import { describe, it, expect } from 'vitest';
import {
  buildBackupJson,
  buildReadableHtml,
  escapeHtml,
  exportFilename,
  formatLongDate,
  selectEntriesForExport,
  visibleTags,
  type ExportMeta,
} from '../src/lib/sanctuaryExport';
import type { Entry } from '../src/lib/entries';

const META: ExportMeta = { exportedAt: '2026-07-07T12:00:00.000Z', dateStr: '2026-07-07' };

function entry(over: Partial<Entry>): Entry {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    user_id: 'u1',
    room: 'sanctuary',
    entry_date: '2026-04-19',
    title: 'A Title',
    body: '<p>Body text.</p>',
    body_type: 'rich',
    tags: [],
    scripture_refs: [],
    entry_type: 'journal',
    listening_prayer: false,
    stillness_sessions: [],
    created_at: '2026-04-19T08:00:00Z',
    updated_at: '2026-04-19T08:00:00Z',
    ...over,
  };
}

describe('selectEntriesForExport', () => {
  const a = entry({ id: 'a', entry_date: '2026-01-05' });
  const b = entry({ id: 'b', entry_date: '2026-04-19' });
  const c = entry({ id: 'c', entry_date: '2026-07-01' });
  const all = [c, a, b]; // deliberately unordered

  it('returns entries chronologically oldest → newest', () => {
    expect(selectEntriesForExport(all).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters by inclusive date range', () => {
    expect(selectEntriesForExport(all, { from: '2026-02-01', to: '2026-05-01' }).map((e) => e.id)).toEqual(['b']);
    expect(selectEntriesForExport(all, { from: '2026-04-19' }).map((e) => e.id)).toEqual(['b', 'c']);
    expect(selectEntriesForExport(all, { to: '2026-04-19' }).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('filters by an explicit id selection', () => {
    expect(selectEntriesForExport(all, { selectedIds: new Set(['a', 'c']) }).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('never mutates or reorders the input array', () => {
    const input = [c, a, b];
    const snapshot = input.slice();
    selectEntriesForExport(input, { from: '2026-01-01' });
    expect(input).toEqual(snapshot);
    expect(input[0]).toBe(c);
  });
});

describe('escapeHtml + formatLongDate + visibleTags', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });
  it('formats a date without timezone drift', () => {
    // 2026-04-19 is a Sunday.
    expect(formatLongDate('2026-04-19')).toBe('Sunday, 19 April 2026');
    expect(formatLongDate('bad')).toBe('bad');
  });
  it('hides system (underscore) tags but keeps the rest', () => {
    expect(visibleTags(entry({ tags: ['_veil', 'grace', 'psalms'] }))).toEqual(['grace', 'psalms']);
  });
});

describe('buildBackupJson — the lossless restore file', () => {
  it('captures every field, including the veil tag, verbatim', () => {
    const veiled = entry({ id: 'v', tags: ['_veil', 'intimate'], listening_prayer: true, stillness_sessions: [{ start: null, end: null, minutes: 20 }] });
    const json = buildBackupJson([veiled], META);
    const parsed = JSON.parse(json);
    expect(parsed.kind).toBe('sanctuary-backup');
    expect(parsed.entry_count).toBe(1);
    expect(parsed.exported_at).toBe(META.exportedAt);
    const round = parsed.entries[0];
    // Round-trips to the exact same object — nothing dropped.
    expect(round).toEqual(veiled);
    expect(round.tags).toContain('_veil');
    expect(round.stillness_sessions[0].minutes).toBe(20);
  });

  it('is pretty-printed and parseable', () => {
    const json = buildBackupJson([entry({})], META);
    expect(json).toContain('\n  ');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('buildReadableHtml — the faithful document', () => {
  it('is a self-contained document with inlined styles', () => {
    const html = buildReadableHtml([entry({})], META);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('--page: #f6efde');   // tokens inlined, no external CSS
    expect(html).toContain('exported 2026-07-07');
  });

  it('preserves rich body HTML (highlights, red-letter) as authored', () => {
    const rich = entry({ body: '<p>Grace <mark>abounds</mark> <span class="red-letter">Come</span></p>' });
    const html = buildReadableHtml([rich], META);
    expect(html).toContain('<mark>abounds</mark>');
    expect(html).toContain('<span class="red-letter">Come</span>');
  });

  it('preserves every styled body construct verbatim (rubric, verse nums, drop-cap, quote)', () => {
    const body =
      '<p class="dropcap">In the beginning</p>' +
      '<p><span class="rubric">Selah</span> <span class="verse-num">1</span>The word.</p>' +
      '<blockquote>Be still.</blockquote>';
    const html = buildReadableHtml([entry({ body })], META);
    expect(html).toContain('<p class="dropcap">In the beginning</p>');
    expect(html).toContain('<span class="rubric">Selah</span>');
    expect(html).toContain('<span class="verse-num">1</span>');
    expect(html).toContain('<blockquote>Be still.</blockquote>');
    // ...and the styling for those classes ships inside the file.
    expect(html).toContain('.dropcap::first-letter');
    expect(html).toContain('.rubric');
    expect(html).toContain('blockquote');
  });

  it('renders the stillness + listening-prayer meta line', () => {
    const e = entry({
      stillness_sessions: [{ start: null, end: null, minutes: 45 }],
      listening_prayer: true,
    });
    const html = buildReadableHtml([e], META);
    expect(html).toContain('45m stillness');
    expect(html).toContain('listening prayer');
  });

  it('escapes plain-text bodies so nothing is misread as markup', () => {
    const plain = entry({ body_type: 'plain', body: 'a < b & c\n\nsecond para' });
    const html = buildReadableHtml([plain], META);
    expect(html).toContain('a &lt; b &amp; c');
    expect(html).toContain('<p>second para</p>');
  });

  it('groups by year and month and shows the title + metadata', () => {
    const e = entry({ title: 'Emmaus', entry_date: '2026-04-19', entry_type: 'lectio', scripture_refs: ['Luke 24'], tags: ['_veil', 'road'] });
    const html = buildReadableHtml([e], META);
    expect(html).toContain('>2026<');
    expect(html).toContain('>April<');
    expect(html).toContain('Emmaus');
    expect(html).toContain('Lectio Divina');
    expect(html).toContain('Luke 24');
    expect(html).toContain('#road');
    expect(html).not.toContain('#_veil'); // system tag hidden in the readable view
  });

  it('falls back gracefully for an untitled / empty entry', () => {
    const html = buildReadableHtml([entry({ title: '', body: '' })], META);
    expect(html).toContain('Untitled');
    expect(html).toContain('(no writing)');
  });
});

describe('exportFilename', () => {
  it('is timestamped so exports never overwrite each other', () => {
    expect(exportFilename('json', '2026-07-07')).toBe('sanctuary-backup-2026-07-07.json');
    expect(exportFilename('html', '2026-07-07')).toBe('sanctuary-backup-2026-07-07.html');
  });
});
