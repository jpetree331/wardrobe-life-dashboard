import { describe, it, expect } from 'vitest';
import {
  currentStreak,
  fictionByDate,
  fictionSummary,
  longestStreak,
  type FictionLogLike,
} from '../src/lib/fictionLog';

const row = (entry_date: string, minutes = 0, words = 0): FictionLogLike => ({ entry_date, minutes, words });

describe('fictionLog', () => {
  it('fictionByDate sums sessions, minutes, and words per date', () => {
    const m = fictionByDate([row('2026-08-01', 30, 200), row('2026-08-01', 15, 0), row('2026-08-03')]);
    expect(m.get('2026-08-01')).toEqual({ sessions: 2, minutes: 45, words: 200 });
    expect(m.get('2026-08-03')).toEqual({ sessions: 1, minutes: 0, words: 0 });
    expect(m.size).toBe(2);
  });

  it('currentStreak counts back from today', () => {
    const dates = new Set(['2026-08-14', '2026-08-15', '2026-08-16']);
    expect(currentStreak(dates, new Date(2026, 7, 16))).toBe(3);
  });

  it("currentStreak survives 'today not yet logged' by anchoring at yesterday", () => {
    const dates = new Set(['2026-08-14', '2026-08-15']);
    expect(currentStreak(dates, new Date(2026, 7, 16))).toBe(2);
  });

  it('currentStreak is 0 when the last log is older than yesterday', () => {
    const dates = new Set(['2026-08-10', '2026-08-11']);
    expect(currentStreak(dates, new Date(2026, 7, 16))).toBe(0);
  });

  it('streaks cross month boundaries', () => {
    const dates = new Set(['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']);
    expect(currentStreak(dates, new Date(2026, 7, 2))).toBe(4);
    expect(longestStreak(dates)).toBe(4);
  });

  it('longestStreak finds the best historical run, not just the latest', () => {
    const dates = new Set([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
      '2026-03-10', '2026-03-11',
    ]);
    expect(longestStreak(dates)).toBe(5);
  });

  it('longestStreak of empty set is 0; single day is 1', () => {
    expect(longestStreak(new Set())).toBe(0);
    expect(longestStreak(new Set(['2026-05-05']))).toBe(1);
  });

  it('fictionSummary splits this-year from all-time and carries streaks', () => {
    const rows = [
      row('2025-12-31', 60, 500),
      row('2026-01-01', 30, 100),
      row('2026-01-02', 0, 0),
      row('2026-08-15', 45, 250),
      row('2026-08-16', 20, 0),
    ];
    const s = fictionSummary(rows, 2026, new Date(2026, 7, 16));
    expect(s.daysThisYear).toBe(4);
    expect(s.minutesThisYear).toBe(95);
    expect(s.wordsThisYear).toBe(350);
    expect(s.daysAllTime).toBe(5);
    expect(s.currentStreak).toBe(2);           // Aug 15 + Aug 16
    expect(s.longestStreak).toBe(3);           // Dec 31 → Jan 2
  });
});
