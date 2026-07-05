// Pure arrow geometry: edge selection between two card rects, cubic
// bezier path construction, and the label midpoint. The SVG overlay in
// Notes.tsx feeds live card rects through these on every render, so
// arrows follow cards for free. No DOM/Supabase imports; unit-tested.

export type Side = 'n' | 's' | 'e' | 'w';
export type RectLike = { x: number; y: number; w: number; h: number };
export type EdgePoint = { x: number; y: number; side: Side };

/** The four edge midpoints of a rect. */
export function edgeMidpoints(r: RectLike): Record<Side, EdgePoint> {
  return {
    n: { x: r.x + r.w / 2, y: r.y, side: 'n' },
    s: { x: r.x + r.w / 2, y: r.y + r.h, side: 's' },
    e: { x: r.x + r.w, y: r.y + r.h / 2, side: 'e' },
    w: { x: r.x, y: r.y + r.h / 2, side: 'w' },
  };
}

/**
 * Pick the pair of edge midpoints (one per rect) with the shortest
 * distance — re-evaluated as cards move so arrows always take the
 * shortest sensible path.
 */
export function bestEdgePair(a: RectLike, b: RectLike): { from: EdgePoint; to: EdgePoint } {
  const ae = edgeMidpoints(a);
  const be = edgeMidpoints(b);
  let best: { from: EdgePoint; to: EdgePoint } | null = null;
  let bestD = Infinity;
  for (const fa of Object.values(ae)) {
    for (const fb of Object.values(be)) {
      const d = (fa.x - fb.x) ** 2 + (fa.y - fb.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { from: fa, to: fb };
      }
    }
  }
  return best!;
}

/** Outward normal for a side. */
function normal(side: Side): { x: number; y: number } {
  switch (side) {
    case 'n': return { x: 0, y: -1 };
    case 's': return { x: 0, y: 1 };
    case 'e': return { x: 1, y: 0 };
    case 'w': return { x: -1, y: 0 };
  }
}

/** Control points bow outward from each attachment side. */
export function bezierControls(
  from: EdgePoint,
  to: EdgePoint,
): { c1: { x: number; y: number }; c2: { x: number; y: number } } {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const bow = Math.min(Math.max(d * 0.4, 24), 180);
  const nf = normal(from.side);
  const nt = normal(to.side);
  return {
    c1: { x: from.x + nf.x * bow, y: from.y + nf.y * bow },
    c2: { x: to.x + nt.x * bow, y: to.y + nt.y * bow },
  };
}

/** SVG path (cubic bezier) between two edge points. */
export function arrowPath(from: EdgePoint, to: EdgePoint): string {
  const { c1, c2 } = bezierControls(from, to);
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/** Point on the cubic at parameter t (label anchoring uses t = 0.5). */
export function bezierPoint(from: EdgePoint, to: EdgePoint, t: number): { x: number; y: number } {
  const { c1, c2 } = bezierControls(from, to);
  const u = 1 - t;
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y,
  };
}

/**
 * Angle (degrees) of the path direction at the target end — orients the
 * arrowhead along the incoming tangent.
 */
export function arrowheadAngle(from: EdgePoint, to: EdgePoint): number {
  const { c2 } = bezierControls(from, to);
  return (Math.atan2(to.y - c2.y, to.x - c2.x) * 180) / Math.PI;
}
