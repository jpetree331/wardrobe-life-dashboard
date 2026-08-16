// Fiction-log aggregation — PURE. Rolls up fiction_log rows (a row =
// one novel-work session; a bare row still counts the day) into the
// day map, streaks, and summary the Writing tab's fiction section
// renders. No React, no Supabase.

export type FictionLogLike = {
  entry_date: string;   // YYYY-MM-DD
  minutes: number;
  words: number;
};

export type FictionDay = {
  sessions: number;
  minutes: number;
  words: number;
};

/** Roll sessions up by date: count them, sum minutes and words. */
export function fictionByDate(rows: FictionLogLike[]): Map<string, FictionDay> {
  const out = new Map<string, FictionDay>();
  for (const r of rows) {
    const prev = out.get(r.entry_date);
    if (prev) {
      prev.sessions += 1;
      prev.minutes += r.minutes;
      prev.words += r.words;
    } else {
      out.set(r.entry_date, { sessions: 1, minutes: r.minutes, words: r.words });
    }
  }
  return out;
}

/** Local YYYY-MM-DD for a Date (no UTC drift). */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The date one day before an ISO date, as ISO (calendar-safe). */
function dayBefore(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return iso(dt);
}

/**
 * Current streak: consecutive logged days ending at `today` — or at
 * yesterday, so the chain doesn't read as broken before today's session
 * has happened. 0 when the last logged day is older than yesterday.
 */
export function currentStreak(dates: Set<string>, today: Date): number {
  const todayIso = iso(today);
  let cursor = dates.has(todayIso) ? todayIso : dayBefore(todayIso);
  if (!dates.has(cursor)) return 0;
  let n = 0;
  while (dates.has(cursor)) {
    n += 1;
    cursor = dayBefore(cursor);
  }
  return n;
}

/** Longest run of consecutive logged days, ever. */
export function longestStreak(dates: Set<string>): number {
  let best = 0;
  for (const d of dates) {
    // Only count from the start of each run.
    if (dates.has(dayBefore(d))) continue;
    let n = 0;
    let cursor = d;
    while (dates.has(cursor)) {
      n += 1;
      const [y, m, day] = cursor.split('-').map(Number);
      const dt = new Date(y, m - 1, day);
      dt.setDate(dt.getDate() + 1);
      cursor = iso(dt);
    }
    if (n > best) best = n;
  }
  return best;
}

export type FictionSummary = {
  daysThisYear: number;
  minutesThisYear: number;
  wordsThisYear: number;
  daysAllTime: number;
  currentStreak: number;
  longestStreak: number;
};

export function fictionSummary(rows: FictionLogLike[], year: number, today: Date): FictionSummary {
  const byDate = fictionByDate(rows);
  const dates = new Set(byDate.keys());
  let daysThisYear = 0, minutesThisYear = 0, wordsThisYear = 0;
  const prefix = `${year}-`;
  for (const [d, day] of byDate) {
    if (d.startsWith(prefix)) {
      daysThisYear += 1;
      minutesThisYear += day.minutes;
      wordsThisYear += day.words;
    }
  }
  return {
    daysThisYear,
    minutesThisYear,
    wordsThisYear,
    daysAllTime: dates.size,
    currentStreak: currentStreak(dates, today),
    longestStreak: longestStreak(dates),
  };
}
