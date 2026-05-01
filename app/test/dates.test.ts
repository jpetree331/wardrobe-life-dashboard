import { describe, it, expect } from 'vitest';
import { localToday } from '../src/lib/dates';

describe('localToday', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the *local* date for a Date argument, not UTC', () => {
    // A Date constructed from local components must round-trip to the
    // same calendar day — the whole purpose of this helper. If the
    // implementation accidentally used toISOString(), this would
    // disagree with `getFullYear/getMonth/getDate` for users west of UTC
    // anywhere from local-evening through local-midnight.
    const d = new Date(2026, 3, 29, 20, 30, 0); // April 29, 8:30 PM local
    expect(localToday(d)).toBe('2026-04-29');
  });

  it('zero-pads single-digit months and days', () => {
    expect(localToday(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localToday(new Date(2026, 8, 9))).toBe('2026-09-09');
  });

  it('handles year boundaries cleanly', () => {
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(localToday(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
  });
});
