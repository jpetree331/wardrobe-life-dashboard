import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  parseGoodreadsDate,
  normalizeReview,
  buildImportPreview,
  dedupAgainstExisting,
} from '../src/lib/goodreadsImport';

describe('parseCSV', () => {
  it('parses simple CSV', () => {
    const text = 'a,b,c\n1,2,3\n4,5,6\n';
    const out = parseCSV(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ a: '1', b: '2', c: '3' });
    expect(out[1]).toEqual({ a: '4', b: '5', c: '6' });
  });

  it('respects quoted fields with commas', () => {
    const text = 'name,note\n"Smith, John","hello"\n';
    const out = parseCSV(text);
    expect(out[0].name).toBe('Smith, John');
    expect(out[0].note).toBe('hello');
  });

  it('handles escaped quotes inside quoted fields', () => {
    const text = 'phrase\n"He said ""hi"" to me"\n';
    const out = parseCSV(text);
    expect(out[0].phrase).toBe('He said "hi" to me');
  });

  it('handles \\r\\n and bare \\r line endings', () => {
    const text = 'a,b\r\n1,2\r\n3,4';
    const out = parseCSV(text);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ a: '3', b: '4' });
  });

  it('handles newlines inside quoted fields', () => {
    const text = 'col\n"line one\nline two"\n';
    const out = parseCSV(text);
    expect(out[0].col).toBe('line one\nline two');
  });

  it('skips trailing blank lines', () => {
    const text = 'a,b\n1,2\n\n';
    const out = parseCSV(text);
    expect(out).toHaveLength(1);
  });
});

describe('parseGoodreadsDate', () => {
  it('parses YYYY/MM/DD', () => {
    expect(parseGoodreadsDate('2026/04/12')).toBe('2026-04-12');
  });

  it('zero-pads single-digit months and days', () => {
    expect(parseGoodreadsDate('2026/4/3')).toBe('2026-04-03');
  });

  it('returns null for empty or unparseable strings', () => {
    expect(parseGoodreadsDate('')).toBeNull();
    expect(parseGoodreadsDate('   ')).toBeNull();
    expect(parseGoodreadsDate('not a date')).toBeNull();
    expect(parseGoodreadsDate('04/12/2026')).toBeNull(); // wrong order
  });
});

describe('normalizeReview', () => {
  it('converts <br/> tags to newlines', () => {
    expect(normalizeReview('Line one<br/>Line two<br />Line three'))
      .toBe('Line one\nLine two\nLine three');
  });

  it('strips other HTML tags but keeps inner text', () => {
    expect(normalizeReview('A <i>great</i> book by <b>everyone</b>'))
      .toBe('A great book by everyone');
  });

  it('decodes Goodreads HTML entities', () => {
    expect(normalizeReview('Tom &amp; Jerry &quot;classic&quot;'))
      .toBe('Tom & Jerry "classic"');
  });

  it('collapses triple+ blank lines and trims', () => {
    expect(normalizeReview('\n\n\nstart<br/><br/><br/><br/>end\n\n\n'))
      .toBe('start\n\nend');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeReview('')).toBe('');
  });

  it('preserves <p>...</p> as paragraph breaks', () => {
    expect(normalizeReview('<p>One.</p><p>Two.</p>'))
      .toBe('One.\n\nTwo.');
  });
});

describe('buildImportPreview', () => {
  const rows = [
    {
      Title: 'Mere Christianity', Author: 'C.S. Lewis', 'Number of Pages': '191',
      'My Rating': '5', 'Date Read': '2024/06/12', 'Date Added': '2024/05/01',
      'Exclusive Shelf': 'read', 'My Review': 'great', 'Read Count': '1',
    },
    {
      Title: 'War and Peace', Author: 'Tolstoy', 'Number of Pages': '',
      'My Rating': '4', 'Date Read': '', 'Date Added': '2023/01/15',
      'Exclusive Shelf': 'read', 'My Review': '', 'Read Count': '1',
    },
    {
      Title: 'The Way of Kings', Author: 'Brandon Sanderson', 'Number of Pages': '1007',
      'My Rating': '5', 'Date Read': '2024/12/01', 'Date Added': '2014/01/01',
      'Exclusive Shelf': 'read', 'My Review': '', 'Read Count': '2',
    },
    {
      Title: 'Future Read', Author: 'Someone', 'Number of Pages': '300',
      'My Rating': '0', 'Date Read': '', 'Date Added': '2024/12/26',
      'Exclusive Shelf': 'to-read', 'My Review': '', 'Read Count': '1',
    },
    {
      Title: 'In Progress', Author: 'Author', 'Number of Pages': '200',
      'My Rating': '0', 'Date Read': '', 'Date Added': '2025/01/01',
      'Exclusive Shelf': 'currently-reading', 'My Review': '', 'Read Count': '1',
    },
  ];

  it('keeps only "read" shelf and counts skipped per shelf', () => {
    const preview = buildImportPreview(rows);
    expect(preview.candidates).toHaveLength(3);
    expect(preview.skippedNonRead).toBe(2);
    expect(preview.shelfBreakdown).toEqual({
      'to-read': 1,
      'currently-reading': 1,
    });
  });

  it('falls back to Date Added when Date Read is empty', () => {
    const preview = buildImportPreview(rows);
    const tolstoy = preview.candidates.find((c) => c.title === 'War and Peace')!;
    expect(tolstoy.finished_on).toBe('2023-01-15');
    expect(tolstoy.dateFallback).toBe(true);
    expect(preview.dateFallbackCount).toBe(1);
  });

  it('counts books with missing page counts', () => {
    const preview = buildImportPreview(rows);
    const tolstoy = preview.candidates.find((c) => c.title === 'War and Peace')!;
    expect(tolstoy.pages).toBe(0);
    expect(preview.missingPagesCount).toBe(1);
  });

  it('flags re-reads', () => {
    const preview = buildImportPreview(rows);
    const stormlight = preview.candidates.find((c) => c.title === 'The Way of Kings')!;
    expect(stormlight.readCount).toBe(2);
    expect(preview.reReadCount).toBe(1);
  });

  it('sets review to null when empty after normalization', () => {
    const preview = buildImportPreview(rows);
    const empty = preview.candidates.find((c) => c.title === 'War and Peace')!;
    expect(empty.review).toBeNull();
  });

  it('clamps rating to 0..5', () => {
    const out = buildImportPreview([
      { Title: 'X', Author: 'A', 'Number of Pages': '100',
        'My Rating': '99', 'Date Read': '2024/01/01', 'Date Added': '',
        'Exclusive Shelf': 'read', 'My Review': '', 'Read Count': '1' },
    ]);
    expect(out.candidates[0].rating).toBe(5);
  });
});

describe('dedupAgainstExisting', () => {
  const candidates = [
    { finished_on: '2024-01-01', title: 'A', author: '', pages: 0, rating: 0 as const, review: null, dateFallback: false, readCount: 1 },
    { finished_on: '2024-02-01', title: 'B', author: '', pages: 0, rating: 0 as const, review: null, dateFallback: false, readCount: 1 },
    { finished_on: '2024-03-01', title: 'C', author: '', pages: 0, rating: 0 as const, review: null, dateFallback: false, readCount: 1 },
  ];

  it('skips candidates that match an existing (title, finished_on)', () => {
    const existing = [{ title: 'B', finished_on: '2024-02-01' }];
    const { toInsert, duplicateCount } = dedupAgainstExisting(candidates, existing);
    expect(toInsert).toHaveLength(2);
    expect(toInsert.map((c) => c.title)).toEqual(['A', 'C']);
    expect(duplicateCount).toBe(1);
  });

  it('matches case-insensitively on title', () => {
    const existing = [{ title: 'a', finished_on: '2024-01-01' }];
    const { duplicateCount } = dedupAgainstExisting(candidates, existing);
    expect(duplicateCount).toBe(1);
  });

  it('treats same title on different dates as different entries', () => {
    const existing = [{ title: 'A', finished_on: '1999-01-01' }];
    const { toInsert, duplicateCount } = dedupAgainstExisting(candidates, existing);
    expect(toInsert).toHaveLength(3);
    expect(duplicateCount).toBe(0);
  });

  it('dedupes within the import itself', () => {
    const dup = [...candidates, candidates[0]];
    const { toInsert, duplicateCount } = dedupAgainstExisting(dup, []);
    expect(toInsert).toHaveLength(3);
    expect(duplicateCount).toBe(1);
  });
});
