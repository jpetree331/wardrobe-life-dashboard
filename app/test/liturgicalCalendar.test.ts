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
  it('returns null on most days (no season-spanning labels)', () => {
    expect(liturgicalLabel(new Date(2026, 6, 14))).toBeNull(); // ordinary July
    // Today the user reported (April 27, 2026): Easter is past, Pentecost is
    // weeks away. The previous version returned 'Eastertide' here for 50+
    // days; now it returns null so the ribbon stays quiet.
    expect(liturgicalLabel(new Date(2026, 3, 27))).toBeNull();
  });

  it('names Christmas Eve and Christmas Day specifically', () => {
    expect(liturgicalLabel(new Date(2026, 11, 24))).toBe('Christmas Eve');
    expect(liturgicalLabel(new Date(2026, 11, 25))).toBe('Christmas Day');
  });

  it('does NOT label Christmastide / Eastertide / Advent / Lent / Holy Week', () => {
    expect(liturgicalLabel(new Date(2026, 11, 26))).toBeNull(); // 2nd day of Christmas
    expect(liturgicalLabel(new Date(2027, 0, 1))).toBeNull(); // New Year's Day
    expect(liturgicalLabel(new Date(2026, 1, 19))).toBeNull(); // day after Ash Wed
    expect(liturgicalLabel(new Date(2026, 2, 31))).toBeNull(); // Holy Week middle day
    expect(liturgicalLabel(new Date(2026, 3, 6))).toBeNull(); // day after Easter
    expect(liturgicalLabel(new Date(2026, 11, 23))).toBeNull(); // Advent middle
  });

  it('names Epiphany on January 6', () => {
    expect(liturgicalLabel(new Date(2027, 0, 6))).toBe('Epiphany');
  });

  it('names every Easter Triduum day', () => {
    // Easter 2026 = April 5 (verified above).
    expect(liturgicalLabel(new Date(2026, 3, 5))).toBe('Easter Sunday');
    expect(liturgicalLabel(new Date(2026, 3, 4))).toBe('Holy Saturday');
    expect(liturgicalLabel(new Date(2026, 3, 3))).toBe('Good Friday');
    expect(liturgicalLabel(new Date(2026, 2, 29))).toBe('Palm Sunday');
  });

  it('names Ash Wednesday', () => {
    // Easter 2026 = April 5. Ash Wednesday = April 5 - 46 = February 18.
    expect(liturgicalLabel(new Date(2026, 1, 18))).toBe('Ash Wednesday');
  });

  it('names Pentecost', () => {
    // Easter 2026 = April 5; Pentecost = April 5 + 49 = May 24.
    expect(liturgicalLabel(new Date(2026, 4, 24))).toBe('Pentecost');
    expect(liturgicalLabel(new Date(2026, 4, 25))).toBeNull(); // back to silent
  });

  it('names the First Sunday of Advent', () => {
    // 2026 Advent 1 = Nov 29 (verified above).
    expect(liturgicalLabel(new Date(2026, 10, 29))).toBe('First Sunday of Advent');
  });

  it('All Saints (Nov 1) is named even though Ordinary Time surrounds it', () => {
    expect(liturgicalLabel(new Date(2026, 10, 1))).toBe('All Saints');
    expect(liturgicalLabel(new Date(2026, 9, 31))).toBeNull();
    expect(liturgicalLabel(new Date(2026, 10, 2))).toBeNull();
  });
});
