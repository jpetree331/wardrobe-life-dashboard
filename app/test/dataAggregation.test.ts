import { describe, it, expect } from 'vitest';
import {
  aggregateBooksByAuthor,
  aggregateScriptureByBookChapter,
  bucketChapterReads,
  bucketLevel,
  buildCalendarGrid,
  buildHeatGrid,
  computeYearStats,
  dateForSessionCount,
  daysWithReadingByYear,
  formatLocalDate,
  mergeByDate,
  monthlyTotalsForYear,
  otNtVerseSplit,
  planChapterSequence,
  planPaceStatus,
  planTotalChapters,
  planTotalSessions,
  scriptureLabelsByDate,
  sessionsThroughDate,
  sumByDate,
  topAuthorsByCount,
  topBooksByVerses,
  yearsInBooksRetro,
} from '../src/lib/dataAggregation';

describe('bucketLevel: chapters scale', () => {
  it('splits into 5 levels at the design thresholds', () => {
    expect(bucketLevel(0, 'chapters')).toBe(0);
    expect(bucketLevel(0.5, 'chapters')).toBe(1);   // <1
    expect(bucketLevel(1.5, 'chapters')).toBe(2);   // <2
    expect(bucketLevel(3.9, 'chapters')).toBe(3);   // <4
    expect(bucketLevel(7.5, 'chapters')).toBe(4);   // <8
    expect(bucketLevel(8, 'chapters')).toBe(5);     // ≥8
    expect(bucketLevel(50, 'chapters')).toBe(5);
  });

  it('treats negative or NaN as level 0', () => {
    expect(bucketLevel(-1, 'chapters')).toBe(0);
    expect(bucketLevel(NaN, 'chapters')).toBe(0);
  });
});

describe('bucketLevel: verses-or-pages scale', () => {
  it('splits into 5 levels at 5/15/30/60', () => {
    expect(bucketLevel(0, 'verses-or-pages')).toBe(0);
    expect(bucketLevel(1, 'verses-or-pages')).toBe(1);
    expect(bucketLevel(4, 'verses-or-pages')).toBe(1);
    expect(bucketLevel(5, 'verses-or-pages')).toBe(2);
    expect(bucketLevel(14, 'verses-or-pages')).toBe(2);
    expect(bucketLevel(15, 'verses-or-pages')).toBe(3);
    expect(bucketLevel(29, 'verses-or-pages')).toBe(3);
    expect(bucketLevel(30, 'verses-or-pages')).toBe(4);
    expect(bucketLevel(59, 'verses-or-pages')).toBe(4);
    expect(bucketLevel(60, 'verses-or-pages')).toBe(5);
    expect(bucketLevel(500, 'verses-or-pages')).toBe(5);
  });
});

describe('sumByDate', () => {
  it('aggregates by date', () => {
    const items = [
      { d: '2026-04-19', n: 5 },
      { d: '2026-04-19', n: 10 },
      { d: '2026-04-20', n: 3 },
    ];
    const out = sumByDate(items, (it) => it.d, (it) => it.n);
    expect(out.get('2026-04-19')).toBe(15);
    expect(out.get('2026-04-20')).toBe(3);
    expect(out.size).toBe(2);
  });

  it('skips items without a date or with non-positive amounts', () => {
    const items = [
      { d: '2026-04-19', n: 5 },
      { d: '', n: 5 },
      { d: '2026-04-19', n: 0 },
      { d: '2026-04-19', n: -3 },
      { d: '2026-04-19', n: NaN },
    ];
    const out = sumByDate(items, (it) => it.d, (it) => it.n);
    expect(out.get('2026-04-19')).toBe(5);
  });
});

describe('scriptureLabelsByDate', () => {
  it('groups unique "Book Chapter" labels per day in first-seen order', () => {
    const reads = [
      { read_date: '2026-04-19', book: 'Luke', chapter: 24 },
      { read_date: '2026-04-19', book: 'John', chapter: 1 },
      { read_date: '2026-04-19', book: 'Luke', chapter: 24 }, // dupe → ignored
      { read_date: '2026-04-20', book: 'Psalms', chapter: 23 },
    ];
    const out = scriptureLabelsByDate(reads);
    expect(out.get('2026-04-19')).toEqual(['Luke 24', 'John 1']);
    expect(out.get('2026-04-20')).toEqual(['Psalms 23']);
    expect(out.size).toBe(2);
  });

  it('skips rows with no date or book', () => {
    const reads = [
      { read_date: '', book: 'Luke', chapter: 24 },
      { read_date: '2026-04-19', book: '', chapter: 1 },
      { read_date: '2026-04-19', book: 'Mark', chapter: 5 },
    ];
    const out = scriptureLabelsByDate(reads);
    expect(out.get('2026-04-19')).toEqual(['Mark 5']);
    expect(out.size).toBe(1);
  });

  it('lists the same chapter once even across many verse-range reads', () => {
    const reads = [
      { read_date: '2026-04-19', book: 'Romans', chapter: 8, verse_from: 1, verse_to: 4 },
      { read_date: '2026-04-19', book: 'Romans', chapter: 8, verse_from: 28, verse_to: 30 },
    ];
    expect(scriptureLabelsByDate(reads).get('2026-04-19')).toEqual(['Romans 8']);
  });
});

describe('mergeByDate', () => {
  it('adds values from each map at matching keys', () => {
    const a = new Map([['2026-01-01', 5], ['2026-01-02', 3]]);
    const b = new Map([['2026-01-02', 7], ['2026-01-03', 4]]);
    const out = mergeByDate(a, b);
    expect(out.get('2026-01-01')).toBe(5);
    expect(out.get('2026-01-02')).toBe(10);
    expect(out.get('2026-01-03')).toBe(4);
    expect(out.size).toBe(3);
  });

  it('skips zero/negative/NaN values from any input', () => {
    const a = new Map([['2026-01-01', 5]]);
    const b = new Map([['2026-01-01', 0], ['2026-01-02', -1], ['2026-01-03', NaN]]);
    const out = mergeByDate(a, b);
    expect(out.get('2026-01-01')).toBe(5);
    expect(out.has('2026-01-02')).toBe(false);
    expect(out.has('2026-01-03')).toBe(false);
  });

  it('returns an empty map when given no inputs', () => {
    expect(mergeByDate().size).toBe(0);
  });
});

describe('formatLocalDate', () => {
  it('formats a Date as YYYY-MM-DD using local components', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('buildHeatGrid', () => {
  it('renders the full Sunday-Saturday rectangle (year + leading + trailing pad)', () => {
    const today = new Date(2026, 5, 15);
    const grid = buildHeatGrid(2026, new Map(), 'chapters', today);
    // Jan 1 2026 is Thursday (4 leading pad days for Sun-Wed).
    // Dec 31 2026 is Thursday (2 trailing pad days for Fri-Sat).
    // Total: 4 + 365 + 2 = 371 cells.
    expect(grid.cells).toHaveLength(371);
    // First cell is the Sunday before Jan 1 (Dec 28, 2025).
    expect(grid.cells[0].date).toBe('2025-12-28');
    // Last cell is the Saturday after Dec 31 (Jan 2, 2027).
    expect(grid.cells[grid.cells.length - 1].date).toBe('2027-01-02');
  });

  it('marks out-of-year cells with inYear=false', () => {
    const grid = buildHeatGrid(2026, new Map(), 'chapters', new Date(2026, 11, 31));
    const dec28_2025 = grid.cells.find((c) => c.date === '2025-12-28')!;
    const jan1_2026 = grid.cells.find((c) => c.date === '2026-01-01')!;
    const jan2_2027 = grid.cells.find((c) => c.date === '2027-01-02')!;
    expect(dec28_2025.inYear).toBe(false);
    expect(jan1_2026.inYear).toBe(true);
    expect(jan2_2027.inYear).toBe(false);
  });

  it('marks future days as isFuture', () => {
    const today = new Date(2026, 5, 15);
    const grid = buildHeatGrid(2026, new Map(), 'chapters', today);
    const past = grid.cells.find((c) => c.date === '2026-01-01')!;
    const future = grid.cells.find((c) => c.date === '2026-12-31')!;
    expect(past.isFuture).toBe(false);
    expect(future.isFuture).toBe(true);
  });

  it('skips future and out-of-year days in totals', () => {
    const today = new Date(2026, 0, 5);
    const map = new Map<string, number>([
      ['2025-12-30', 99],   // out-of-year — must not count toward 2026 totals
      ['2026-01-03', 3],
      ['2026-01-04', 5],
      ['2026-12-15', 10],   // future — must not count
    ]);
    const grid = buildHeatGrid(2026, map, 'chapters', today);
    expect(grid.totalDays).toBe(2);
    expect(grid.totalCount).toBe(8);
  });

  it('assigns the correct level per cell from the count map', () => {
    const today = new Date(2026, 11, 31);
    const map = new Map<string, number>([
      ['2026-04-19', 0.5],
      ['2026-04-20', 8],
    ]);
    const grid = buildHeatGrid(2026, map, 'chapters', today);
    const a = grid.cells.find((c) => c.date === '2026-04-19')!;
    const b = grid.cells.find((c) => c.date === '2026-04-20')!;
    expect(a.level).toBe(1);
    expect(b.level).toBe(5);
  });

  // ── Regression: every cell must have a unique (weekIndex, dow) slot ──
  // The DST "missing teeth" bug was that two days ended up at the same
  // grid position — one visually overwrote the other. This pins it shut
  // for both DST transitions in the year.

  it('every cell occupies a unique (weekIndex, dow) slot', () => {
    const grid = buildHeatGrid(2026, new Map(), 'chapters', new Date(2026, 11, 31));
    const seen = new Set<string>();
    for (const c of grid.cells) {
      const key = `${c.weekIndex}:${c.dow}`;
      expect(seen.has(key), `duplicate slot at ${key} (date ${c.date})`).toBe(false);
      seen.add(key);
    }
  });

  it('Apr 26 2026 is in its own column (regression for spring-forward DST)', () => {
    const grid = buildHeatGrid(2026, new Map(), 'chapters', new Date(2026, 11, 31));
    const apr19 = grid.cells.find((c) => c.date === '2026-04-19')!;
    const apr26 = grid.cells.find((c) => c.date === '2026-04-26')!;
    // Both Sundays — must NOT collide.
    expect(apr19.dow).toBe(0);
    expect(apr26.dow).toBe(0);
    expect(apr19.weekIndex).not.toBe(apr26.weekIndex);
    expect(apr26.weekIndex).toBe(apr19.weekIndex + 1);
  });

  it('Nov 8 2026 is in its own column (regression for fall-back DST)', () => {
    // Nov 8 2026 falls one week after Nov 1 (the fall-back day).
    const grid = buildHeatGrid(2026, new Map(), 'chapters', new Date(2026, 11, 31));
    const nov1 = grid.cells.find((c) => c.date === '2026-11-01')!;
    const nov8 = grid.cells.find((c) => c.date === '2026-11-08')!;
    expect(nov1.weekIndex).not.toBe(nov8.weekIndex);
    expect(nov8.weekIndex).toBe(nov1.weekIndex + 1);
  });

  it('handles year-boundary alignment correctly across multiple years', () => {
    // Each year's grid should start with `firstGridSunday`, and the very
    // first cell should be at (weekIndex=0, dow=0).
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      const grid = buildHeatGrid(year, new Map(), 'chapters', new Date(year, 11, 31));
      const first = grid.cells[0];
      expect(first.dow).toBe(0);
      expect(first.weekIndex).toBe(0);
    }
  });
});

describe('bucketChapterReads', () => {
  it('returns 0 for never-touched chapters', () => {
    expect(bucketChapterReads(0)).toBe(0);
    expect(bucketChapterReads(-1)).toBe(0);
    expect(bucketChapterReads(NaN)).toBe(0);
  });

  it('escalates as the chapter is read more times', () => {
    expect(bucketChapterReads(0.1)).toBe(1);   // partial verse range only
    expect(bucketChapterReads(0.49)).toBe(1);
    expect(bucketChapterReads(0.5)).toBe(2);   // half-read once
    expect(bucketChapterReads(0.99)).toBe(2);
    expect(bucketChapterReads(1)).toBe(3);     // one full read
    expect(bucketChapterReads(1.99)).toBe(3);
    expect(bucketChapterReads(2)).toBe(4);     // two reads
    expect(bucketChapterReads(3.99)).toBe(4);
    expect(bucketChapterReads(4)).toBe(5);     // four-plus reads
    expect(bucketChapterReads(99)).toBe(5);
  });
});

describe('aggregateScriptureByBookChapter', () => {
  const reads = [
    { read_date: '2026-04-19', book: 'Luke', chapter: 24, verse_from: 13, verse_to: 35 },
    { read_date: '2026-04-20', book: 'Luke', chapter: 24, verse_from: null, verse_to: null },
    { read_date: '2026-03-01', book: 'Luke', chapter: 1,  verse_from: null, verse_to: null },
    { read_date: '2026-02-12', book: 'John', chapter: 3,  verse_from: null, verse_to: null },
  ];

  it('groups by book and counts entries', () => {
    const agg = aggregateScriptureByBookChapter(reads, () => 1);
    expect(agg.get('Luke')!.readCount).toBe(3);
    expect(agg.get('John')!.readCount).toBe(1);
    expect(agg.get('Genesis')).toBeUndefined();
  });

  it('sums per-chapter fractions using the supplied fractionFor', () => {
    // First Luke 24 read covers verses 13-35 = 23 verses; Luke 24 has 53.
    const agg = aggregateScriptureByBookChapter(reads, (r) => {
      if (r.verse_from !== null && r.verse_to !== null) {
        return Math.min(1, (r.verse_to - r.verse_from + 1) / 53);
      }
      return 1;
    });
    const luke = agg.get('Luke')!;
    // Chapter 24: ~0.434 + 1 = ~1.434
    const ch24 = luke.chapters.get(24)!;
    expect(ch24).toBeGreaterThan(1.4);
    expect(ch24).toBeLessThan(1.5);
    // Chapter 1: exactly 1
    expect(luke.chapters.get(1)).toBe(1);
    // No chapter 5 here.
    expect(luke.chapters.get(5)).toBeUndefined();
  });

  it('sorts each book\'s reads newest-first', () => {
    const agg = aggregateScriptureByBookChapter(reads, () => 1);
    const luke = agg.get('Luke')!;
    expect(luke.reads.map((r) => r.read_date)).toEqual([
      '2026-04-20', '2026-04-19', '2026-03-01',
    ]);
  });

  it('skips reads with empty book strings (defensive)', () => {
    const dirty = [...reads, { read_date: '2026-01-01', book: '', chapter: 1, verse_from: null, verse_to: null }];
    const agg = aggregateScriptureByBookChapter(dirty, () => 1);
    expect(agg.size).toBe(2); // still just Luke + John
  });
});

describe('aggregateBooksByAuthor', () => {
  const books = [
    { finished_on: '2026-04-12', title: 'A',  author: 'Tolkien',     pages: 400, rating: 5, review: null },
    { finished_on: '2026-02-01', title: 'B',  author: 'tolkien',     pages: 300, rating: 4, review: null }, // case-sensitive on purpose
    { finished_on: '2026-03-15', title: 'C',  author: '',            pages: 200, rating: 0, review: null },
    { finished_on: '2026-01-01', title: 'D',  author: '   ',         pages: 150, rating: 3, review: null }, // whitespace = unknown
    { finished_on: '2026-05-20', title: 'E',  author: 'Lewis',       pages: 250, rating: 5, review: 'great' },
  ];

  it('groups by author and counts/sums', () => {
    const agg = aggregateBooksByAuthor(books);
    expect(agg.get('Tolkien')!.total).toBe(1);
    expect(agg.get('tolkien')!.total).toBe(1); // case treated separately by design
    expect(agg.get('Lewis')!.total).toBe(1);
    expect(agg.get('Unknown author')!.total).toBe(2);
    expect(agg.get('Unknown author')!.pages).toBe(350);
    expect(agg.get('Lewis')!.pages).toBe(250);
  });

  it('sorts each author\'s books newest-first', () => {
    const agg = aggregateBooksByAuthor(books);
    const unknown = agg.get('Unknown author')!;
    expect(unknown.books.map((b) => b.finished_on)).toEqual(['2026-03-15', '2026-01-01']);
  });
});

describe('computeYearStats', () => {
  const scriptureReads = [
    { read_date: '2026-01-05', book: 'Genesis', chapter: 1, verse_from: null, verse_to: null }, // 31 verses
    { read_date: '2026-01-06', book: 'Genesis', chapter: 2, verse_from: null, verse_to: null }, // 25 verses
    { read_date: '2026-01-07', book: 'Matthew', chapter: 1, verse_from: 1, verse_to: 10 },     // 10 verses
    { read_date: '2025-12-31', book: 'Genesis', chapter: 50, verse_from: null, verse_to: null }, // out of year
  ];
  const bookReads = [
    { finished_on: '2026-02-12', title: 'A', author: 'Tolkien', pages: 400, rating: 5, review: null },
    { finished_on: '2026-04-12', title: 'B', author: 'Lewis',   pages: 250, rating: 4, review: null },
    { finished_on: '2025-11-01', title: 'old', author: 'Lewis', pages: 200, rating: 4, review: null }, // out of year
  ];
  const dailyPages = [
    { read_date: '2026-01-05', pages: 30 },
    { read_date: '2026-01-08', pages: 50 },
  ];
  const versesFor = (r: typeof scriptureReads[number]) => {
    if (r.verse_from !== null && r.verse_to !== null) return r.verse_to - r.verse_from + 1;
    if (r.book === 'Genesis' && r.chapter === 1) return 31;
    if (r.book === 'Genesis' && r.chapter === 2) return 25;
    if (r.book === 'Genesis' && r.chapter === 50) return 26;
    return 0;
  };

  it('totals scripture, books, and combined days correctly', () => {
    const stats = computeYearStats({
      year: 2026, scriptureReads, bookReads, dailyPages, versesFor,
      today: new Date(2026, 4, 1),
    });
    expect(stats.scripture.verses).toBe(31 + 25 + 10);   // 66
    expect(stats.scripture.chapters).toBe(3);
    expect(stats.scripture.days).toBe(3);                 // Jan 5, 6, 7
    expect(stats.scripture.booksTouched).toBe(2);         // Genesis, Matthew
    expect(stats.scripture.distinctChapters).toBe(3);     // Gen 1, Gen 2, Matt 1

    expect(stats.books.finished).toBe(2);
    expect(stats.books.pages).toBe(400 + 250 + 30 + 50);  // 730
    expect(stats.books.days).toBe(4);                     // Feb 12, Apr 12, Jan 5, Jan 8
    expect(stats.books.authors).toBe(2);                  // Tolkien, Lewis (case-insensitive)

    expect(stats.combined.days).toBe(6);                  // Jan 5, 6, 7, 8, Feb 12, Apr 12
  });

  it('streak: counts the current run when today is on a reading day', () => {
    // Reading on Jan 5, 6, 7, 8 — 4-day run. Today is Jan 8.
    const stats = computeYearStats({
      year: 2026, scriptureReads, bookReads, dailyPages, versesFor,
      today: new Date(2026, 0, 8),
    });
    expect(stats.combined.streakLongest).toBe(4);
    expect(stats.combined.streakCurrent).toBe(4);
  });

  it('streak: gives a 1-day grace window when today has no reading', () => {
    const stats = computeYearStats({
      year: 2026, scriptureReads, bookReads, dailyPages, versesFor,
      today: new Date(2026, 0, 9),
    });
    // Yesterday (Jan 8) had reading, so the current streak counts back from there.
    expect(stats.combined.streakCurrent).toBe(4);
  });

  it('streak: zero when both today and yesterday have no reading', () => {
    const stats = computeYearStats({
      year: 2026, scriptureReads, bookReads, dailyPages, versesFor,
      today: new Date(2026, 0, 15),
    });
    expect(stats.combined.streakCurrent).toBe(0);
    expect(stats.combined.streakLongest).toBe(4);
  });
});

describe('monthlyTotalsForYear', () => {
  it('buckets a date map into 12 months', () => {
    const map = new Map<string, number>([
      ['2026-01-05', 10], ['2026-01-20', 5],   // Jan: 15
      ['2026-03-01', 7],                         // Mar: 7
      ['2025-12-31', 99],                        // out of year
      ['2026-12-31', 12],                        // Dec
    ]);
    const out = monthlyTotalsForYear(2026, map);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe(15);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(7);
    expect(out[11]).toBe(12);
  });

  it('skips zero/negative/non-finite counts', () => {
    const map = new Map<string, number>([
      ['2026-04-01', 0],
      ['2026-04-02', -5],
      ['2026-04-03', NaN],
      ['2026-04-04', 8],
    ]);
    const out = monthlyTotalsForYear(2026, map);
    expect(out[3]).toBe(8);
  });
});

describe('otNtVerseSplit', () => {
  const reads = [
    { read_date: '2026-01-05', book: 'Genesis', chapter: 1, verse_from: null, verse_to: null }, // OT, 31
    { read_date: '2026-01-06', book: 'Matthew', chapter: 1, verse_from: null, verse_to: null }, // NT, 25
    { read_date: '2025-01-01', book: 'Genesis', chapter: 1, verse_from: null, verse_to: null }, // out
  ];
  const versesFor = (r: typeof reads[number]) => {
    if (r.book === 'Genesis' && r.chapter === 1) return 31;
    if (r.book === 'Matthew' && r.chapter === 1) return 25;
    return 0;
  };
  const isOldTestament = (book: string) => book === 'Genesis';

  it('splits by testament for the year', () => {
    const out = otNtVerseSplit({ year: 2026, reads, versesFor, isOldTestament });
    expect(out.ot).toBe(31);
    expect(out.nt).toBe(25);
  });
});

describe('topBooksByVerses', () => {
  const reads = [
    { read_date: '2026-01-05', book: 'Psalms',   chapter: 1, verse_from: null, verse_to: null },
    { read_date: '2026-02-05', book: 'Psalms',   chapter: 23, verse_from: null, verse_to: null },
    { read_date: '2026-02-06', book: 'Genesis',  chapter: 1, verse_from: null, verse_to: null },
    { read_date: '2026-03-06', book: 'John',     chapter: 3, verse_from: null, verse_to: null },
  ];
  const versesFor = (r: typeof reads[number]) => {
    if (r.book === 'Psalms' && r.chapter === 1) return 6;
    if (r.book === 'Psalms' && r.chapter === 23) return 6;
    if (r.book === 'Genesis' && r.chapter === 1) return 31;
    if (r.book === 'John' && r.chapter === 3) return 36;
    return 0;
  };

  it('ranks by total verses, slices to N, drops zero-verse books', () => {
    const top = topBooksByVerses({ year: 2026, n: 2, reads, versesFor });
    expect(top).toHaveLength(2);
    expect(top[0].book).toBe('John');
    expect(top[0].verses).toBe(36);
    expect(top[1].book).toBe('Genesis');
    expect(top[1].verses).toBe(31);
  });

  it('all-time when year is null', () => {
    const top = topBooksByVerses({ year: null, n: 4, reads, versesFor });
    expect(top.map((t) => t.book)).toEqual(['John', 'Genesis', 'Psalms']);
    // Psalms has 2 reads totaling 12 verses
    const psalms = top.find((t) => t.book === 'Psalms')!;
    expect(psalms.verses).toBe(12);
    expect(psalms.reads).toBe(2);
  });
});

describe('topAuthorsByCount', () => {
  const books = [
    { finished_on: '2026-01-15', title: 'A', author: 'C.S. Lewis',         pages: 250, rating: 5, review: null },
    { finished_on: '2026-03-10', title: 'B', author: 'C.S. Lewis',         pages: 300, rating: 5, review: null },
    { finished_on: '2026-04-12', title: 'C', author: 'Marilynne Robinson', pages: 247, rating: 5, review: null },
    { finished_on: '2026-05-05', title: 'D', author: 'Marilynne Robinson', pages: 260, rating: 4, review: null },
    { finished_on: '2026-02-20', title: 'E', author: 'Annie Dillard',      pages: 180, rating: 4, review: null },
    { finished_on: '2025-09-01', title: 'F', author: 'Annie Dillard',      pages: 200, rating: 5, review: null },
    { finished_on: '2025-11-11', title: 'G', author: '',                   pages: 100, rating: 0, review: null },
  ];

  it('ranks authors by total books and slices to N (year-bound)', () => {
    const top = topAuthorsByCount({ year: 2026, n: 2, bookReads: books });
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ author: 'C.S. Lewis',         total: 2, pages: 550 });
    expect(top[1]).toMatchObject({ author: 'Marilynne Robinson', total: 2, pages: 507 });
  });

  it('ties break alphabetically', () => {
    const top = topAuthorsByCount({ year: 2026, n: 5, bookReads: books });
    // Lewis and Robinson both have 2; Lewis sorts before Robinson alphabetically.
    expect(top.slice(0, 2).map((a) => a.author)).toEqual([
      'C.S. Lewis', 'Marilynne Robinson',
    ]);
  });

  it('all-time when year is null', () => {
    const top = topAuthorsByCount({ year: null, n: 10, bookReads: books });
    const dillard = top.find((a) => a.author === 'Annie Dillard')!;
    expect(dillard.total).toBe(2); // both 2025 and 2026 entries
    const unknown = top.find((a) => a.author === 'Unknown author')!;
    expect(unknown.total).toBe(1); // empty author falls into Unknown
  });
});

describe('daysWithReadingByYear', () => {
  it('counts distinct days per year across all three sources', () => {
    const out = daysWithReadingByYear({
      scriptureReads: [
        { read_date: '2026-01-05', book: 'X', chapter: 1, verse_from: null, verse_to: null },
        { read_date: '2026-01-05', book: 'Y', chapter: 1, verse_from: null, verse_to: null }, // same day, dedup
        { read_date: '2026-01-06', book: 'Z', chapter: 1, verse_from: null, verse_to: null },
        { read_date: '2024-12-31', book: 'A', chapter: 1, verse_from: null, verse_to: null },
      ],
      bookReads: [
        { finished_on: '2026-01-05', title: '', author: '', pages: 0, rating: 0, review: null }, // overlaps with scripture, still 1 day
        { finished_on: '2026-04-01', title: '', author: '', pages: 0, rating: 0, review: null },
      ],
      dailyPages: [
        { read_date: '2026-04-01', pages: 50 }, // overlaps with book completion
        { read_date: '2026-04-02', pages: 30 },
      ],
    });
    expect(out.get(2026)).toBe(4); // Jan 5, Jan 6, Apr 1, Apr 2
    expect(out.get(2024)).toBe(1); // Dec 31
    expect(out.get(2025)).toBeUndefined(); // no 2025 reading
  });

  it('returns empty map for empty inputs', () => {
    const out = daysWithReadingByYear({ scriptureReads: [], bookReads: [], dailyPages: [] });
    expect(out.size).toBe(0);
  });
});

describe('yearsInBooksRetro', () => {
  it('groups by year and sorts descending', () => {
    const scripture = [
      { read_date: '2026-01-05', book: 'Genesis', chapter: 1, verse_from: null, verse_to: null },
      { read_date: '2024-06-12', book: 'Genesis', chapter: 1, verse_from: null, verse_to: null },
    ];
    const books = [
      { finished_on: '2026-04-12', title: 'A', author: 'X', pages: 200, rating: 4, review: null },
      { finished_on: '2025-04-12', title: 'B', author: 'Y', pages: 100, rating: 3, review: null },
    ];
    const daily = [{ read_date: '2024-06-13', pages: 10 }];
    const out = yearsInBooksRetro({
      scriptureReads: scripture, bookReads: books, dailyPages: daily, versesFor: () => 31,
    });
    expect(out.map((r) => r.year)).toEqual([2026, 2025, 2024]);
    expect(out.find((r) => r.year === 2026)!.books).toBe(1);
    expect(out.find((r) => r.year === 2024)!.days).toBe(2); // Jun 12 + Jun 13
    expect(out.find((r) => r.year === 2024)!.pages).toBe(10);
  });
});

describe('reading plan helpers', () => {
  // Tiny chapter-count fake. Only knows about the books used in tests.
  const COUNTS: Record<string, number> = {
    Matthew: 28, Mark: 16, Luke: 24, John: 21,
    'Genesis': 50,
  };
  const chapterCountFor = (book: string) => COUNTS[book] || 0;

  const everyDay = [0, 1, 2, 3, 4, 5, 6];

  describe('planChapterSequence', () => {
    it('produces (book, chapter) pairs in book then chapter order', () => {
      const seq = planChapterSequence({ books: ['Mark', 'Matthew'] }, chapterCountFor);
      expect(seq.length).toBe(16 + 28);
      expect(seq[0]).toEqual({ book: 'Mark', chapter: 1 });
      expect(seq[15]).toEqual({ book: 'Mark', chapter: 16 });
      expect(seq[16]).toEqual({ book: 'Matthew', chapter: 1 });
      expect(seq[seq.length - 1]).toEqual({ book: 'Matthew', chapter: 28 });
    });
  });

  describe('planTotalChapters', () => {
    it('sums chapter counts across selected books', () => {
      expect(planTotalChapters({ books: ['Matthew', 'Mark', 'Luke', 'John'] }, chapterCountFor))
        .toBe(28 + 16 + 24 + 21); // 89
    });

    it('handles unknown books as zero (defensive)', () => {
      expect(planTotalChapters({ books: ['Sirach'] }, chapterCountFor)).toBe(0);
    });
  });

  describe('sessionsThroughDate', () => {
    it('counts only days-of-week inside [start..date]', () => {
      // 2026-01-01 is Thursday, 2026-01-07 is Wednesday
      const plan = { start_date: '2026-01-01', end_date: '2026-01-31', days_of_week: [1, 3, 5] }; // M/W/F
      // Jan 1 (Thu), Jan 2 (Fri), Jan 5 (Mon), Jan 7 (Wed) → 3 sessions through Jan 7
      expect(sessionsThroughDate(plan, '2026-01-07')).toBe(3); // Jan 2 (F), Jan 5 (M), Jan 7 (W)
    });

    it('returns 0 if date is before start', () => {
      const plan = { start_date: '2026-02-01', end_date: '2026-02-28', days_of_week: everyDay };
      expect(sessionsThroughDate(plan, '2026-01-15')).toBe(0);
    });

    it('caps at end_date if date is past it', () => {
      const plan = { start_date: '2026-01-01', end_date: '2026-01-07', days_of_week: everyDay };
      expect(sessionsThroughDate(plan, '2026-12-31')).toBe(7);
    });

    it('returns 0 if days_of_week is empty', () => {
      const plan = { start_date: '2026-01-01', end_date: '2026-12-31', days_of_week: [] };
      expect(sessionsThroughDate(plan, '2026-06-01')).toBe(0);
    });
  });

  describe('planTotalSessions', () => {
    it('counts sessions across full plan duration', () => {
      // Jan 1 - Jan 7 2026, every day → 7 sessions.
      const plan = { start_date: '2026-01-01', end_date: '2026-01-07', days_of_week: everyDay };
      expect(planTotalSessions(plan)).toBe(7);
    });
  });

  describe('dateForSessionCount', () => {
    it('returns the date of the Nth session when reading every day', () => {
      // Start Jan 1 2026 (Thu), every day, 7 sessions → Jan 7.
      expect(dateForSessionCount('2026-01-01', everyDay, 7)).toBe('2026-01-07');
    });

    it('skips days not in the dow set', () => {
      // Start Jan 1 2026 (Thu), weekdays M-F, 5 sessions:
      // Jan 1 (Thu), Jan 2 (Fri), Jan 5 (Mon), Jan 6 (Tue), Jan 7 (Wed) → Jan 7
      expect(dateForSessionCount('2026-01-01', [1, 2, 3, 4, 5], 5)).toBe('2026-01-07');
    });

    it('returns the start date when sessionsNeeded is 0 or negative', () => {
      expect(dateForSessionCount('2026-01-01', everyDay, 0)).toBe('2026-01-01');
      expect(dateForSessionCount('2026-01-01', everyDay, -3)).toBe('2026-01-01');
    });

    it('returns the start date when dow set is empty', () => {
      expect(dateForSessionCount('2026-01-01', [], 10)).toBe('2026-01-01');
    });

    it('round-trips with sessionsThroughDate (planTotalSessions is its right-inverse)', () => {
      const start = '2026-01-01';
      const dow = [1, 3, 5]; // M/W/F
      const endKey = dateForSessionCount(start, dow, 12);
      // sessionsThroughDate from start..endKey should equal exactly 12.
      const sessions = sessionsThroughDate(
        { start_date: start, end_date: endKey, days_of_week: dow },
        endKey,
      );
      expect(sessions).toBe(12);
    });
  });

  describe('planPaceStatus', () => {
    const plan = {
      books: ['Mark', 'Matthew'],          // 16 + 28 = 44 chapters total
      start_date: '2026-01-01',
      end_date: '2026-02-13',              // 44 days, daily, per_session=1 → exactly 44 sessions
      days_of_week: everyDay,
      per_session: 1,
    };

    it('on-pace when completed equals expected', () => {
      // 5 days in (Jan 1-5), expected 5; user completed 5.
      const out = planPaceStatus({
        plan, completionsCount: 5,
        today: new Date(2026, 0, 5),
        chapterCountFor,
      });
      expect(out.expected).toBe(5);
      expect(out.completed).toBe(5);
      expect(out.total).toBe(44);
      expect(out.state).toBe(0);
      expect(out.sessionDelta).toBe(0);
    });

    it('ahead when completed exceeds expected', () => {
      const out = planPaceStatus({
        plan, completionsCount: 10,
        today: new Date(2026, 0, 5),
        chapterCountFor,
      });
      expect(out.state).toBe(1);
      expect(out.sessionDelta).toBe(5);
    });

    it('behind when completed is under expected', () => {
      const out = planPaceStatus({
        plan, completionsCount: 2,
        today: new Date(2026, 0, 10),
        chapterCountFor,
      });
      expect(out.expected).toBe(10);
      expect(out.completed).toBe(2);
      expect(out.state).toBe(-1);
      expect(out.sessionDelta).toBe(-8);
    });

    it('caps completed at total (no double-counting)', () => {
      const out = planPaceStatus({
        plan, completionsCount: 99,
        today: new Date(2026, 1, 13),
        chapterCountFor,
      });
      expect(out.completed).toBe(44);
      expect(out.pctComplete).toBe(1);
    });

    it('handles per_session > 1 correctly', () => {
      const fast = { ...plan, per_session: 4, end_date: '2026-01-11' }; // 11 days * 4 = 44 chapters
      const out = planPaceStatus({
        plan: fast, completionsCount: 16,
        today: new Date(2026, 0, 5),
        chapterCountFor,
      });
      // 5 sessions × 4 per session = 20 expected, completed 16 → behind by 1 session
      expect(out.expected).toBe(20);
      expect(out.completed).toBe(16);
      expect(out.sessionDelta).toBe(-1);
    });
  });
});

describe('buildCalendarGrid', () => {
  it('returns 42 cells (6 rows × 7 cols)', () => {
    const cells = buildCalendarGrid(2026, 3, new Map(), 'chapters', new Date(2026, 3, 15));
    expect(cells).toHaveLength(42);
  });

  it('pads leading cells until day 1 lands on its day-of-week', () => {
    // April 1, 2026 is a Wednesday (dow=3)
    const cells = buildCalendarGrid(2026, 3, new Map(), 'chapters', new Date(2026, 3, 15));
    expect(cells[0].day).toBeNull();
    expect(cells[3].day).toBe(1); // dow=3 → 3 leading empties, then April 1
  });

  it('marks today and future days correctly', () => {
    const today = new Date(2026, 3, 15); // April 15
    const cells = buildCalendarGrid(2026, 3, new Map(), 'chapters', today);
    const fifteenth = cells.find((c) => c.day === 15)!;
    const sixteenth = cells.find((c) => c.day === 16)!;
    expect(fifteenth.isToday).toBe(true);
    expect(fifteenth.isFuture).toBe(false);
    expect(sixteenth.isFuture).toBe(true);
  });

  it('applies levels from the by-date map', () => {
    const map = new Map<string, number>([['2026-04-10', 30]]); // verses scale → level 4
    const cells = buildCalendarGrid(2026, 3, map, 'verses-or-pages', new Date(2026, 3, 30));
    const apr10 = cells.find((c) => c.date === '2026-04-10')!;
    expect(apr10.count).toBe(30);
    expect(apr10.level).toBe(4);
  });
});
