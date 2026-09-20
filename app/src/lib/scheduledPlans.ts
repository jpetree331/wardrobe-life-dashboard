// Scheduled reading plans — PURE. A scheduled plan has a FIXED day-by-day
// schedule (Day 1: these chapters, Day 2: those…), unlike the classic plan
// model in dataAggregation.ts, which is "a list of books read once, in
// order" with pace computed from chapters-per-session.
//
// Why a second model: multi-track plans repeat chapters (the One-Year plan
// reads Psalms ~2.5x and the Gospels twice), so the classic completion key
// `(plan, book, chapter)` can't tell Psalm 2 on day 2 from Psalm 2 on day
// 364. Scheduled plans key completion by DAY as well.
//
// A saved plan row points at its schedule via `preset_key`; the schedule
// itself is static data shipped with the app. No React, no Supabase.

import { ONE_YEAR_BIBLE_DAYS } from './plans/oneYearBible';

export type ScheduledReading = { book: string; chapter: number };

export type ScheduledPlanDef = {
  key: string;
  name: string;
  description: string;
  /** days[0] is Day 1. */
  days: readonly (readonly ScheduledReading[])[];
};

/** "Song of Solomon 2" → { book: 'Song of Solomon', chapter: 2 }. */
export function parseReadingRef(ref: string): ScheduledReading {
  const i = ref.lastIndexOf(' ');
  const chapter = Number(ref.slice(i + 1));
  if (i <= 0 || !Number.isInteger(chapter) || chapter < 1) {
    throw new Error(`Bad reading ref: "${ref}"`);
  }
  return { book: ref.slice(0, i), chapter };
}

export const SCHEDULED_PLANS: readonly ScheduledPlanDef[] = [
  {
    key: 'one-year-bible-4track',
    name: 'One-Year Bible (four tracks)',
    description:
      'The whole Bible in 365 days — OT history, prophets & writings, New Testament, and a Psalm or Proverb each day.',
    days: ONE_YEAR_BIBLE_DAYS.map((refs) => refs.map(parseReadingRef)),
  },
];

export function scheduledPlanByKey(key: string | null | undefined): ScheduledPlanDef | null {
  if (!key) return null;
  return SCHEDULED_PLANS.find((p) => p.key === key) ?? null;
}

// ── Tracks ───────────────────────────────────────────────────────────

export type ReadingTrack = 'history' | 'prophets' | 'nt' | 'psalm';

export const TRACK_LABELS: Record<ReadingTrack, string> = {
  history: 'OT History',
  prophets: 'Prophets & Writings',
  nt: 'New Testament',
  psalm: 'Psalm / Proverb',
};

const HISTORY = new Set([
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges',
  'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles',
  '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
]);
const PSALM = new Set(['Psalms', 'Proverbs']);
const PROPHETS = new Set([
  'Job', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
  'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
]);

/** Which of the plan's four columns a book belongs to. */
export function trackOf(book: string): ReadingTrack {
  if (HISTORY.has(book)) return 'history';
  if (PSALM.has(book)) return 'psalm';
  if (PROPHETS.has(book)) return 'prophets';
  return 'nt';
}

// ── Date math (local calendar dates, no UTC drift) ───────────────────

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar date of plan day `dayNumber` (1-based) for a given start. */
export function dateForDay(startDate: string, dayNumber: number): string {
  const d = parseLocal(startDate);
  d.setDate(d.getDate() + (dayNumber - 1));
  return formatLocal(d);
}

/** The plan's last calendar date. */
export function scheduledEndDate(startDate: string, totalDays: number): string {
  return dateForDay(startDate, totalDays);
}

/**
 * Which plan day (1-based) a calendar date falls on. Returns 0 before the
 * plan starts and totalDays + 1 once it's over, so callers can clamp.
 */
export function dayNumberForDate(startDate: string, date: string, totalDays: number): number {
  const ms = parseLocal(date).getTime() - parseLocal(startDate).getTime();
  const n = Math.round(ms / 86_400_000) + 1; // round: DST days aren't 24h
  if (n < 1) return 0;
  if (n > totalDays) return totalDays + 1;
  return n;
}

// ── Completion + pace ────────────────────────────────────────────────

/** Completion key: a reading is identified by its DAY as well as its ref. */
export function readingKey(dayNumber: number, book: string, chapter: number): string {
  return `${dayNumber}|${book}|${chapter}`;
}

export function totalReadings(def: ScheduledPlanDef): number {
  let t = 0;
  for (const day of def.days) t += day.length;
  return t;
}

export type ScheduledPace = {
  total: number;          // readings in the whole plan
  completed: number;      // readings checked off
  expected: number;       // readings scheduled through today (inclusive)
  pctComplete: number;    // 0..1
  todayNumber: number;    // 0 = not started, totalDays+1 = finished
  daysComplete: number;   // days with every reading checked
  status: 'not-started' | 'on-track' | 'ahead' | 'behind' | 'finished';
  /** Signed reading count vs. expected (+ahead / -behind). */
  delta: number;
};

export function scheduledPace(opts: {
  def: ScheduledPlanDef;
  startDate: string;
  today: string;               // YYYY-MM-DD
  completedKeys: Set<string>;  // readingKey()s
}): ScheduledPace {
  const { def, startDate, today, completedKeys } = opts;
  const totalDays = def.days.length;
  const todayNumber = dayNumberForDate(startDate, today, totalDays);
  const through = Math.min(todayNumber, totalDays);

  let total = 0, completed = 0, expected = 0, daysComplete = 0;
  def.days.forEach((day, i) => {
    const n = i + 1;
    total += day.length;
    let doneHere = 0;
    for (const r of day) {
      if (completedKeys.has(readingKey(n, r.book, r.chapter))) doneHere++;
    }
    completed += doneHere;
    if (day.length > 0 && doneHere === day.length) daysComplete++;
    if (n <= through) expected += day.length;
  });

  const delta = completed - expected;
  let status: ScheduledPace['status'];
  if (completed >= total && total > 0) status = 'finished';
  else if (todayNumber === 0) status = 'not-started';
  else if (delta > 0) status = 'ahead';
  else if (delta < 0) status = 'behind';
  else status = 'on-track';

  return {
    total, completed, expected, daysComplete, todayNumber, delta, status,
    pctComplete: total > 0 ? completed / total : 0,
  };
}
