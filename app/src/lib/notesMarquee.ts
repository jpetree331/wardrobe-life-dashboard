// Marquee-selection math for the Notes canvas. The marquee is drawn in
// wrapper (screen) space while cards live in canvas space under a
// translate+scale view transform — the hit test converts the marquee into
// canvas space and intersects. Pure functions, unit-tested.

import type { View } from './notesPanZoom';

export type Rect = { x: number; y: number; w: number; h: number };

/** Build a normalized rect (positive w/h) from two corner points. */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

/** Axis-aligned rectangle intersection (touching edges count as a hit). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

/** Convert a wrapper-space rect into canvas space under the given view. */
export function wrapperRectToCanvas(rect: Rect, view: View): Rect {
  return {
    x: (rect.x - view.x) / view.k,
    y: (rect.y - view.y) / view.k,
    w: rect.w / view.k,
    h: rect.h / view.k,
  };
}

/**
 * Ids of all cards whose bounds intersect a wrapper-space marquee rect.
 * Cards with null w/h use the same fallback size the renderer does.
 */
export function marqueeHits(
  marqueeWrapper: Rect,
  view: View,
  cards: Array<{ id: string; x: number; y: number; w?: number | null; h?: number | null }>,
  fallbackW = 200,
  fallbackH = 100,
): string[] {
  const m = wrapperRectToCanvas(marqueeWrapper, view);
  const hits: string[] = [];
  for (const c of cards) {
    const bounds: Rect = { x: c.x, y: c.y, w: c.w ?? fallbackW, h: c.h ?? fallbackH };
    if (rectsIntersect(m, bounds)) hits.push(c.id);
  }
  return hits;
}
