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
