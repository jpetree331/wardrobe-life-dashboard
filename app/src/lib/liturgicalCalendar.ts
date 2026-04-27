// Western Christian liturgical calendar — just enough to label the Sanctuary
// ribbon with the season or feast a date falls in. Returns null in Ordinary
// Time so the ribbon stays quiet when nothing's actively in season.
//
// Pure functions; trivial to unit-test. No timezone math beyond what the
// caller passes in.

/**
 * Compute Easter Sunday for the given Gregorian year using Meeus's algorithm
 * (a.k.a. the "Anonymous Gregorian Computus"). Standard, well-tested
 * formula — known to produce correct dates for any year past 1583.
 */
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  const month = Math.floor(n / 31);    // 3 = March, 4 = April
  const day = (n % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * The First Sunday of Advent — the Sunday closest to St. Andrew's Day
 * (November 30). Falls between November 27 and December 3 inclusive.
 */
export function firstSundayOfAdvent(year: number): Date {
  const nov30 = new Date(year, 10, 30);
  const dow = nov30.getDay();
  // 0..3 → previous Sunday is closer; 4..6 → next Sunday is closer.
  const offset = dow <= 3 ? -dow : 7 - dow;
  return addDays(nov30, offset);
}

/**
 * Return a single label for the given date — but only for *named days*,
 * not for the multi-week seasons that surround them. The season variants
 * (Lent, Advent, Eastertide, Christmastide, Holy Week) used to be
 * returned here too, but a single label persisting on the ribbon for
 * 40+ days at a stretch wears out its welcome; the season's start day
 * is already a feast (Ash Wednesday, First Sunday of Advent, Easter
 * Sunday, etc.) so the bracketing days are still marked.
 *
 * Returns null on every other day, so the caller can suppress whatever
 * ribbon decoration depends on it.
 */
export function liturgicalLabel(date: Date): string | null {
  const year = date.getFullYear();
  const easter = computeEaster(year);
  const ashWed = addDays(easter, -46);
  const palmSun = addDays(easter, -7);
  const goodFri = addDays(easter, -2);
  const holySat = addDays(easter, -1);
  const ascension = addDays(easter, 39);
  const pentecost = addDays(easter, 49);
  const christmas = new Date(year, 11, 25);
  const christmasEve = new Date(year, 11, 24);
  const epiphany = new Date(year, 0, 6);
  const allSaints = new Date(year, 10, 1);
  const advent1 = firstSundayOfAdvent(year);

  if (sameDay(date, christmas))    return 'Christmas Day';
  if (sameDay(date, christmasEve)) return 'Christmas Eve';
  if (sameDay(date, epiphany))     return 'Epiphany';
  if (sameDay(date, allSaints))    return 'All Saints';
  if (sameDay(date, advent1))      return 'First Sunday of Advent';
  if (sameDay(date, ashWed))       return 'Ash Wednesday';
  if (sameDay(date, palmSun))      return 'Palm Sunday';
  if (sameDay(date, goodFri))      return 'Good Friday';
  if (sameDay(date, holySat))      return 'Holy Saturday';
  if (sameDay(date, easter))       return 'Easter Sunday';
  if (sameDay(date, ascension))    return 'Ascension';
  if (sameDay(date, pentecost))    return 'Pentecost';

  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
