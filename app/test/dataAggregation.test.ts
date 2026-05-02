import { describe, it, expect } from 'vitest';
import {
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
  it('returns one cell per day of the year', () => {
    const map = new Map<string, number>();
    const today = new Date(2026, 5, 15); // mid-year so we have past + future
    const grid = buildHeatGrid(2026, map, 'chapters', today);
    // 2026 is not a leap year — 365 days
    expect(grid.cells).toHaveLength(365);
  });

  it('marks future days as isFuture, past as not', () => {
    const today = new Date(2026, 5, 15);
    const grid = buildHeatGrid(2026, new Map(), 'chapters', today);
    const past = grid.cells.find((c) => c.date === '2026-01-01');
    const future = grid.cells.find((c) => c.date === '2026-12-31');
    expect(past?.isFuture).toBe(false);
    expect(future?.isFuture).toBe(true);
  });

  it('skips future days in totals', () => {
    const today = new Date(2026, 0, 5); // Jan 5
    const map = new Map<string, number>([
      ['2026-01-03', 3],
      ['2026-01-04', 5],
      ['2026-12-15', 10], // future — should not count
    ]);
    const grid = buildHeatGrid(2026, map, 'chapters', today);
    expect(grid.totalDays).toBe(2);
    expect(grid.totalCount).toBe(8);
  });

  it('assigns the correct level per cell from the count map', () => {
    const today = new Date(2026, 11, 31);
    const map = new Map<string, number>([
      ['2026-04-19', 0.5], // < 1 chapter → level 1
      ['2026-04-20', 8],   // ≥ 8 → level 5
    ]);
    const grid = buildHeatGrid(2026, map, 'chapters', today);
    const a = grid.cells.find((c) => c.date === '2026-04-19')!;
    const b = grid.cells.find((c) => c.date === '2026-04-20')!;
    expect(a.level).toBe(1);
    expect(b.level).toBe(5);
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
