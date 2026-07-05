import { describe, it, expect } from 'vitest';
import { stepOrder } from '../src/lib/notesZOrder';

describe('stepOrder', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('steps a single item forward / backward one slot', () => {
    expect(stepOrder(order, new Set(['b']), 'forward')).toEqual(['a', 'c', 'b', 'd']);
    expect(stepOrder(order, new Set(['c']), 'backward')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('clamps at the extremes', () => {
    expect(stepOrder(order, new Set(['d']), 'forward')).toEqual(order);
    expect(stepOrder(order, new Set(['a']), 'backward')).toEqual(order);
  });

  it('front / back move the whole selection preserving its order', () => {
    expect(stepOrder(order, new Set(['a', 'c']), 'front')).toEqual(['b', 'd', 'a', 'c']);
    expect(stepOrder(order, new Set(['b', 'd']), 'back')).toEqual(['b', 'd', 'a', 'c']);
  });

  it('adjacent selected items move as a block without leapfrogging', () => {
    expect(stepOrder(order, new Set(['b', 'c']), 'forward')).toEqual(['a', 'd', 'b', 'c']);
    expect(stepOrder(order, new Set(['b', 'c']), 'backward')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('empty selection is a no-op', () => {
    expect(stepOrder(order, new Set(), 'forward')).toEqual(order);
  });
});
