import { describe, it, expect } from 'vitest';
import {
  arrowheadAngle,
  arrowPath,
  bestEdgePair,
  bezierControls,
  bezierPoint,
  edgeMidpoints,
} from '../src/lib/notesArrows';

const rect = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe('edgeMidpoints', () => {
  it('computes the four midpoints', () => {
    const e = edgeMidpoints(rect(0, 0, 100, 60));
    expect(e.n).toMatchObject({ x: 50, y: 0 });
    expect(e.s).toMatchObject({ x: 50, y: 60 });
    expect(e.e).toMatchObject({ x: 100, y: 30 });
    expect(e.w).toMatchObject({ x: 0, y: 30 });
  });
});

describe('bestEdgePair', () => {
  it('connects east→west for side-by-side cards', () => {
    const { from, to } = bestEdgePair(rect(0, 0), rect(400, 0));
    expect(from.side).toBe('e');
    expect(to.side).toBe('w');
  });
  it('connects south→north for stacked cards', () => {
    const { from, to } = bestEdgePair(rect(0, 0), rect(0, 400));
    expect(from.side).toBe('s');
    expect(to.side).toBe('n');
  });
  it('re-evaluates when the target moves to the other side', () => {
    const { from, to } = bestEdgePair(rect(400, 0), rect(0, 0));
    expect(from.side).toBe('w');
    expect(to.side).toBe('e');
  });
  it('picks a diagonal-appropriate pair', () => {
    const { from, to } = bestEdgePair(rect(0, 0), rect(400, 400));
    // Any of e/s → n/w is geometrically sensible; assert it's one of them.
    expect(['e', 's']).toContain(from.side);
    expect(['n', 'w']).toContain(to.side);
  });
});

describe('bezier construction', () => {
  const from = { x: 100, y: 30, side: 'e' as const };
  const to = { x: 400, y: 30, side: 'w' as const };

  it('controls bow outward along each side normal', () => {
    const { c1, c2 } = bezierControls(from, to);
    expect(c1.x).toBeGreaterThan(from.x); // east normal points +x
    expect(c1.y).toBe(from.y);
    expect(c2.x).toBeLessThan(to.x);      // west normal points -x
  });

  it('arrowPath emits a well-formed cubic', () => {
    expect(arrowPath(from, to)).toMatch(/^M 100 30 C .+, .+, 400 30$/);
  });

  it('bezierPoint hits the endpoints at t=0 and t=1, middle in between', () => {
    expect(bezierPoint(from, to, 0)).toEqual({ x: 100, y: 30 });
    expect(bezierPoint(from, to, 1)).toEqual({ x: 400, y: 30 });
    const mid = bezierPoint(from, to, 0.5);
    expect(mid.x).toBeGreaterThan(100);
    expect(mid.x).toBeLessThan(400);
  });

  it('arrowhead points along the incoming tangent', () => {
    // Straight west-facing approach → angle ≈ 0° (pointing +x).
    expect(Math.abs(arrowheadAngle(from, to))).toBeLessThan(1);
    // Reverse direction → ≈ 180°.
    const back = arrowheadAngle(to, from);
    expect(Math.abs(Math.abs(back) - 180)).toBeLessThan(1);
  });
});
