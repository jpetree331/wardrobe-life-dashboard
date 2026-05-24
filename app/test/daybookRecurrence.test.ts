import { describe, it, expect } from 'vitest';
import {
  expandRecurringInstances,
  type DaybookRecurMaster,
} from '../src/lib/daybookRecurrence';

// Build an ISO timestamp for a specific local date + HH:MM. The recurrence
// helper compares dates in local time (matches what the user sees), so
// tests use local time as well.
function localIso(y: number, m: number, d: number, h: number, min: number): string {
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return date.toISOString();
}

const M = (
  id: string,
  start: string,
  end: string,
  recur: DaybookRecurMaster['recur'],
): DaybookRecurMaster => ({ id, start_at: start, end_at: end, recur });

describe('expandRecurringInstances', () => {
  it('daily pattern emits phantoms for every day after the master', () => {
    // Master: 2026-05-24 (Sunday) 9:00-10:00 AM, daily
    const master = M(
      'm1',
      localIso(2026, 5, 24, 9, 0),
      localIso(2026, 5, 24, 10, 0),
      'daily',
    );
    // Range: 2026-05-24 through 2026-05-31 (1 week, exclusive end)
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 5, 31, 0, 0),
    );
    // Expect 6 phantoms (Mon May 25 through Sat May 30; master's own day
    // is excluded). 7th would be Sun May 31 but range end is exclusive.
    expect(phantoms).toHaveLength(6);
    // Each phantom inherits the same time-of-day:
    for (const p of phantoms) {
      const d = new Date(p.start_at);
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(0);
    }
  });

  it('weekly pattern emits one phantom per week on the same DOW', () => {
    // Master: 2026-05-24 (Sunday) 7:30 AM, weekly
    const master = M(
      'm-wk',
      localIso(2026, 5, 24, 7, 30),
      localIso(2026, 5, 24, 8, 30),
      'weekly',
    );
    // Range: 4 weeks (24 days), exclusive end at day 25.
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 6, 17, 0, 0),
    );
    // Expect phantoms on May 31, Jun 7, Jun 14 = 3 phantoms.
    expect(phantoms).toHaveLength(3);
    for (const p of phantoms) {
      const d = new Date(p.start_at);
      expect(d.getDay()).toBe(0); // Sunday
    }
  });

  it('weekdays pattern skips weekends', () => {
    // Master: 2026-05-25 (Monday) 9:00 AM, weekdays
    const master = M(
      'm-wd',
      localIso(2026, 5, 25, 9, 0),
      localIso(2026, 5, 25, 10, 0),
      'weekdays',
    );
    // Range: full week May 24 (Sun) through May 31 (Sun, exclusive)
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 5, 31, 0, 0),
    );
    // Master is Mon May 25 itself (excluded). Phantoms: Tue, Wed, Thu, Fri (May 26-29).
    // Sat May 30 + Sun May 24 should not be in the result.
    expect(phantoms).toHaveLength(4);
    const dows = phantoms.map((p) => new Date(p.start_at).getDay());
    expect(dows.every((d) => d >= 1 && d <= 5)).toBe(true);
    // No weekend
    expect(dows).not.toContain(0);
    expect(dows).not.toContain(6);
  });

  it('master own date is never in phantoms', () => {
    const master = M(
      'm-self',
      localIso(2026, 5, 24, 9, 0),
      localIso(2026, 5, 24, 10, 0),
      'daily',
    );
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 5, 25, 0, 0),
    );
    // Range is just May 24 (1 day, exclusive end at May 25). Master itself
    // is on that day, so no phantoms.
    expect(phantoms).toHaveLength(0);
  });

  it('dates before master are excluded', () => {
    // Master at May 24, range looks at May 17-23 (entirely BEFORE master)
    const master = M(
      'm-future',
      localIso(2026, 5, 24, 9, 0),
      localIso(2026, 5, 24, 10, 0),
      'daily',
    );
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 17, 0, 0),
      localIso(2026, 5, 24, 0, 0),
    );
    expect(phantoms).toHaveLength(0);
  });

  it('recur=none never emits phantoms', () => {
    const master = M(
      'm-once',
      localIso(2026, 5, 24, 9, 0),
      localIso(2026, 5, 24, 10, 0),
      'none',
    );
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 6, 30, 0, 0),
    );
    expect(phantoms).toHaveLength(0);
  });

  it('phantom inherits master duration even if it spans hours', () => {
    // Master: 9:00 PM May 24 - 12:00 AM May 25 (3 hours, crosses midnight in some places)
    const master = M(
      'm-long',
      localIso(2026, 5, 24, 21, 0),
      localIso(2026, 5, 25, 0, 0),
      'daily',
    );
    const phantoms = expandRecurringInstances(
      [master],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 5, 27, 0, 0),
    );
    // May 25 (master's natural next day) + May 26 = 2 phantoms
    expect(phantoms).toHaveLength(2);
    for (const p of phantoms) {
      const start = new Date(p.start_at);
      const end = new Date(p.end_at);
      const durationMs = end.getTime() - start.getTime();
      expect(durationMs).toBe(3 * 60 * 60 * 1000); // 3 hours
      expect(start.getHours()).toBe(21);
    }
  });

  it('multiple masters expand independently', () => {
    const m1 = M(
      'a',
      localIso(2026, 5, 24, 9, 0),
      localIso(2026, 5, 24, 10, 0),
      'daily',
    );
    const m2 = M(
      'b',
      localIso(2026, 5, 24, 14, 0),
      localIso(2026, 5, 24, 15, 0),
      'weekly',
    );
    const phantoms = expandRecurringInstances(
      [m1, m2],
      localIso(2026, 5, 24, 0, 0),
      localIso(2026, 6, 14, 0, 0),
    );
    const aCount = phantoms.filter((p) => p.master_id === 'a').length;
    const bCount = phantoms.filter((p) => p.master_id === 'b').length;
    // m1 daily over ~21 days minus master day ≈ 20 phantoms
    expect(aCount).toBeGreaterThanOrEqual(19);
    expect(aCount).toBeLessThanOrEqual(20);
    // m2 weekly: 3 phantoms (May 31, Jun 7)
    expect(bCount).toBe(2);
  });
});
