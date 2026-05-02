import { describe, it, expect } from 'vitest';
import {
  aggregateBooksByAuthor,
  aggregateScriptureByBookChapter,
  bucketChapterReads,
  bucketLevel,
  buildCalendarGrid,
  buildHeatGrid,
  formatLocalDate,
  sumByDate,
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
