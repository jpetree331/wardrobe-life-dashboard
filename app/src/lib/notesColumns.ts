// Pure order-math for column containers: insertion-index from cursor
// position, list surgery, and minimal reindex updates. No DOM/Supabase.

/**
 * Where an item dropped at cursorY lands among members whose vertical
 * midpoints are `memberMidYs` (in visual order): before the first midpoint
 * the cursor is above. Dropping below all members appends.
 */
export function insertionIndexFromY(memberMidYs: number[], cursorY: number): number {
  for (let i = 0; i < memberMidYs.length; i++) {
    if (cursorY < memberMidYs[i]) return i;
  }
  return memberMidYs.length;
}

/** Insert `items` into `arr` at `index` (clamped). Returns a new array. */
export function insertAt<T>(arr: T[], items: T[], index: number): T[] {
  const i = Math.max(0, Math.min(index, arr.length));
  return [...arr.slice(0, i), ...items, ...arr.slice(i)];
}

/** Remove all `items` from `arr`. Returns a new array. */
export function removeItems<T>(arr: T[], items: Set<T>): T[] {
  return arr.filter((x) => !items.has(x));
}

/**
 * Move `item` within `arr` to `toIndex` (an index in the CURRENT array,
 * interpreted as "insert before the element currently at toIndex" after
 * removal — the standard drag-reorder semantic).
 */
export function moveWithin<T>(arr: T[], item: T, toIndex: number): T[] {
  const from = arr.indexOf(item);
  if (from === -1) return arr;
  const without = arr.filter((x) => x !== item);
  // Removing an earlier element shifts later indices down by one.
  const target = from < toIndex ? toIndex - 1 : toIndex;
  return insertAt(without, [item], target);
}

/**
 * Minimal set of { id, column_index } updates that makes the stored
 * indices match `orderedIds`. `current` maps id → stored index (or
 * null/undefined when unset).
 */
export function reindexUpdates(
  orderedIds: string[],
  current: Map<string, number | null | undefined>,
): Array<{ id: string; column_index: number }> {
  const updates: Array<{ id: string; column_index: number }> = [];
  orderedIds.forEach((id, i) => {
    if (current.get(id) !== i) updates.push({ id, column_index: i });
  });
  return updates;
}
