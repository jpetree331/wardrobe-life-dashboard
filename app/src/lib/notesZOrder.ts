// Pure z-order stepping for the [ / ] shortcuts: reorder an id list with
// the selection moved one step (or to the extremes), preserving the
// selection's internal order. The caller renumbers z from array position.

export type ZStep = 'forward' | 'backward' | 'front' | 'back';

export function stepOrder<T>(order: T[], selected: Set<T>, dir: ZStep): T[] {
  if (selected.size === 0) return order;
  if (dir === 'front' || dir === 'back') {
    const sel = order.filter((x) => selected.has(x));
    const rest = order.filter((x) => !selected.has(x));
    return dir === 'front' ? [...rest, ...sel] : [...sel, ...rest];
  }
  const arr = [...order];
  if (dir === 'forward') {
    // Sweep from the top so adjacent selected items don't leapfrog.
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selected.has(arr[i]) && !selected.has(arr[i + 1])) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selected.has(arr[i]) && !selected.has(arr[i - 1])) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
  }
  return arr;
}
