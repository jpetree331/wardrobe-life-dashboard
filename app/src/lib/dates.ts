/**
 * Tiny shared date utilities. The whole reason this file exists: every
 * caller that wants "today's date as YYYY-MM-DD" was previously using
 *   new Date().toISOString().slice(0, 10)
 * which returns the date in UTC, not the user's timezone. That's wrong by
 * one day for users west of UTC who create entries late in the evening —
 * an 8 PM EDT entry shows up dated tomorrow in UTC because UTC has already
 * ticked past midnight.
 *
 * Both `entry_date` columns (sanctuary + timeline) are calendar dates with
 * no time component, and the Postgres `date` type is timezone-naive. The
 * intuitive meaning — "the date the user is typing on, in their local
 * calendar" — is exactly what `localToday` returns.
 */

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
