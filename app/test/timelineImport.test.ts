import { describe, it, expect } from 'vitest';
import {
  coerceDate,
  normalizeDate,
  normalizeRow,
  parsePlainText,
  pickField,
} from '../src/lib/timelineImport';

describe('pad2 + normalizeDate', () => {
  it('pads single-digit months and days from YYYY-M-D', () => {
    expect(normalizeDate('2024-1-2')).toBe('2024-01-02');
    expect(normalizeDate('2024-01-02')).toBe('2024-01-02');
  });

  it('parses MM/DD/YYYY (US format)', () => {
    expect(normalizeDate('1/2/2024')).toBe('2024-01-02');
    expect(normalizeDate('12/31/2024')).toBe('2024-12-31');
  });

  it('returns empty for empty / nullish input', () => {
    expect(normalizeDate('')).toBe('');
    expect(normalizeDate('   ')).toBe('');
  });

  it('returns empty for unparseable text', () => {
    expect(normalizeDate('not a date at all')).toBe('');
  });

  it('handles trailing characters after a YYYY-MM-DD', () => {
    expect(normalizeDate('2024-04-19 some extra junk')).toBe('2024-04-19');
  });

  it('strips a leading time component when handed an ISO string', () => {
    // Date() parses this; we slice to YYYY-MM-DD.
    const out = normalizeDate('2024-04-19T10:00:00Z');
    expect(out).toBe('2024-04-19');
  });
});

describe('coerceDate', () => {
  it('builds a date from Year + Month + Day columns', () => {
    expect(coerceDate({ Year: 2024, Month: 4, Day: 19 })).toBe('2024-04-19');
    expect(coerceDate({ year: 2024, month: 4, day: 19 })).toBe('2024-04-19');
  });

  it('falls back to sheet name when Year column is missing', () => {
    expect(coerceDate({ Month: 4, Day: 19 }, '2024')).toBe('2024-04-19');
  });

  it('rejects non-4-digit sheet names', () => {
    expect(coerceDate({ Month: 4, Day: 19 }, 'Sheet1')).toBe('');
  });

  it('returns empty when any component is missing', () => {
    expect(coerceDate({ Year: 2024, Month: 4 })).toBe('');
    expect(coerceDate({ Year: 2024, Day: 19 })).toBe('');
  });
});

describe('pickField', () => {
  it('returns the first non-empty field', () => {
    expect(pickField({ a: '', b: 'two', c: 'three' }, ['a', 'b', 'c'])).toBe('two');
  });

  it('treats whitespace-only values as empty', () => {
    expect(pickField({ a: '   ', b: 'real' }, ['a', 'b'])).toBe('real');
  });

  it('handles numeric values via String coercion', () => {
    expect(pickField({ a: 42 }, ['a'])).toBe('42');
  });

  it('returns empty when no key matches', () => {
    expect(pickField({ a: 'x' }, ['b', 'c'])).toBe('');
  });

  it('skips null and undefined values', () => {
    expect(pickField({ a: null, b: undefined, c: 'real' }, ['a', 'b', 'c'])).toBe('real');
  });
});

describe('normalizeRow', () => {
  it('parses the canonical column shape', () => {
    expect(
      normalizeRow({
        Date: '2024-04-19',
        'One-sentence highlight': 'Walked to Emmaus before dawn.',
        Tags: 'Easter, walking',
      }),
    ).toEqual({
      entry_date: '2024-04-19',
      summary: 'Walked to Emmaus before dawn.',
      tags: ['Easter', 'walking'],
    });
  });

  it('handles semicolons as tag separators', () => {
    const row = normalizeRow({
      Date: '2024-04-19',
      Summary: 'X',
      Tags: 'one;two ; three',
    });
    expect(row.tags).toEqual(['one', 'two', 'three']);
  });

  it('handles a Year column + sheet-named year', () => {
    const row = normalizeRow(
      { Year: 2024, Month: 4, Day: 19, Note: 'note text' },
      '2024',
    );
    expect(row.entry_date).toBe('2024-04-19');
    expect(row.summary).toBe('note text');
  });

  it('preserves spaces inside summary but trims edges', () => {
    expect(normalizeRow({ Date: '2024-04-19', Summary: '   spaced out   ' }).summary)
      .toBe('spaced out');
  });

  it('drops invalid dates to empty string', () => {
    expect(normalizeRow({ Date: 'garbage', Summary: 'X' }).entry_date).toBe('');
  });

  it('returns empty tags array when no tags column', () => {
    expect(normalizeRow({ Date: '2024-04-19', Summary: 'X' }).tags).toEqual([]);
  });

  it('alternative summary column names work', () => {
    expect(normalizeRow({ Date: '2024-01-01', highlight: 'h' }).summary).toBe('h');
    expect(normalizeRow({ Date: '2024-01-01', Note: 'n' }).summary).toBe('n');
    expect(normalizeRow({ Date: '2024-01-01', entry: 'e' }).summary).toBe('e');
  });
});

describe('parsePlainText', () => {
  it('parses one-per-line "DATE — sentence" entries', () => {
    const text = `
2024-04-19 — Walked to Emmaus.
2024-04-12 - Easter morning.
2024-04-03: Good Friday.
2024-04-01 | Lent ends.
`;
    const out = parsePlainText(text);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ entry_date: '2024-04-19', summary: 'Walked to Emmaus.', tags: [] });
    expect(out[1].summary).toBe('Easter morning.');
    expect(out[2].summary).toBe('Good Friday.');
    expect(out[3].summary).toBe('Lent ends.');
  });

  it('skips lines without a leading YYYY-MM-DD', () => {
    const text = 'header line\nnot a date — text\n2024-04-19 — real entry';
    const out = parsePlainText(text);
    expect(out).toHaveLength(1);
    expect(out[0].entry_date).toBe('2024-04-19');
  });

  it('handles CRLF line endings', () => {
    const text = '2024-04-19 — one\r\n2024-04-20 — two';
    const out = parsePlainText(text);
    expect(out).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(parsePlainText('')).toEqual([]);
  });
});
