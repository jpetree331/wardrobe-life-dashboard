import { describe, it, expect } from 'vitest';
import {
  buildBinderTree,
  expansionKeysForEntry,
  monthKey,
  yearKey,
} from '../src/lib/binderTree';
import type { Entry } from '../src/lib/entries';

function entry(date: string, id: string = date): Entry {
  return {
    id,
    user_id: 'u',
    room: 'sanctuary',
    entry_date: date,
    title: null,
    body: null,
    body_type: 'rich',
    tags: [],
    scripture_refs: [],
    entry_type: null,
    created_at: '2026-04-26T00:00:00Z',
    updated_at: '2026-04-26T00:00:00Z',
  };
}

describe('buildBinderTree', () => {
  it('groups by year then month, newest first at every level', () => {
    const tree = buildBinderTree([
      entry('2023-04-02'),
      entry('2024-04-09'),
      entry('2024-01-01'),
      entry('2025-03-01'),
    ]);
    expect(tree.map((y) => y.year)).toEqual(['2025', '2024', '2023']);
    expect(tree[1].months.map((m) => m.month)).toEqual([4, 1]);
  });

  it('aggregates count at each level', () => {
    const tree = buildBinderTree([
      entry('2024-01-01'),
      entry('2024-01-15'),
      entry('2024-02-10'),
      entry('2023-04-02'),
    ]);
    const y2024 = tree.find((y) => y.year === '2024')!;
    expect(y2024.count).toBe(3);
    expect(y2024.months.find((m) => m.month === 1)!.count).toBe(2);
    expect(y2024.months.find((m) => m.month === 2)!.count).toBe(1);
  });

  it('orders entries within a month newest first by date, then by created_at', () => {
    const a: Entry = { ...entry('2024-04-15', 'a'), created_at: '2024-04-15T08:00:00Z' };
    const b: Entry = { ...entry('2024-04-15', 'b'), created_at: '2024-04-15T22:00:00Z' };
    const c: Entry = { ...entry('2024-04-19', 'c') };
    const tree = buildBinderTree([a, b, c]);
    const month = tree[0].months[0];
    // c (newer date) first, then b (later created_at), then a.
    expect(month.entries.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('uses canonical month labels', () => {
    const tree = buildBinderTree([entry('2024-01-01'), entry('2024-09-15')]);
    const months = tree[0].months;
    const sept = months.find((m) => m.month === 9)!;
    const jan = months.find((m) => m.month === 1)!;
    expect(sept.monthLabel).toBe('September');
    expect(jan.monthLabel).toBe('January');
  });

  it('returns empty tree for empty input', () => {
    expect(buildBinderTree([])).toEqual([]);
  });

  it('skips entries with invalid dates rather than crashing', () => {
    const tree = buildBinderTree([
      entry('2024-04-19'),
      entry(''),                  // empty
      entry('garbage'),           // unparseable
      entry('2024-13-01'),        // invalid month
      entry('2024-00-01'),        // invalid month (zero)
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].year).toBe('2024');
    expect(tree[0].count).toBe(1);
  });

  it('key helpers produce stable strings', () => {
    expect(yearKey('2024')).toBe('2024');
    expect(monthKey('2024', 4)).toBe('2024-04');
    expect(monthKey('2024', 12)).toBe('2024-12');
  });
});

describe('expansionKeysForEntry', () => {
  it('returns the year and month-of-year keys for the entry', () => {
    expect(expansionKeysForEntry(entry('2024-04-19'))).toEqual(['2024', '2024-04']);
  });

  it('returns empty array for null / undefined / bad date', () => {
    expect(expansionKeysForEntry(null)).toEqual([]);
    expect(expansionKeysForEntry(undefined)).toEqual([]);
    expect(expansionKeysForEntry(entry(''))).toEqual([]);
    expect(expansionKeysForEntry(entry('2024-13-01'))).toEqual([]);
  });
});
