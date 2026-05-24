// Pure helpers for expanding recurring Daybook blocks into instances.
//
// Each "master" block lives once in the database with a `recur` field
// ('none' | 'daily' | 'weekdays' | 'weekly'). When the user views a date
// range, we walk the range day-by-day and synthesize "phantom" instances
// for any master whose pattern projects onto that day. The master's own
// date is excluded — it appears as itself via the normal listBlocksForRange
// query. Phantoms inherit everything from their master except start_at /
// end_at, which slide to the same time-of-day on the projection date.
//
// Editing a phantom in Build 3 routes to the master, so all occurrences
// move/change together. Per-occurrence overrides are a future enhancement.
//
// Calendar arithmetic only — no millisecond math across dates, so this is
// DST-immune (same lesson as the Data-room heatmap and the Daybook plan
// pace status from earlier rooms).

export type DaybookRecurMaster = {
  id: string;
  start_at: string;          // ISO 8601 UTC
  end_at: string;
  recur: 'none' | 'daily' | 'weekdays' | 'weekly';
};

export type DaybookRecurInstance = {
  master_id: string;
  start_at: string;          // ISO 8601 UTC
  end_at: string;
};

/**
 * Walk [rangeStartIso, rangeEndIso) day by day and emit phantom instances
 * for any recurring master that projects onto that day.
 *
 * The master's own occurrence is NOT included (it's already in the regular
 * listBlocksForRange result if its start_at falls in range; including it
 * here would double-count). So this returns ONLY the phantoms.
 */
export function expandRecurringInstances(
  masters: DaybookRecurMaster[],
  rangeStartIso: string,
  rangeEndIso: string,
): DaybookRecurInstance[] {
  const out: DaybookRecurInstance[] = [];
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);

  for (const m of masters) {
    if (m.recur === 'none') continue;
    const masterStart = new Date(m.start_at);
    const masterEnd = new Date(m.end_at);
    const durationMs = masterEnd.getTime() - masterStart.getTime();
    if (durationMs <= 0) continue;

    // Walk a per-day cursor from rangeStart through rangeEnd-1. For each
    // day, build the instance start by combining the cursor's date with
    // the master's time-of-day, and emit if the pattern matches.
    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);

    while (cursor < rangeEnd) {
      const instanceStart = new Date(cursor);
      instanceStart.setHours(
        masterStart.getHours(),
        masterStart.getMinutes(),
        masterStart.getSeconds(),
        masterStart.getMilliseconds(),
      );

      const sameAsMaster = sameLocalDate(instanceStart, masterStart);
      const beforeMaster = instanceStart < masterStart && !sameAsMaster;

      if (
        !sameAsMaster &&
        !beforeMaster &&
        instanceStart >= rangeStart &&
        instanceStart < rangeEnd &&
        matchesPattern(instanceStart, masterStart, m.recur)
      ) {
        const phantomEnd = new Date(instanceStart.getTime() + durationMs);
        out.push({
          master_id: m.id,
          start_at: instanceStart.toISOString(),
          end_at: phantomEnd.toISOString(),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return out;
}

/**
 * Does `date` match the master's recurrence pattern?
 *   - daily: every day after master
 *   - weekdays: Mon-Fri only
 *   - weekly: same day-of-week as master
 */
function matchesPattern(
  date: Date,
  masterStart: Date,
  pattern: DaybookRecurMaster['recur'],
): boolean {
  switch (pattern) {
    case 'daily':
      return true;
    case 'weekdays': {
      const dow = date.getDay();
      return dow >= 1 && dow <= 5;
    }
    case 'weekly':
      return date.getDay() === masterStart.getDay();
    default:
      return false;
  }
}

/** Two dates fall on the same local calendar day. */
function sameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
