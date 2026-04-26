// Pure tree-shaping helpers for the Sanctuary binder. Kept out of the React
// component so they're easy to unit-test and so the binder render code can
// stay focused on rendering.

import type { Entry } from './entries';

export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type MonthGroup = {
  month: number;            // 1..12
  monthLabel: string;
  count: number;
  entries: Entry[];
};

export type YearGroup = {
  year: string;             // 'YYYY'
  count: number;
  months: MonthGroup[];
};

export type BinderTree = YearGroup[];

/** Year-key for the expanded set. e.g. "2024" */
export function yearKey(year: string): string {
  return year;
}

/** Month-key for the expanded set. e.g. "2024-04" */
export function monthKey(year: string, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Group flat entries into year > month > entries. Years descend (newest
 * first); months descend within year; entries descend within month, then
 * by created_at as a tiebreaker so multiple entries on the same day stay
 * in insertion order.
 */
export function buildBinderTree(entries: Entry[]): BinderTree {
  const yearMap = new Map<string, Map<number, Entry[]>>();
  for (const e of entries) {
    if (!e.entry_date || e.entry_date.length < 7) continue;
    const year = e.entry_date.slice(0, 4);
    const month = Number(e.entry_date.slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    let m = yearMap.get(year);
    if (!m) { m = new Map(); yearMap.set(year, m); }
    let arr = m.get(month);
    if (!arr) { arr = []; m.set(month, arr); }
    arr.push(e);
  }

  return [...yearMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, monthsMap]) => {
      const months: MonthGroup[] = [...monthsMap.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, es]) => ({
          month,
          monthLabel: MONTH_LABELS[month - 1],
          count: es.length,
          entries: es.slice().sort((a, b) => {
            const d = b.entry_date.localeCompare(a.entry_date);
            if (d !== 0) return d;
            return (b.created_at || '').localeCompare(a.created_at || '');
          }),
        }));
      const count = months.reduce((acc, m) => acc + m.count, 0);
      return { year, count, months };
    });
}

/**
 * For a given active entry, return the set of expansion keys that should be
 * open so the entry is visible (its year + its month). Caller merges with
 * existing expanded set rather than replacing — we don't want to collapse
 * folders the user has chosen to leave open.
 */
export function expansionKeysForEntry(entry: Entry | null | undefined): string[] {
  if (!entry?.entry_date || entry.entry_date.length < 7) return [];
  const year = entry.entry_date.slice(0, 4);
  const month = Number(entry.entry_date.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return [];
  return [yearKey(year), monthKey(year, month)];
}
