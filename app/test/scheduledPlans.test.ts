import { describe, it, expect } from 'vitest';
import { BIBLE_BOOKS, chapterCount } from '../src/lib/bibleVerseCounts';
import {
  SCHEDULED_PLANS,
  dateForDay,
  dayNumberForDate,
  parseReadingRef,
  readingKey,
  scheduledEndDate,
  scheduledPace,
  scheduledPlanByKey,
  totalReadings,
  trackOf,
} from '../src/lib/scheduledPlans';

const oyb = scheduledPlanByKey('one-year-bible-4track')!;

describe('One-Year Bible plan data (generated from the PDF)', () => {
  it('has exactly 365 days, none empty', () => {
    expect(oyb.days.length).toBe(365);
    expect(oyb.days.every((d) => d.length >= 3 && d.length <= 5)).toBe(true);
  });

  it('every reading is a real chapter of a canonical book', () => {
    const canon = new Set(BIBLE_BOOKS);
    for (const day of oyb.days) {
      for (const r of day) {
        expect(canon.has(r.book), `unknown book ${r.book}`).toBe(true);
        expect(r.chapter).toBeGreaterThanOrEqual(1);
        expect(r.chapter, `${r.book} ${r.chapter}`).toBeLessThanOrEqual(chapterCount(r.book));
      }
    }
  });

  it('covers every one of the 1,189 chapters of the Bible at least once', () => {
    const seen = new Set<string>();
    for (const day of oyb.days) for (const r of day) seen.add(`${r.book}|${r.chapter}`);
    const missing: string[] = [];
    let all = 0;
    for (const b of BIBLE_BOOKS) {
      for (let c = 1; c <= chapterCount(b); c++) {
        all++;
        if (!seen.has(`${b}|${c}`)) missing.push(`${b} ${c}`);
      }
    }
    expect(all).toBe(1189);
    expect(missing).toEqual([]);
  });

  it('matches the PDF at spot-checked rows (first, middle, last)', () => {
    const refs = (n: number) => oyb.days[n - 1].map((r) => `${r.book} ${r.chapter}`);
    expect(refs(1)).toEqual(['Genesis 1', 'Genesis 2', 'Job 1', 'Matthew 1', 'Psalms 1']);
    expect(refs(100)).toEqual(['Deuteronomy 18', 'Isaiah 38', 'Acts 11', 'Psalms 100']);
    expect(refs(300)).toEqual(['2 Chronicles 4', 'Zechariah 6', 'Mark 12', 'Psalms 119']);
    expect(refs(365)).toEqual(['Esther 10', 'Romans 16', 'Psalms 3']);
    expect(totalReadings(oyb)).toBe(1478);
  });

  it('repeats chapters across days — the reason completion is keyed by day', () => {
    const psalm2Days = oyb.days
      .map((d, i) => (d.some((r) => r.book === 'Psalms' && r.chapter === 2) ? i + 1 : 0))
      .filter(Boolean);
    expect(psalm2Days.length).toBeGreaterThan(1);
    expect(readingKey(psalm2Days[0], 'Psalms', 2)).not.toBe(readingKey(psalm2Days[1], 'Psalms', 2));
  });
});

describe('scheduledPlans helpers', () => {
  it('parseReadingRef handles numbered and multi-word books', () => {
    expect(parseReadingRef('1 Samuel 3')).toEqual({ book: '1 Samuel', chapter: 3 });
    expect(parseReadingRef('Song of Solomon 8')).toEqual({ book: 'Song of Solomon', chapter: 8 });
    expect(() => parseReadingRef('Genesis')).toThrow();
  });

  it('trackOf sorts books into the PDF\'s four columns (Job is column 2)', () => {
    expect(trackOf('Genesis')).toBe('history');
    expect(trackOf('Esther')).toBe('history');
    expect(trackOf('Job')).toBe('prophets');
    expect(trackOf('Malachi')).toBe('prophets');
    expect(trackOf('Psalms')).toBe('psalm');
    expect(trackOf('Proverbs')).toBe('psalm');
    expect(trackOf('Romans')).toBe('nt');
  });

  it('every SCHEDULED_PLANS key is unique', () => {
    const keys = SCHEDULED_PLANS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(scheduledPlanByKey('nope')).toBeNull();
    expect(scheduledPlanByKey(null)).toBeNull();
  });

  it('date math: Jan 1 start ends Dec 31 in a common year', () => {
    expect(dateForDay('2026-01-01', 1)).toBe('2026-01-01');
    expect(dateForDay('2026-01-01', 263)).toBe('2026-09-20');
    expect(scheduledEndDate('2026-01-01', 365)).toBe('2026-12-31');
    // Leap year: 365 days from Jan 1 lands on Dec 30.
    expect(scheduledEndDate('2028-01-01', 365)).toBe('2028-12-30');
  });

  it('dayNumberForDate is the inverse, clamps outside the plan, survives DST', () => {
    expect(dayNumberForDate('2026-01-01', '2026-01-01', 365)).toBe(1);
    expect(dayNumberForDate('2026-01-01', '2026-09-20', 365)).toBe(263);
    expect(dayNumberForDate('2026-01-01', '2025-12-31', 365)).toBe(0);
    expect(dayNumberForDate('2026-01-01', '2027-01-05', 365)).toBe(366);
    // Across the US spring-forward (Mar 8 2026) and fall-back (Nov 1 2026).
    expect(dayNumberForDate('2026-03-01', '2026-03-15', 365)).toBe(15);
    expect(dayNumberForDate('2026-10-25', '2026-11-08', 365)).toBe(15);
    for (const n of [1, 59, 60, 200, 365]) {
      expect(dayNumberForDate('2026-01-01', dateForDay('2026-01-01', n), 365)).toBe(n);
    }
  });

  it('scheduledPace: not started / on track / behind / ahead / finished', () => {
    const start = '2026-01-01';
    const keysThrough = (n: number) => {
      const s = new Set<string>();
      oyb.days.slice(0, n).forEach((day, i) => day.forEach((r) => s.add(readingKey(i + 1, r.book, r.chapter))));
      return s;
    };
    const before = scheduledPace({ def: oyb, startDate: start, today: '2025-12-25', completedKeys: new Set() });
    expect(before.status).toBe('not-started');
    expect(before.expected).toBe(0);

    const onTrack = scheduledPace({ def: oyb, startDate: start, today: '2026-01-10', completedKeys: keysThrough(10) });
    expect(onTrack.status).toBe('on-track');
    expect(onTrack.daysComplete).toBe(10);
    expect(onTrack.delta).toBe(0);

    const behind = scheduledPace({ def: oyb, startDate: start, today: '2026-01-10', completedKeys: keysThrough(7) });
    expect(behind.status).toBe('behind');
    expect(behind.delta).toBeLessThan(0);

    const ahead = scheduledPace({ def: oyb, startDate: start, today: '2026-01-10', completedKeys: keysThrough(12) });
    expect(ahead.status).toBe('ahead');

    const done = scheduledPace({ def: oyb, startDate: start, today: '2026-06-01', completedKeys: keysThrough(365) });
    expect(done.status).toBe('finished');
    expect(done.pctComplete).toBe(1);
    expect(done.completed).toBe(1478);
  });
});
