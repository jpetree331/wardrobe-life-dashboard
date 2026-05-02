// Pure aggregation + bucketing helpers for the Data room. Heatmap level
// thresholds, calendar cell tinting, by-day rollups — all easy to unit-test
// in isolation, none of them touching React or Supabase.

export type HeatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type Source = 'scripture' | 'books';

/**
 * Heatmap unit. The label flips depending on `source`:
 *   - scripture + 'verses'    → "Verses"
 *   - scripture + 'chapters'  → "Chapters"
 *   - books     + 'verses'    → "Pages"  (we reuse the type slot for pages)
 *   - books     + 'chapters'  → "Sections" (= pages / 50, rounded down)
 */
export type Unit = 'verses' | 'chapters';

/**
 * Bucket a per-day count into a heat level (0..5) per the prototype's rules.
 * Level 0 = empty cell; 1..5 = increasing intensity.
 *
 * Chapters scale (used for source=scripture, unit=chapters):
 *   <1   → 1     (anything under a chapter — i.e. a partial chapter read)
 *   <2   → 2
 *   <4   → 3
 *   <8   → 4
 *   ≥8   → 5
 *
 * Verses / pages scale (used for source=scripture+verses, source=books+pages):
 *   <5   → 1
 *   <15  → 2
 *   <30  → 3
 *   <60  → 4
 *   ≥60  → 5
 */
export function bucketLevel(count: number, scale: 'chapters' | 'verses-or-pages'): HeatLevel {
  if (count <= 0 || !Number.isFinite(count)) return 0;
  if (scale === 'chapters') {
    if (count < 1) return 1;
    if (count < 2) return 2;
    if (count < 4) return 3;
    if (count < 8) return 4;
    return 5;
  }
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  if (count < 60) return 4;
  return 5;
}

/**
 * Sum values into a date→count map. Generic so it works for verses,
 * chapters, pages, sessions, etc.
 */
export function sumByDate<T>(items: T[], pickDate: (it: T) => string, pickAmount: (it: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const d = pickDate(it);
    if (!d) continue;
    const v = pickAmount(it);
    if (!Number.isFinite(v) || v <= 0) continue;
    out.set(d, (out.get(d) || 0) + v);
  }
  return out;
}

/**
 * Build the array of cells for a year-grid heatmap. Renders the full
 * Sunday-to-Saturday rectangle covering [Jan 1 .. Dec 31] of the year,
 * which means leading days from the prior year (if Jan 1 isn't a Sunday)
 * and trailing days from the next year (if Dec 31 isn't a Saturday) are
 * also included as cells. Out-of-year cells get `inYear=false`; the
 * renderer can choose to show their data the same way or dim them.
 *
 * `today` is parameterized so the function is deterministic for tests.
 *
 * Note on weekIndex: this function used to compute weekIndex with
 * millisecond arithmetic (`(d - firstSunday) / 7days`). That subtly broke
 * around DST transitions — after spring-forward an hour goes missing, so
 * dates that should land at exactly N weeks instead measure N-1.999...
 * weeks and `Math.floor` produces N-1. Two days ended up sharing a grid
 * cell ("missing teeth" near Nov in fall-back years, around Apr 26 in
 * spring-forward years for `firstSunday = Dec 28`). The fix below is
 * purely calendar-based: count days from `firstGridSunday` and divide
 * by 7. No clocks involved.
 */
export type HeatCell = {
  date: string;          // 'YYYY-MM-DD'
  count: number;
  level: HeatLevel;
  dow: number;           // 0 = Sunday
  weekIndex: number;     // 0 = first column
  isFuture: boolean;
  inYear: boolean;       // false for prior/next-year padding cells
};

export function buildHeatGrid(
  year: number,
  byDate: Map<string, number>,
  scale: 'chapters' | 'verses-or-pages',
  today: Date = new Date(),
): { cells: HeatCell[]; totalDays: number; totalCount: number } {
  const cells: HeatCell[] = [];
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const todayKey = formatLocalDate(today);
  const yearStartKey = formatLocalDate(yearStart);
  const yearEndKey = formatLocalDate(yearEnd);

  // First Sunday on or before Jan 1.
  const firstGridSunday = new Date(yearStart);
  firstGridSunday.setDate(yearStart.getDate() - yearStart.getDay());

  // Last Saturday on or after Dec 31.
  const lastGridSaturday = new Date(yearEnd);
  lastGridSaturday.setDate(yearEnd.getDate() + (6 - yearEnd.getDay()));

  let totalDays = 0;
  let totalCount = 0;
  let dayIndex = 0;
  for (
    const d = new Date(firstGridSunday);
    d <= lastGridSaturday;
    d.setDate(d.getDate() + 1)
  ) {
    const dow = d.getDay();
    const dateKey = formatLocalDate(d);
    const count = byDate.get(dateKey) || 0;
    const level = bucketLevel(count, scale);
    const isFuture = dateKey > todayKey;
    const inYear = dateKey >= yearStartKey && dateKey <= yearEndKey;
    const weekIndex = Math.floor(dayIndex / 7);
    cells.push({ date: dateKey, count, level, dow, weekIndex, isFuture, inYear });
    if (inYear && count > 0 && !isFuture) {
      totalDays++;
      totalCount += count;
    }
    dayIndex++;
  }
  return { cells, totalDays, totalCount };
}

/**
 * Build a calendar month grid: 6 rows × 7 cols of dates, with leading
 * empties from the previous month and trailing empties from the next so
 * the days-of-week align Sunday → Saturday. `monthIndex` is 0-based.
 */
export type CalCell = {
  date: string | null;   // null for padding cells outside the month
  day: number | null;
  isToday: boolean;
  isFuture: boolean;
  count: number;
  level: HeatLevel;
};

export function buildCalendarGrid(
  year: number,
  monthIndex: number,
  byDate: Map<string, number>,
  scale: 'chapters' | 'verses-or-pages',
  today: Date = new Date(),
): CalCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startDow = firstOfMonth.getDay();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = formatLocalDate(today);
  const cells: CalCell[] = [];

  // Pad with leading empty cells.
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: null, day: null, isToday: false, isFuture: false, count: 0, level: 0 });
  }

  // Days of the month.
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, monthIndex, d);
    const dateKey = formatLocalDate(date);
    const count = byDate.get(dateKey) || 0;
    cells.push({
      date: dateKey,
      day: d,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      count,
      level: bucketLevel(count, scale),
    });
  }

  // Pad to a full 6-row grid (42 cells).
  while (cells.length < 42) {
    cells.push({ date: null, day: null, isToday: false, isFuture: false, count: 0, level: 0 });
  }

  return cells;
}

/**
 * Bucket a per-chapter "fraction read across all entries" into a level.
 * One whole-chapter read = 1.0; a 5-verse read of a 30-verse chapter ≈ 0.17.
 *
 *   0          → 0   (never touched)
 *   (0, 0.5)   → 1   (started but didn't finish a single read-through)
 *   [0.5, 1)   → 2   (read most of it once)
 *   [1, 2)     → 3   (one full read-through, give or take)
 *   [2, 4)     → 4   (multiple read-throughs)
 *   [4, ∞)     → 5   (deeply familiar)
 *
 * The thresholds line up loosely with the heatmap chapters scale, but the
 * unit is "chapter-read-fractions accumulated" rather than "chapters per
 * day", so the curve is gentler.
 */
export function bucketChapterReads(fraction: number): HeatLevel {
  if (!Number.isFinite(fraction) || fraction <= 0) return 0;
  if (fraction < 0.5) return 1;
  if (fraction < 1)   return 2;
  if (fraction < 2)   return 3;
  if (fraction < 4)   return 4;
  return 5;
}

/**
 * Per-book aggregation for the Book × Chapter view (Scripture mode).
 * Returns a map keyed by book name; for each book we know:
 *   - readCount: how many distinct read entries
 *   - chapters: a Map<chapter#, fraction-read-summed>
 *   - reads: every ScriptureRead for that book, newest-first by date
 */
export type ScriptureBookAggregate<T = ScriptureReadLike> = {
  readCount: number;
  /** Sum of fractions read per chapter — 1.0 = one full read-through. */
  chapters: Map<number, number>;
  reads: T[];
};

/** Minimal shape of a Scripture read used by aggregation. */
export type ScriptureReadLike = {
  read_date: string;
  book: string;
  chapter: number;
  verse_from: number | null;
  verse_to: number | null;
};

export function aggregateScriptureByBookChapter<T extends ScriptureReadLike>(
  reads: T[],
  fractionFor: (r: T) => number,
): Map<string, ScriptureBookAggregate<T>> {
  const out = new Map<string, ScriptureBookAggregate<T>>();
  for (const r of reads) {
    if (!r.book) continue;
    let agg = out.get(r.book);
    if (!agg) {
      agg = { readCount: 0, chapters: new Map(), reads: [] };
      out.set(r.book, agg);
    }
    agg.readCount++;
    agg.reads.push(r);
    if (r.chapter > 0) {
      const f = fractionFor(r);
      if (Number.isFinite(f) && f > 0) {
        agg.chapters.set(r.chapter, (agg.chapters.get(r.chapter) || 0) + f);
      }
    }
  }
  // Sort each book's reads newest-first.
  for (const agg of out.values()) {
    agg.reads.sort((a, b) => b.read_date.localeCompare(a.read_date));
  }
  return out;
}

/** Minimal shape of a Book read used by aggregation. */
export type BookReadLike = {
  finished_on: string;
  title: string;
  author: string;
  pages: number;
  rating: number;
  review: string | null;
};

export type AuthorAggregate<T extends BookReadLike> = {
  total: number;
  pages: number;
  books: T[];
};

/**
 * Group book completions by author. Authors with empty/whitespace strings
 * are bucketed under "Unknown author". Each group's books are sorted by
 * finish date, newest-first.
 */
export function aggregateBooksByAuthor<T extends BookReadLike>(
  bookReads: T[],
): Map<string, AuthorAggregate<T>> {
  const out = new Map<string, AuthorAggregate<T>>();
  for (const b of bookReads) {
    const author = (b.author || '').trim() || 'Unknown author';
    let agg = out.get(author);
    if (!agg) {
      agg = { total: 0, pages: 0, books: [] };
      out.set(author, agg);
    }
    agg.total++;
    agg.pages += Math.max(0, b.pages || 0);
    agg.books.push(b);
  }
  for (const agg of out.values()) {
    agg.books.sort((a, b) => b.finished_on.localeCompare(a.finished_on));
  }
  return out;
}

// ── Stats view helpers ────────────────────────────────────────────────
//
// Pure aggregation for the Stats panel. Each helper takes raw reads + a
// year filter and returns a compact answer the renderer can drop into
// place. Streaks, monthly columns, OT/NT split, top-books, and the all-
// time year-by-year retrospective.

/** Year-bound summary used by the KPI row at the top of the Stats panel. */
export type YearStats = {
  scripture: {
    verses: number;
    chapters: number;       // each scripture-read row counts as 1 chapter
    days: number;            // distinct read_dates with any scripture
    booksTouched: number;    // distinct Bible books with at least one read
    distinctChapters: number; // distinct (book, chapter) pairs
  };
  books: {
    finished: number;
    pages: number;           // pages from completions + daily-page logs
    days: number;            // distinct dates with any books reading
    authors: number;         // distinct authors who finished
  };
  combined: {
    days: number;            // distinct dates with ANY reading (scripture, book, daily)
    streakCurrent: number;   // consecutive days with any reading, ending today/yesterday
    streakLongest: number;   // longest run inside [Jan 1 .. min(Dec 31, today)]
  };
};

/** Minimal shape of a daily-pages log used by stats helpers. */
export type DailyPageLike = {
  read_date: string;
  pages: number;
};

export function computeYearStats<S extends ScriptureReadLike, B extends BookReadLike>(opts: {
  year: number;
  scriptureReads: S[];
  bookReads: B[];
  dailyPages: DailyPageLike[];
  versesFor: (r: S) => number;
  today: Date;
}): YearStats {
  const { year, scriptureReads, bookReads, dailyPages, versesFor, today } = opts;
  const yearPrefix = `${year}-`;

  // Scripture
  let verses = 0;
  let chapters = 0;
  const scriptureDays = new Set<string>();
  const booksTouched = new Set<string>();
  const distinctChapters = new Set<string>();
  for (const r of scriptureReads) {
    if (!r.read_date.startsWith(yearPrefix)) continue;
    const v = versesFor(r);
    if (Number.isFinite(v) && v > 0) verses += v;
    chapters++;
    scriptureDays.add(r.read_date);
    if (r.book) booksTouched.add(r.book);
    if (r.book && r.chapter > 0) distinctChapters.add(`${r.book}|${r.chapter}`);
  }

  // Books — both completions and daily-page logs contribute pages and days.
  let pages = 0;
  let finished = 0;
  const booksDays = new Set<string>();
  const authors = new Set<string>();
  for (const b of bookReads) {
    if (!b.finished_on.startsWith(yearPrefix)) continue;
    finished++;
    pages += Math.max(0, b.pages || 0);
    booksDays.add(b.finished_on);
    const a = (b.author || '').trim();
    if (a) authors.add(a.toLowerCase());
  }
  for (const d of dailyPages) {
    if (!d.read_date.startsWith(yearPrefix)) continue;
    pages += Math.max(0, d.pages || 0);
    booksDays.add(d.read_date);
  }

  // Combined day-set + streaks.
  const combinedDays = new Set<string>([...scriptureDays, ...booksDays]);

  // Compute streaks across the year [Jan 1 .. min(Dec 31, today)] using a
  // single-pass walk over consecutive calendar days. This is simpler and
  // safer than sorting + diffing dates.
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const todayKey = formatLocalDate(today);
  const yearEndKey = formatLocalDate(yearEnd);
  // Walk only as far as today (or year end, whichever is earlier).
  const stopKey = todayKey < yearEndKey ? todayKey : yearEndKey;

  let streakLongest = 0;
  let run = 0;
  let streakCurrent = 0;
  for (
    const d = new Date(yearStart);
    formatLocalDate(d) <= stopKey;
    d.setDate(d.getDate() + 1)
  ) {
    const key = formatLocalDate(d);
    if (combinedDays.has(key)) {
      run++;
      if (run > streakLongest) streakLongest = run;
    } else {
      run = 0;
    }
  }
  // streakCurrent: only valid if the run ended on the stop day (today/year-end).
  // If today has a read, we want today's run. If today doesn't but yesterday
  // does, we still report yesterday's run as "current" (1-day grace), matching
  // how Strava/Duolingo treat streaks.
  if (combinedDays.has(stopKey)) {
    streakCurrent = run;
  } else {
    // Try yesterday.
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const yKey = formatLocalDate(yest);
    if (yKey >= `${year}-01-01` && yKey <= yearEndKey && combinedDays.has(yKey)) {
      // Walk backward from yesterday to find the run length.
      let yRun = 0;
      const cursor = new Date(yest);
      while (true) {
        const k = formatLocalDate(cursor);
        if (k < `${year}-01-01`) break;
        if (!combinedDays.has(k)) break;
        yRun++;
        cursor.setDate(cursor.getDate() - 1);
      }
      streakCurrent = yRun;
    }
  }

  return {
    scripture: {
      verses,
      chapters,
      days: scriptureDays.size,
      booksTouched: booksTouched.size,
      distinctChapters: distinctChapters.size,
    },
    books: {
      finished,
      pages,
      days: booksDays.size,
      authors: authors.size,
    },
    combined: {
      days: combinedDays.size,
      streakCurrent,
      streakLongest,
    },
  };
}

/**
 * 12-element array of per-month totals from a date→count map. Index 0 =
 * January, index 11 = December. Days outside `year` are ignored.
 */
export function monthlyTotalsForYear(year: number, byDate: Map<string, number>): number[] {
  const out = new Array(12).fill(0);
  const yearPrefix = `${year}-`;
  for (const [dateKey, count] of byDate) {
    if (!dateKey.startsWith(yearPrefix)) continue;
    if (!Number.isFinite(count) || count <= 0) continue;
    const month = parseInt(dateKey.slice(5, 7), 10) - 1;
    if (month < 0 || month > 11) continue;
    out[month] += count;
  }
  return out;
}

/**
 * Old-Testament vs New-Testament split for a year, measured in verses.
 * Caller supplies the OT predicate (the canonical OT/NT membership lives
 * in `bibleVerseCounts.ts`, which we deliberately don't depend on here).
 */
export function otNtVerseSplit<S extends ScriptureReadLike>(opts: {
  year: number;
  reads: S[];
  versesFor: (r: S) => number;
  isOldTestament: (book: string) => boolean;
}): { ot: number; nt: number } {
  const { year, reads, versesFor, isOldTestament } = opts;
  const yearPrefix = `${year}-`;
  let ot = 0;
  let nt = 0;
  for (const r of reads) {
    if (!r.read_date.startsWith(yearPrefix)) continue;
    if (!r.book) continue;
    const v = versesFor(r);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (isOldTestament(r.book)) ot += v;
    else nt += v;
  }
  return { ot, nt };
}

/**
 * Top-N Bible books for the year (or all-time if year is null), ranked by
 * cumulative verses read. Books with zero verses are dropped. Stable tie
 * break by book name.
 */
export function topBooksByVerses<S extends ScriptureReadLike>(opts: {
  year: number | null;
  n: number;
  reads: S[];
  versesFor: (r: S) => number;
}): Array<{ book: string; verses: number; reads: number }> {
  const { year, n, reads, versesFor } = opts;
  const yearPrefix = year !== null ? `${year}-` : null;
  const totals = new Map<string, { verses: number; reads: number }>();
  for (const r of reads) {
    if (yearPrefix && !r.read_date.startsWith(yearPrefix)) continue;
    if (!r.book) continue;
    const v = versesFor(r);
    let row = totals.get(r.book);
    if (!row) { row = { verses: 0, reads: 0 }; totals.set(r.book, row); }
    if (Number.isFinite(v) && v > 0) row.verses += v;
    row.reads++;
  }
  const arr: Array<{ book: string; verses: number; reads: number }> = [];
  for (const [book, row] of totals) {
    if (row.verses <= 0 && row.reads <= 0) continue;
    arr.push({ book, verses: row.verses, reads: row.reads });
  }
  arr.sort((a, b) => b.verses - a.verses || a.book.localeCompare(b.book));
  return arr.slice(0, Math.max(0, n));
}

/** One row in the Years-in-Books retrospective. */
export type YearRetrospective = {
  year: number;
  verses: number;
  chapters: number;       // count of scripture-read rows
  pages: number;
  books: number;          // finished books
  days: number;           // distinct days with any reading
};

/**
 * All years that show up in the data, descending. Each row carries the
 * year's headline totals — the same numbers `computeYearStats` gives, but
 * cheap to compute in bulk and shaped for table rendering.
 */
export function yearsInBooksRetro<S extends ScriptureReadLike, B extends BookReadLike>(opts: {
  scriptureReads: S[];
  bookReads: B[];
  dailyPages: DailyPageLike[];
  versesFor: (r: S) => number;
}): YearRetrospective[] {
  const { scriptureReads, bookReads, dailyPages, versesFor } = opts;
  const byYear = new Map<number, {
    verses: number;
    chapters: number;
    pages: number;
    books: number;
    days: Set<string>;
  }>();
  function ensure(year: number) {
    let row = byYear.get(year);
    if (!row) {
      row = { verses: 0, chapters: 0, pages: 0, books: 0, days: new Set() };
      byYear.set(year, row);
    }
    return row;
  }
  function yearOf(dateKey: string): number | null {
    const y = parseInt(dateKey.slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }

  for (const r of scriptureReads) {
    const y = yearOf(r.read_date); if (y === null) continue;
    const row = ensure(y);
    const v = versesFor(r);
    if (Number.isFinite(v) && v > 0) row.verses += v;
    row.chapters++;
    row.days.add(r.read_date);
  }
  for (const b of bookReads) {
    const y = yearOf(b.finished_on); if (y === null) continue;
    const row = ensure(y);
    row.books++;
    row.pages += Math.max(0, b.pages || 0);
    row.days.add(b.finished_on);
  }
  for (const d of dailyPages) {
    const y = yearOf(d.read_date); if (y === null) continue;
    const row = ensure(y);
    row.pages += Math.max(0, d.pages || 0);
    row.days.add(d.read_date);
  }

  return Array.from(byYear.entries())
    .map(([year, r]) => ({
      year,
      verses: r.verses,
      chapters: r.chapters,
      pages: r.pages,
      books: r.books,
      days: r.days.size,
    }))
    .sort((a, b) => b.year - a.year);
}

// ── Reading plans ─────────────────────────────────────────────────────
//
// Pure helpers for the Plans tab: total chapters in a plan, expected
// position by today, ahead/behind pace, ordered chapter list.

/** Minimal shape of a reading plan used by aggregation. */
export type ReadingPlanLike = {
  books: string[];
  start_date: string;
  end_date: string;
  days_of_week: number[];   // 0..6, 0 = Sunday
  unit: 'chapters' | 'verses';
  per_session: number;
};

/** Minimal shape of a plan completion used by aggregation. */
export type PlanCompletionLike = {
  book: string;
  chapter: number;
};

/**
 * Generate the ordered list of (book, chapter) pairs for a plan, in the
 * order they should be read. Books traverse in the order given by
 * `plan.books`; within each book, chapters go 1 → N.
 *
 * `chapterCountFor` is injected so the helper stays decoupled from the
 * verse-count manifest.
 */
export function planChapterSequence(
  plan: Pick<ReadingPlanLike, 'books'>,
  chapterCountFor: (book: string) => number,
): Array<{ book: string; chapter: number }> {
  const out: Array<{ book: string; chapter: number }> = [];
  for (const book of plan.books) {
    const n = chapterCountFor(book);
    for (let c = 1; c <= n; c++) out.push({ book, chapter: c });
  }
  return out;
}

/** Total chapters in a plan (sum of chapter counts across selected books). */
export function planTotalChapters(
  plan: Pick<ReadingPlanLike, 'books'>,
  chapterCountFor: (book: string) => number,
): number {
  let total = 0;
  for (const book of plan.books) total += Math.max(0, chapterCountFor(book));
  return total;
}

/**
 * How many sessions fall between [start_date .. dateKey] inclusive,
 * counting only the weekdays in `days_of_week`. Calendar arithmetic only;
 * DST-immune.
 */
export function sessionsThroughDate(
  plan: Pick<ReadingPlanLike, 'start_date' | 'end_date' | 'days_of_week'>,
  dateKey: string,
): number {
  const startKey = plan.start_date;
  const endKey = plan.end_date;
  const stopKey = dateKey < startKey ? null
                : dateKey > endKey   ? endKey
                : dateKey;
  if (stopKey === null) return 0;
  const dowSet = new Set(plan.days_of_week);
  if (dowSet.size === 0) return 0;

  // Walk start → stop.
  const start = parseLocalDate(startKey);
  const stop = parseLocalDate(stopKey);
  let count = 0;
  for (
    const d = new Date(start);
    d <= stop;
    d.setDate(d.getDate() + 1)
  ) {
    if (dowSet.has(d.getDay())) count++;
  }
  return count;
}

/** Total session days across the whole plan duration. */
export function planTotalSessions(
  plan: Pick<ReadingPlanLike, 'start_date' | 'end_date' | 'days_of_week'>,
): number {
  return sessionsThroughDate(plan, plan.end_date);
}

/**
 * Pace status as of a given date. "Expected" = sessions × per_session.
 * "ahead" if completed exceeds expected; "behind" if under.
 *
 * `dayDelta` reads in the unit of "days you'd need to do/skip a normal
 * session at the current pace to catch up": positive = ahead by that many
 * sessions, negative = behind by that many.
 */
export type PaceStatus = {
  expected: number;
  completed: number;
  total: number;
  /** -1 / 0 / 1 — convenience for tinting. */
  state: -1 | 0 | 1;
  /** session-day delta vs. expected. */
  sessionDelta: number;
  pctComplete: number; // 0..1
};

export function planPaceStatus(opts: {
  plan: Pick<ReadingPlanLike, 'books' | 'start_date' | 'end_date' | 'days_of_week' | 'per_session'>;
  completionsCount: number;
  today: Date;
  chapterCountFor: (book: string) => number;
}): PaceStatus {
  const { plan, completionsCount, today, chapterCountFor } = opts;
  const todayKey = formatLocalDate(today);
  const sessions = sessionsThroughDate(plan, todayKey);
  const expected = sessions * Math.max(1, plan.per_session);
  const total = planTotalChapters(plan, chapterCountFor);
  const completed = Math.min(completionsCount, total);
  const diff = completed - expected;
  let state: -1 | 0 | 1 = 0;
  if (diff > 0) state = 1;
  else if (diff < 0) state = -1;
  const sessionDelta = plan.per_session > 0 ? diff / plan.per_session : 0;
  const pctComplete = total > 0 ? completed / total : 0;
  return { expected, completed, total, state, sessionDelta, pctComplete };
}

/** Parse 'YYYY-MM-DD' as a local-time Date (midnight). No UTC drift. */
function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Format a Date as 'YYYY-MM-DD' in local time (no UTC drift). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Month names — index 0 = January. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
