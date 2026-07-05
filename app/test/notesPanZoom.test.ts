import { describe, it, expect } from 'vitest';
import {
  ZOOM_MIN,
  ZOOM_MAX,
  clampZoom,
  fitView,
  viewCenteredOnContent,
  wrapperToCanvas,
  zoomAroundCursor,
} from '../src/lib/notesPanZoom';

describe('clampZoom', () => {
  it('clamps to [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(clampZoom(0.05)).toBe(ZOOM_MIN);
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
  it('returns 1 for non-finite values (NaN, Infinity)', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
    expect(clampZoom(-Infinity)).toBe(1);
  });
});

describe('zoomAroundCursor', () => {
  it('keeps the canvas point under the cursor anchored', () => {
    // Cursor at (100, 100) in wrapper space. Initial view: identity.
    // Zoom in by 2x. The wrapper-local point (100, 100) before and after
    // should refer to the SAME canvas-local point.
    const v0 = { x: 0, y: 0, k: 1 };
    const v1 = zoomAroundCursor(v0, 2, 100, 100);
    expect(v1.k).toBe(2);
    // Verify: under v0, wrapper(100,100) -> canvas (100,100).
    // Under v1, wrapper(100,100) -> canvas ((100 - v1.x) / 2, (100 - v1.y) / 2).
    // Those should equal (100, 100).
    expect((100 - v1.x) / v1.k).toBeCloseTo(100, 5);
    expect((100 - v1.y) / v1.k).toBeCloseTo(100, 5);
  });

  it('clamps at ZOOM_MAX', () => {
    const v = zoomAroundCursor({ x: 0, y: 0, k: 2 }, 10, 0, 0);
    expect(v.k).toBe(ZOOM_MAX);
  });

  it('clamps at ZOOM_MIN', () => {
    const v = zoomAroundCursor({ x: 0, y: 0, k: 0.5 }, 0.1, 0, 0);
    expect(v.k).toBe(ZOOM_MIN);
  });

  it('returns the same view object when zoom would not change', () => {
    const v0 = { x: 50, y: 50, k: ZOOM_MAX };
    const v1 = zoomAroundCursor(v0, 2, 100, 100); // already at max
    expect(v1).toBe(v0);
  });
});

describe('wrapperToCanvas', () => {
  it('inverts zoomAroundCursor — round-trip stable', () => {
    const v = { x: 30, y: 40, k: 1.5 };
    const { x, y } = wrapperToCanvas(v, 100, 200);
    // Canvas point should land back at wrapper (100,200) when transformed
    // forward by the same view.
    expect(v.x + x * v.k).toBeCloseTo(100);
    expect(v.y + y * v.k).toBeCloseTo(200);
  });
});

describe('viewCenteredOnContent', () => {
  it('returns identity-at-k for an empty board', () => {
    expect(viewCenteredOnContent([], 1000, 800)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('pins the content bbox center to the viewport center at 100%', () => {
    // Single card 200x100 at (400, 300) → content center (500, 350).
    const v = viewCenteredOnContent([{ x: 400, y: 300, w: 200, h: 100 }], 1000, 800);
    expect(v.k).toBe(1);
    // Canvas point (500,350) should render at wrapper (500,400).
    expect(v.x + 500 * v.k).toBeCloseTo(500);
    expect(v.y + 350 * v.k).toBeCloseTo(400);
  });

  it('keeps 100% zoom even when content overflows the viewport', () => {
    const v = viewCenteredOnContent([{ x: 0, y: 0, w: 5000, h: 4000 }], 1000, 800);
    expect(v.k).toBe(1); // never scales — that's fitView's job
  });

  it('clamps a requested zoom into range', () => {
    const v = viewCenteredOnContent([{ x: 0, y: 0, w: 100, h: 100 }], 1000, 800, 99);
    expect(v.k).toBe(ZOOM_MAX);
  });
});

describe('fitView', () => {
  it('returns identity for an empty card list', () => {
    expect(fitView([], 1000, 800)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('returns identity if the wrapper has no size', () => {
    expect(fitView([{ x: 0, y: 0, w: 100, h: 100 }], 0, 0)).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('scales down to fit a too-wide layout', () => {
    const view = fitView(
      [
        { x: 0, y: 0, w: 2000, h: 100 },
        { x: 2100, y: 0, w: 200, h: 100 },
      ],
      1000,
      800,
    );
    // Total content width 2300; viewport 1000; k must be ≤ 1000/2300 ≈ 0.43.
    expect(view.k).toBeLessThan(0.5);
    expect(view.k).toBeGreaterThan(0.3);
  });

  it("doesn't zoom past 100% when content fits comfortably", () => {
    const view = fitView([{ x: 50, y: 50, w: 100, h: 100 }], 1000, 800);
    expect(view.k).toBe(1);
  });

  it('handles cards with missing w/h by assuming defaults', () => {
    // Should not throw.
    const view = fitView([{ x: 0, y: 0 }], 1000, 800);
    expect(view.k).toBe(1);
  });
});
