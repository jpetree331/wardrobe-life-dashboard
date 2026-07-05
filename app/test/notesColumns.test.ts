import { describe, it, expect } from 'vitest';
import {
  insertAt,
  insertionIndexFromY,
  moveWithin,
  reindexUpdates,
  removeItems,
} from '../src/lib/notesColumns';

describe('insertionIndexFromY', () => {
  const mids = [100, 200, 300];
  it('inserts before the first midpoint below the cursor', () => {
    expect(insertionIndexFromY(mids, 50)).toBe(0);
    expect(insertionIndexFromY(mids, 150)).toBe(1);
    expect(insertionIndexFromY(mids, 250)).toBe(2);
  });
  it('appends when the cursor is below every member', () => {
    expect(insertionIndexFromY(mids, 350)).toBe(3);
    expect(insertionIndexFromY([], 10)).toBe(0);
  });
});

describe('insertAt / removeItems', () => {
  it('inserts a group at an index', () => {
    expect(insertAt(['a', 'b', 'c'], ['x', 'y'], 1)).toEqual(['a', 'x', 'y', 'b', 'c']);
  });
  it('clamps out-of-range indices', () => {
    expect(insertAt(['a'], ['x'], 99)).toEqual(['a', 'x']);
    expect(insertAt(['a'], ['x'], -5)).toEqual(['x', 'a']);
  });
  it('removes a set of items', () => {
    expect(removeItems(['a', 'b', 'c', 'd'], new Set(['b', 'd']))).toEqual(['a', 'c']);
  });
});

describe('moveWithin', () => {
  const arr = ['a', 'b', 'c', 'd'];
  it('moves an item down (accounting for its own removal)', () => {
    expect(moveWithin(arr, 'a', 3)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveWithin(arr, 'a', 4)).toEqual(['b', 'c', 'd', 'a']);
  });
  it('moves an item up', () => {
    expect(moveWithin(arr, 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('is a no-op for the same slot or a missing item', () => {
    expect(moveWithin(arr, 'b', 1)).toEqual(arr);
    expect(moveWithin(arr, 'zz', 0)).toEqual(arr);
  });
});

describe('reindexUpdates', () => {
  it('returns only the rows whose stored index is wrong', () => {
    const current = new Map<string, number | null | undefined>([
      ['a', 0], ['b', 2], ['c', null],
    ]);
    expect(reindexUpdates(['a', 'b', 'c'], current)).toEqual([
      { id: 'b', column_index: 1 },
      { id: 'c', column_index: 2 },
    ]);
  });
  it('returns empty when everything already matches', () => {
    const current = new Map([['a', 0], ['b', 1]]);
    expect(reindexUpdates(['a', 'b'], current)).toEqual([]);
  });
});
