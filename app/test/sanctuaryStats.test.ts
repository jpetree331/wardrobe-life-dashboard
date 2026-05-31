import { describe, it, expect } from 'vitest';
import {
  countWords,
  monthlyWordTotals,
  perEntryStats,
  STOPWORDS,
  stripHtmlToText,
  tokenize,
  topWords,
  wordsByDate,
  wordsInEntry,
  writingSummary,
  type EntryLike,
} from '../src/lib/sanctuaryStats';

// Tiny entry-factory so tests stay readable.
function E(
  id: string,
  date: string,
  title: string | null,
  body: string,
): EntryLike {
  return { id, entry_date: date, title, body };
}

describe('stripHtmlToText', () => {
  it('strips ordinary tags', () => {
    expect(stripHtmlToText('<p>Hello <em>world</em>.</p>')).toBe('Hello world.');
  });

  it('treats <br> and block-end as a space (so words do not merge)', () => {
    expect(stripHtmlToText('<p>one</p><p>two</p>')).toBe('one two');
    expect(stripHtmlToText('alpha<br>beta')).toBe('alpha beta');
  });

  it('decodes the common entities the editor emits', () => {
    expect(stripHtmlToText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(stripHtmlToText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(stripHtmlToText('&nbsp;spaced&nbsp;')).toBe('spaced');
  });

  it('decodes numeric character references', () => {
    expect(stripHtmlToText('&#8220;quoted&#8221;')).toBe('“quoted”');
    expect(stripHtmlToText('&#x2018;tick&#x2019;')).toBe('‘tick’');
  });

  it('empty input → empty string', () => {
    expect(stripHtmlToText('')).toBe('');
  });
});

describe('countWords', () => {
  it('counts a basic sentence', () => {
    expect(countWords('the quick brown fox')).toBe(4);
  });

  it("keeps contractions and hyphens as one word each", () => {
    expect(countWords("isn't well-being")).toBe(2);
  });

  it('treats punctuation as separators', () => {
    expect(countWords('one, two; three. four!')).toBe(4);
  });

  it('handles unicode letters (accented chars)', () => {
    expect(countWords('café déjà vu')).toBe(3);
  });

  it('empty / whitespace-only → 0', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n  ')).toBe(0);
  });

  it('wordsInEntry strips HTML before counting', () => {
    const e = E('1', '2026-01-01', null, '<p>one <strong>two</strong></p>');
    expect(wordsInEntry(e)).toBe(2);
  });
});

describe('tokenize', () => {
  it('lowercases and normalizes curly apostrophe to straight', () => {
    expect(tokenize("It’s a Test")).toEqual(["it's", 'a', 'test']);
  });

  it('skips punctuation and whitespace', () => {
    expect(tokenize('hello, world!')).toEqual(['hello', 'world']);
  });

  it('preserves order', () => {
    expect(tokenize('alpha beta gamma alpha')).toEqual(['alpha', 'beta', 'gamma', 'alpha']);
  });
});

describe('STOPWORDS', () => {
  it('contains the usual top English stopwords', () => {
    for (const w of ['the', 'and', 'of', 'to', 'a', 'in', 'i', 'that', 'is', 'for']) {
      expect(STOPWORDS.has(w), `expected stopword: ${w}`).toBe(true);
    }
  });

  it('keeps reflective devotional words available (not over-filtered)', () => {
    for (const w of ['lord', 'god', 'jesus', 'prayer', 'thee', 'thou', 'soul']) {
      expect(STOPWORDS.has(w), `should NOT be stopword: ${w}`).toBe(false);
    }
  });
});

describe('topWords', () => {
  const entries: EntryLike[] = [
    E('a', '2026-01-01', 'Morning', '<p>I am grateful for the morning prayer.</p>'),
    E('b', '2026-01-02', 'Walk', '<p>A walk in the morning, prayer in the evening.</p>'),
    E('c', '2026-01-03', 'Quiet', '<p>Quiet morning. Quiet evening. Prayer at noon.</p>'),
  ];

  it('returns top words excluding stopwords by default', () => {
    const top = topWords(entries, { topN: 4 });
    const words = top.map((t) => t.word);
    expect(words).toContain('morning');
    expect(words).toContain('prayer');
    expect(words).toContain('evening');
    expect(words).not.toContain('the');
    expect(words).not.toContain('i');
  });

  it('counts each token correctly', () => {
    const top = topWords(entries, { topN: 20 });
    const byWord = Object.fromEntries(top.map((t) => [t.word, t.count]));
    expect(byWord['morning']).toBe(3);
    expect(byWord['prayer']).toBe(3);
    expect(byWord['evening']).toBe(2);
    expect(byWord['quiet']).toBe(2);
  });

  it('with excludeStopwords=false includes "the", "in", etc.', () => {
    const top = topWords(entries, { topN: 30, excludeStopwords: false });
    const words = top.map((t) => t.word);
    expect(words).toContain('the');
  });

  it('breaks ties alphabetically (deterministic)', () => {
    const tied: EntryLike[] = [E('1', '2026-01-01', null, 'banana apple cherry')];
    const top = topWords(tied, { topN: 3, minLength: 3 });
    // All three appear once; alphabetical tiebreaker → apple, banana, cherry
    expect(top.map((t) => t.word)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('respects minLength', () => {
    const e = [E('1', '2026-01-01', null, 'a b cd ef ghi')];
    const top = topWords(e, { topN: 10, minLength: 3, excludeStopwords: false });
    expect(top.map((t) => t.word)).toEqual(['ghi']);
  });
});

describe('wordsByDate', () => {
  it('sums multiple entries on the same day', () => {
    const m = wordsByDate([
      E('a', '2026-01-01', null, 'one two'),
      E('b', '2026-01-01', null, 'three four five'),
      E('c', '2026-01-02', null, 'six'),
    ]);
    expect(m.get('2026-01-01')).toEqual({ date: '2026-01-01', words: 5, entries: 2 });
    expect(m.get('2026-01-02')).toEqual({ date: '2026-01-02', words: 1, entries: 1 });
  });
});

describe('monthlyWordTotals', () => {
  it('rolls up per-month within the given year', () => {
    const entries: EntryLike[] = [
      E('a', '2026-01-15', null, 'one two three'),     // Jan +3
      E('b', '2026-01-20', null, 'four five'),         // Jan +2
      E('c', '2026-02-01', null, 'six'),               // Feb +1
      E('d', '2025-12-31', null, 'ignored prior year'),
    ];
    const m = monthlyWordTotals(entries, 2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe(5);     // Jan
    expect(m[1]).toBe(1);     // Feb
    expect(m[2]).toBe(0);     // Mar
    expect(m.slice(2).every((n) => n === 0)).toBe(true);
  });
});

describe('perEntryStats', () => {
  it('returns one row per entry with title fallback', () => {
    const rows = perEntryStats([
      E('a', '2026-01-01', 'Morning', 'one two three'),
      E('b', '2026-01-02', '', 'four'),
      E('c', '2026-01-03', null, '<p>five six</p>'),
    ]);
    expect(rows).toEqual([
      { id: 'a', entry_date: '2026-01-01', title: 'Morning', words: 3 },
      { id: 'b', entry_date: '2026-01-02', title: '(untitled)', words: 1 },
      { id: 'c', entry_date: '2026-01-03', title: '(untitled)', words: 2 },
    ]);
  });
});

describe('writingSummary', () => {
  const entries: EntryLike[] = [
    E('a', '2026-01-01', 'A', 'one two three'),          // 3 words
    E('b', '2026-01-15', 'B', 'four five six seven'),    // 4 words
    E('c', '2025-12-30', 'C', 'eight'),                  // 1 word (prior year)
    E('d', '2026-02-01', 'D', '<p>nine ten eleven twelve thirteen</p>'), // 5 words
  ];

  it('computes total / avg / longest correctly', () => {
    const s = writingSummary(entries, 2026);
    expect(s.entryCount).toBe(4);
    expect(s.totalWords).toBe(13);
    expect(s.avgWords).toBe(3);  // round(13/4) = 3
    expect(s.longestEntry?.id).toBe('d');
    expect(s.longestEntry?.words).toBe(5);
  });

  it('counts distinct days written', () => {
    const s = writingSummary(entries, 2026);
    expect(s.daysWritten).toBe(4);  // all on different dates
  });

  it('separates this-year totals from all-time', () => {
    const s = writingSummary(entries, 2026);
    expect(s.thisYearEntries).toBe(3);     // a, b, d
    expect(s.thisYearWords).toBe(12);      // 3+4+5
  });

  it('zero entries → all zeros and null longest', () => {
    const s = writingSummary([], 2026);
    expect(s.entryCount).toBe(0);
    expect(s.totalWords).toBe(0);
    expect(s.avgWords).toBe(0);
    expect(s.longestEntry).toBeNull();
    expect(s.daysWritten).toBe(0);
  });
});
