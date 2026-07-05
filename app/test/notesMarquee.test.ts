import { describe, it, expect } from 'vitest';
import {
  marqueeHits,
  normalizeRect,
  rectsIntersect,
  wrapperRectToCanvas,
} from '../src/lib/notesMarquee';

describe('normalizeRect', () => {
  it('handles all four drag directions', () => {
    const expected = { x: 10, y: 20, w: 30, h: 40 };
    expect(normalizeRect(10, 20, 40, 60)).toEqual(expected); // SE
    expect(normalizeRect(40, 20, 10, 60)).toEqual(expected); // SW
    expect(normalizeRect(10, 60, 40, 20)).toEqual(expected); // NE
    expect(normalizeRect(40, 60, 10, 20)).toEqual(expected); // NW
  });

  it('produces a zero-size rect for a click without drag', () => {
    expect(normalizeRect(5, 5, 5, 5)).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });
});

describe('rectsIntersect', () => {
  const base = { x: 0, y: 0, w: 100, h: 100 };
  it('detects overlap and containment', () => {
    expect(rectsIntersect(base, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
    expect(rectsIntersect(base, { x: 25, y: 25, w: 10, h: 10 })).toBe(true); // contained
    expect(rectsIntersect({ x: 25, y: 25, w: 10, h: 10 }, base)).toBe(true); // containing
  });
  it('rejects disjoint rects', () => {
    expect(rectsIntersect(base, { x: 200, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsIntersect(base, { x: 0, y: -50, w: 10, h: 10 })).toBe(false);
  });
  it('counts touching edges as intersecting', () => {
    expect(rectsIntersect(base, { x: 100, y: 0, w: 10, h: 10 })).toBe(true);
  });
});

describe('wrapperRectToCanvas', () => {
  it('is identity under the identity view', () => {
    const r = { x: 10, y: 20, w: 30, h: 40 };
    expect(wrapperRectToCanvas(r, { x: 0, y: 0, k: 1 })).toEqual(r);
  });
  it('undoes pan and zoom', () => {
    // View: panned (100, 50), zoomed 2x. Canvas point (0,0) renders at
    // wrapper (100,50); a wrapper rect starting there maps back to origin.
    const out = wrapperRectToCanvas({ x: 100, y: 50, w: 200, h: 100 }, { x: 100, y: 50, k: 2 });
    expect(out).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
});

describe('marqueeHits', () => {
  const cards = [
    { id: 'a', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', x: 300, y: 0, w: 100, h: 100 },
    { id: 'c', x: 0, y: 300, w: 100, h: 100 },
  ];

  it('selects exactly the intersecting cards at 100%', () => {
    // Marquee covering the top strip (y 0..150) hits a and b, not c.
    const hits = marqueeHits({ x: 0, y: 0, w: 450, h: 150 }, { x: 0, y: 0, k: 1 }, cards);
    expect(hits.sort()).toEqual(['a', 'b']);
  });

  it('is transform-correct when zoomed out to 40%', () => {
    // At k=0.4, canvas x=300 renders at wrapper x=120. A wrapper marquee
    // 0..180 wide covers canvas 0..450 → hits a and b.
    const hits = marqueeHits({ x: 0, y: 0, w: 180, h: 60 }, { x: 0, y: 0, k: 0.4 }, cards);
    expect(hits.sort()).toEqual(['a', 'b']);
  });

  it('is transform-correct when zoomed in to 200% with pan', () => {
    // View pans canvas (0,0) to wrapper (-100,-100) at k=2. Card 'a'
    // occupies wrapper -100..100 in both axes; a marquee at 0..50 hits it.
    const view = { x: -100, y: -100, k: 2 };
    expect(marqueeHits({ x: 0, y: 0, w: 50, h: 50 }, view, cards)).toEqual(['a']);
    // A marquee in wrapper 500..700 covers canvas 300..400 → card 'b'.
    expect(marqueeHits({ x: 500, y: 0, w: 200, h: 150 }, view, cards)).toEqual(['b']);
  });

  it('uses fallback dimensions for cards without w/h', () => {
    const loose = [{ id: 'z', x: 100, y: 100 }];
    // Fallback 200x100 → card spans 100..300 x 100..200.
    expect(marqueeHits({ x: 250, y: 150, w: 10, h: 10 }, { x: 0, y: 0, k: 1 }, loose)).toEqual(['z']);
    expect(marqueeHits({ x: 350, y: 150, w: 10, h: 10 }, { x: 0, y: 0, k: 1 }, loose)).toEqual([]);
  });

  it('returns empty for an empty marquee area away from cards', () => {
    expect(marqueeHits({ x: 1000, y: 1000, w: 5, h: 5 }, { x: 0, y: 0, k: 1 }, cards)).toEqual([]);
  });
});
