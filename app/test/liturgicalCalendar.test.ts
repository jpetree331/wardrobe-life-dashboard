import { describe, it, expect } from 'vitest';
import {
  computeEaster,
  firstSundayOfAdvent,
  liturgicalLabel,
} from '../src/lib/liturgicalCalendar';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('computeEaster', () => {
  // Hand-checked Easter dates from the standard Western reckoning.
  const known: Array<[number, string]> = [
    [2020, '2020-04-12'],
    [2021, '2021-04-04'],
    [2022, '2022-04-17'],
    [2023, '2023-04-09'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2030, '2030-04-21'],
  ];
  for (const [year, expected] of known) {
    it(`Easter ${year} = ${expected}`, () => {
      expect(ymd(computeEaster(year))).toBe(expected);
    });
  }
});

describe('firstSundayOfAdvent', () => {
  // Advent 1 is the Sunday closest to Nov 30; varies year to year.
  const known: Array<[number, string]> = [
    [2024, '2024-12-01'],
    [2025, '2025-11-30'],
    [2026, '2026-11-29'],
    [2027, '2027-11-28'],
    [2028, '2028-12-03'],
  ];
  for (const [year, expected] of known) {
    it(`Advent 1 ${year} = ${expected}`, () => {
      expect(ymd(firstSundayOfAdvent(year))).toBe(expected);
    });
  }
});

describe('liturgicalLabel', () => {
  it('returns null in Ordinary Time (mid-summer, no feast nearby)', () => {
    expect(liturgicalLabel(new Date(2026, 6, 14))).toBeNull(); // July 14
  });

  it('names Christmas Eve and Christmas Day specifically', () => {
    expect(liturgicalLabel(new Date(2026, 11, 24))).toBe('Christmas Eve');
    expect(liturgicalLabel(new Date(2026, 11, 25))).toBe('Christmas Day');
  });

  it('returns "Christmastide" for Dec 26 → Jan 5', () => {
    expect(liturgicalLabel(new Date(2026, 11, 26))).toBe('Christmastide');
    expect(liturgicalLabel(new Date(2026, 11, 31))).toBe('Christmastide');
    expect(liturgicalLabel(new Date(2027, 0, 1))).toBe('Christmastide');
    expect(liturgicalLabel(new Date(2027, 0, 5))).toBe('Christmastide');
  });

  it('names Epiphany and exits Christmastide on Jan 6', () => {
    expect(liturgicalLabel(new Date(2027, 0, 6))).toBe('Epiphany');
  });

  it('Easter season — feast days override season label', () => {
    // Easter 2026 = April 5 (verified above).
    expect(liturgicalLabel(new Date(2026, 3, 5))).toBe('Easter Sunday');
    // Day before = Holy Saturday (named); two days before = Good Friday.
    expect(liturgicalLabel(new Date(2026, 3, 4))).toBe('Holy Saturday');
    expect(liturgicalLabel(new Date(2026, 3, 3))).toBe('Good Friday');
    // Sunday before = Palm Sunday.
    expect(liturgicalLabel(new Date(2026, 2, 29))).toBe('Palm Sunday');
    // Mid-week between Palm Sunday and Easter = Holy Week.
    expect(liturgicalLabel(new Date(2026, 2, 31))).toBe('Holy Week');
    // Day after Easter = Eastertide (specific name has passed).
    expect(liturgicalLabel(new Date(2026, 3, 6))).toBe('Eastertide');
  });

  it('Lent runs Ash Wednesday → Holy Week (with Holy Week named separately)', () => {
    // Easter 2026 = April 5. Ash Wednesday = April 5 - 46 = February 18.
    expect(liturgicalLabel(new Date(2026, 1, 18))).toBe('Ash Wednesday');
    // Day after Ash Wednesday is plain Lent.
    expect(liturgicalLabel(new Date(2026, 1, 19))).toBe('Lent');
    // Day before Palm Sunday is Lent.
    expect(liturgicalLabel(new Date(2026, 2, 28))).toBe('Lent');
  });

  it('names Pentecost and exits Eastertide the next day', () => {
    // Easter 2026 = April 5; Pentecost = April 5 + 49 = May 24.
    expect(liturgicalLabel(new Date(2026, 4, 24))).toBe('Pentecost');
    // Pentecost itself is a specific feast — no "Eastertide" label that day.
    expect(liturgicalLabel(new Date(2026, 4, 23))).toBe('Eastertide');
    expect(liturgicalLabel(new Date(2026, 4, 25))).toBeNull(); // Ordinary Time
  });

  it('returns "Advent" between Advent 1 and Christmas Eve', () => {
    // 2026 Advent 1 = Nov 29 (verified above).
    expect(liturgicalLabel(new Date(2026, 10, 29))).toBe('Advent');
    expect(liturgicalLabel(new Date(2026, 11, 23))).toBe('Advent');
    // Christmas Eve has its own name.
    expect(liturgicalLabel(new Date(2026, 11, 24))).toBe('Christmas Eve');
  });

  it('returns null just BEFORE Advent (the Saturday before Advent 1)', () => {
    expect(liturgicalLabel(new Date(2026, 10, 28))).toBeNull();
  });

  it('All Saints (Nov 1) is named even though Ordinary Time surrounds it', () => {
    expect(liturgicalLabel(new Date(2026, 10, 1))).toBe('All Saints');
    // Day before / day after fall back to null (Ordinary Time).
    expect(liturgicalLabel(new Date(2026, 9, 31))).toBeNull();
    expect(liturgicalLabel(new Date(2026, 10, 2))).toBeNull();
  });
});
