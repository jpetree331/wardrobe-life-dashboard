// Pure aggregation helpers for the Stillness tab in the Data room.
//
// Sanctuary entries carry two practice fields (migration 0008):
//   - listening_prayer: boolean
//   - stillness_sessions: array of { start, end, minutes }
//
// Everything here is a pure function over a small `{ entry_date,
// listening_prayer, stillness_sessions }` shape — no React, no Supabase
// — so the day-rollups, bucketing, and summary math are all unit
// testable in isolation. The Stillness view computes cell colors from
// the bucket + listening-prayer flag; that color logic lives in the
// component (it's presentation), but the numbers come from here.

export type StillnessSession = {
  start: string | null;   // "HH:MM" local clock, or null for duration-only
  end: string | null;
  minutes: number;        // always present — computed from start/end or typed
};

export type PracticeEntryLike = {
  entry_date: string;            // YYYY-MM-DD
  listening_prayer: boolean;
  stillness_sessions: StillnessSession[];
};

// ── Session minutes ──────────────────────────────────────────────────

/**
 * Minutes between two "HH:MM" local clock strings. Returns 0 if either
 * is missing or malformed. If end is at or before start we assume a
 * same-day slip and return 0 (stillness sittings don't cross midnight;
 * the editor surfaces this as a validation hint rather than guessing).
 */
export function sessionMinutesFromClock(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) return 0;
  const diff = e - s;
  return diff > 0 ? diff : 0;
}

function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Sum of minutes across a day's sessions. Negative/NaN minutes ignored. */
export function totalStillnessMinutes(sessions: StillnessSession[]): number {
  let total = 0;
  for (const s of sessions || []) {
    const m = Number(s.minutes);
    if (Number.isFinite(m) && m > 0) total += m;
  }
  return total;
}

// ── Stillness depth bucket ───────────────────────────────────────────

/**
 * Bucket daily stillness minutes into a 0–8 depth step. Step boundaries
 * are every 15 minutes, capped at 120 (so ≥120 min and exactly 120 both
 * land on the deepest step 8). Step 0 = no stillness.
 *
 *    1–15   → 1
 *   16–30   → 2
 *   31–45   → 3
 *   46–60   → 4
 *   61–75   → 5
 *   76–90   → 6
 *   91–105  → 7
 *   106+    → 8   (capped)
 */
export const STILLNESS_MAX_STEP = 8;

export function bucketStillness(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const step = Math.ceil(minutes / 15);
  return Math.min(STILLNESS_MAX_STEP, step);
}

// ── Per-date rollup ──────────────────────────────────────────────────

export type DayPractice = {
  date: string;              // YYYY-MM-DD
  stillnessMin: number;      // summed across all entries + sessions that day
  listeningPrayer: boolean;  // OR across all entries that day
  sessionCount: number;
};

/**
 * Roll entries up by entry_date: sum stillness minutes, OR listening
 * prayer, count sessions. Two entries on the same day combine — minutes
 * add, listening-prayer is true if either entry had it.
 */
export function practiceByDate(entries: PracticeEntryLike[]): Map<string, DayPractice> {
  const m = new Map<string, DayPractice>();
  for (const e of entries) {
    const sessions = e.stillness_sessions || [];
    const min = totalStillnessMinutes(sessions);
    const lp = !!e.listening_prayer;
    const prev = m.get(e.entry_date);
    if (prev) {
      prev.stillnessMin += min;
      prev.listeningPrayer = prev.listeningPrayer || lp;
      prev.sessionCount += sessions.length;
    } else {
      m.set(e.entry_date, {
        date: e.entry_date,
        stillnessMin: min,
        listeningPrayer: lp,
        sessionCount: sessions.length,
      });
    }
  }
  return m;
}

/** Per-date map of just stillness minutes (for the heatmap byDate input). */
export function stillnessMinutesByDate(entries: PracticeEntryLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [date, p] of practiceByDate(entries)) {
    if (p.stillnessMin > 0) out.set(date, p.stillnessMin);
  }
  return out;
}

/** Set of dates that had listening prayer. */
export function listeningPrayerDates(entries: PracticeEntryLike[]): Set<string> {
  const out = new Set<string>();
  for (const [date, p] of practiceByDate(entries)) {
    if (p.listeningPrayer) out.add(date);
  }
  return out;
}

// ── Monthly rollup (bar chart) ───────────────────────────────────────

/**
 * Per-month stillness minutes for a year: 12 numbers (Jan..Dec). Entries
 * outside the year are ignored.
 */
export function monthlyStillnessMinutes(entries: PracticeEntryLike[], year: number): number[] {
  const out = new Array<number>(12).fill(0);
  const prefix = `${year}-`;
  for (const e of entries) {
    if (!e.entry_date.startsWith(prefix)) continue;
    const monthIdx = parseInt(e.entry_date.slice(5, 7), 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) continue;
    out[monthIdx] += totalStillnessMinutes(e.stillness_sessions || []);
  }
  return out;
}

// ── Headline summary ─────────────────────────────────────────────────

export type PracticeSummary = {
  totalStillnessMin: number;       // all-time
  stillnessDays: number;           // distinct days with any stillness
  listeningPrayerDays: number;     // distinct days with listening prayer
  longestSessionMin: number;       // single longest sitting
  avgSessionMin: number;           // mean over sessions that have minutes>0
  thisYearStillnessMin: number;
  thisYearStillnessDays: number;
};

export function practiceSummary(entries: PracticeEntryLike[], year: number): PracticeSummary {
  let totalStillnessMin = 0;
  let longestSessionMin = 0;
  let sessionTotal = 0;
  let sessionCount = 0;
  let thisYearStillnessMin = 0;
  const stillnessDaySet = new Set<string>();
  const lpDaySet = new Set<string>();
  const thisYearStillnessDaySet = new Set<string>();
  const prefix = `${year}-`;

  for (const e of entries) {
    const sessions = e.stillness_sessions || [];
    let dayMin = 0;
    for (const s of sessions) {
      const m = Number(s.minutes);
      if (!Number.isFinite(m) || m <= 0) continue;
      dayMin += m;
      sessionTotal += m;
      sessionCount += 1;
      if (m > longestSessionMin) longestSessionMin = m;
    }
    if (dayMin > 0) {
      totalStillnessMin += dayMin;
      stillnessDaySet.add(e.entry_date);
      if (e.entry_date.startsWith(prefix)) {
        thisYearStillnessMin += dayMin;
        thisYearStillnessDaySet.add(e.entry_date);
      }
    }
    if (e.listening_prayer) lpDaySet.add(e.entry_date);
  }

  return {
    totalStillnessMin,
    stillnessDays: stillnessDaySet.size,
    listeningPrayerDays: lpDaySet.size,
    longestSessionMin,
    avgSessionMin: sessionCount > 0 ? Math.round(sessionTotal / sessionCount) : 0,
    thisYearStillnessMin,
    thisYearStillnessDays: thisYearStillnessDaySet.size,
  };
}

// ── Formatting helper (shared by inspector + data tab) ───────────────

/** "1h 30m" / "45m" / "0m" from a minute count. */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
