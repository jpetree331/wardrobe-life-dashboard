import { describe, it, expect } from 'vitest';
import {
  bucketStillness,
  formatMinutes,
  listeningPrayerDates,
  monthlyStillnessMinutes,
  practiceByDate,
  practiceSummary,
  sessionMinutesFromClock,
  stillnessMinutesByDate,
  totalStillnessMinutes,
  type PracticeEntryLike,
  type StillnessSession,
} from '../src/lib/sanctuaryPractice';

function S(start: string | null, end: string | null, minutes: number): StillnessSession {
  return { start, end, minutes };
}

function E(
  date: string,
  listening_prayer: boolean,
  sessions: StillnessSession[],
): PracticeEntryLike {
  return { entry_date: date, listening_prayer, stillness_sessions: sessions };
}

describe('sessionMinutesFromClock', () => {
  it('computes minutes between two times', () => {
    expect(sessionMinutesFromClock('07:15', '07:45')).toBe(30);
    expect(sessionMinutesFromClock('06:00', '07:30')).toBe(90);
  });

  it('returns 0 when either side is missing', () => {
    expect(sessionMinutesFromClock(null, '07:45')).toBe(0);
    expect(sessionMinutesFromClock('07:15', null)).toBe(0);
    expect(sessionMinutesFromClock(null, null)).toBe(0);
  });

  it('returns 0 for end <= start (no midnight guessing)', () => {
    expect(sessionMinutesFromClock('07:45', '07:15')).toBe(0);
    expect(sessionMinutesFromClock('07:00', '07:00')).toBe(0);
  });

  it('returns 0 for malformed input', () => {
    expect(sessionMinutesFromClock('7am', '8am')).toBe(0);
    expect(sessionMinutesFromClock('25:00', '26:00')).toBe(0);
  });
});

describe('totalStillnessMinutes', () => {
  it('sums valid sessions and ignores junk', () => {
    expect(totalStillnessMinutes([S('7:00', '7:30', 30), S(null, null, 15)])).toBe(45);
    expect(totalStillnessMinutes([S(null, null, -5), S(null, null, 0), S(null, null, 20)])).toBe(20);
    expect(totalStillnessMinutes([])).toBe(0);
  });
});

describe('bucketStillness', () => {
  it('returns 0 for no stillness', () => {
    expect(bucketStillness(0)).toBe(0);
    expect(bucketStillness(-10)).toBe(0);
  });

  it('steps every 15 minutes', () => {
    expect(bucketStillness(1)).toBe(1);
    expect(bucketStillness(15)).toBe(1);
    expect(bucketStillness(16)).toBe(2);
    expect(bucketStillness(30)).toBe(2);
    expect(bucketStillness(45)).toBe(3);
    expect(bucketStillness(60)).toBe(4);
    expect(bucketStillness(75)).toBe(5);
    expect(bucketStillness(90)).toBe(6);
    expect(bucketStillness(105)).toBe(7);
  });

  it('caps at step 8 for 106+ minutes', () => {
    expect(bucketStillness(106)).toBe(8);
    expect(bucketStillness(120)).toBe(8);
    expect(bucketStillness(300)).toBe(8);
  });
});

describe('practiceByDate', () => {
  it('sums minutes and ORs listening prayer across same-day entries', () => {
    const m = practiceByDate([
      E('2026-01-01', true, [S('7:00', '7:30', 30)]),
      E('2026-01-01', false, [S('20:00', '20:15', 15)]),
      E('2026-01-02', false, []),
    ]);
    expect(m.get('2026-01-01')).toEqual({
      date: '2026-01-01', stillnessMin: 45, listeningPrayer: true, sessionCount: 2,
    });
    expect(m.get('2026-01-02')).toEqual({
      date: '2026-01-02', stillnessMin: 0, listeningPrayer: false, sessionCount: 0,
    });
  });

  it('listening prayer is true if any entry that day had it', () => {
    const m = practiceByDate([
      E('2026-03-10', false, []),
      E('2026-03-10', true, []),
    ]);
    expect(m.get('2026-03-10')!.listeningPrayer).toBe(true);
  });
});

describe('stillnessMinutesByDate / listeningPrayerDates', () => {
  const entries = [
    E('2026-01-01', true, [S('7:00', '7:30', 30)]),
    E('2026-01-02', true, []),                            // LP only, no stillness
    E('2026-01-03', false, [S(null, null, 20)]),          // stillness only
  ];

  it('byDate only includes days with stillness > 0', () => {
    const m = stillnessMinutesByDate(entries);
    expect(m.get('2026-01-01')).toBe(30);
    expect(m.has('2026-01-02')).toBe(false);   // LP-only day excluded
    expect(m.get('2026-01-03')).toBe(20);
  });

  it('listeningPrayerDates collects only LP days', () => {
    const s = listeningPrayerDates(entries);
    expect(s.has('2026-01-01')).toBe(true);
    expect(s.has('2026-01-02')).toBe(true);
    expect(s.has('2026-01-03')).toBe(false);
  });
});

describe('monthlyStillnessMinutes', () => {
  it('rolls up per month within the year', () => {
    const entries = [
      E('2026-01-05', false, [S(null, null, 30)]),
      E('2026-01-20', false, [S(null, null, 15)]),
      E('2026-02-01', true, [S(null, null, 60)]),
      E('2025-12-31', false, [S(null, null, 999)]),   // prior year ignored
    ];
    const m = monthlyStillnessMinutes(entries, 2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe(45);    // Jan
    expect(m[1]).toBe(60);    // Feb
    expect(m.slice(2).every((n) => n === 0)).toBe(true);
  });
});

describe('practiceSummary', () => {
  const entries = [
    E('2026-01-01', true,  [S('7:00', '7:30', 30), S('20:00', '20:20', 20)]), // 50 min, 2 sessions
    E('2026-01-05', false, [S('6:00', '7:30', 90)]),                          // 90 min
    E('2025-12-30', true,  [S(null, null, 10)]),                              // prior year, LP
    E('2026-02-02', true,  []),                                               // LP only
  ];

  it('computes all-time totals and per-session stats', () => {
    const s = practiceSummary(entries, 2026);
    expect(s.totalStillnessMin).toBe(150);          // 50 + 90 + 10
    expect(s.stillnessDays).toBe(3);                // Jan 1, Jan 5, Dec 30
    expect(s.listeningPrayerDays).toBe(3);          // Jan 1, Dec 30, Feb 2
    expect(s.longestSessionMin).toBe(90);
    // sessions with minutes>0: 30,20,90,10 → mean 37.5 → round 38
    expect(s.avgSessionMin).toBe(38);
  });

  it('separates this-year from all-time', () => {
    const s = practiceSummary(entries, 2026);
    expect(s.thisYearStillnessMin).toBe(140);       // 50 + 90 (Dec 30 excluded)
    expect(s.thisYearStillnessDays).toBe(2);
  });

  it('zero entries → all zeros', () => {
    const s = practiceSummary([], 2026);
    expect(s.totalStillnessMin).toBe(0);
    expect(s.stillnessDays).toBe(0);
    expect(s.listeningPrayerDays).toBe(0);
    expect(s.longestSessionMin).toBe(0);
    expect(s.avgSessionMin).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('formats hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(125)).toBe('2h 5m');
  });
});
