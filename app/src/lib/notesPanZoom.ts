// Pan/zoom math for the Notes canvas. Pulled out of the React component so
// the algebra is testable in isolation — pan/zoom around a cursor is one of
// those things that's easy to almost-get-right and hard to debug visually.

export type View = { x: number; y: number; k: number };

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;

/** Clamp zoom to the [ZOOM_MIN, ZOOM_MAX] range used by the canvas. */
export function clampZoom(k: number): number {
  if (!Number.isFinite(k)) return 1;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
}

/**
 * Zoom by a multiplicative factor while keeping the canvas point under the
 * cursor pinned. `cx` / `cy` are the cursor coordinates in the wrapper's
 * local space (e.g. `e.clientX - wrapperRect.left`).
 *
 * Formula derivation: the canvas is rendered as `translate(view.x, view.y)
 * scale(view.k)`. A wrapper-local point (cx, cy) corresponds to the canvas-
 * local point ((cx - view.x) / view.k, (cy - view.y) / view.k). We want the
 * same canvas-local point to land at (cx, cy) after the zoom, so:
 *
 *   newX + canvasPoint.x * newK = cx
 *   newX = cx - canvasPoint.x * newK
 *        = cx - ((cx - view.x) / view.k) * newK
 *        = cx - (cx - view.x) * (newK / view.k)
 */
export function zoomAroundCursor(view: View, factor: number, cx: number, cy: number): View {
  const newK = clampZoom(view.k * factor);
  if (newK === view.k) return view;
  const r = newK / view.k;
  return {
    x: cx - (cx - view.x) * r,
    y: cy - (cy - view.y) * r,
    k: newK,
  };
}

/**
 * Convert wrapper-local coordinates to canvas-local coordinates given the
 * current view. Used when dropping a card from the toolbar onto the canvas
 * (the drop point in wrapper space needs to become an x/y on the canvas).
 */
export function wrapperToCanvas(view: View, cx: number, cy: number): { x: number; y: number } {
  return {
    x: (cx - view.x) / view.k,
    y: (cy - view.y) / view.k,
  };
}

/**
 * Compute a `View` at the given zoom (default 100%) with the content's
 * bounding-box center pinned to the viewport center. Used by the Cmd/Ctrl+0
 * "actual size" shortcut — unlike fitView it never changes what 100% means,
 * it only recenters.
 */
export function viewCenteredOnContent(
  cards: Array<{ x: number; y: number; w?: number | null; h?: number | null }>,
  wrapperW: number,
  wrapperH: number,
  k = 1,
): View {
  const kk = clampZoom(k);
  if (cards.length === 0 || wrapperW <= 0 || wrapperH <= 0) {
    return { x: 0, y: 0, k: kk };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) {
    const w = c.w ?? 200;
    const h = c.h ?? 100;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + w > maxX) maxX = c.x + w;
    if (c.y + h > maxY) maxY = c.y + h;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: wrapperW / 2 - cx * kk,
    y: wrapperH / 2 - cy * kk,
    k: kk,
  };
}

/**
 * Compute a `View` that fits all cards within the wrapper viewport.
 * `cards` is a list of { x, y, w, h } rectangles in canvas-local units.
 * If there are no cards, returns the default 100% identity view.
 */
export function fitView(
  cards: Array<{ x: number; y: number; w?: number | null; h?: number | null }>,
  wrapperW: number,
  wrapperH: number,
  padding = 60,
): View {
  if (cards.length === 0 || wrapperW <= 0 || wrapperH <= 0) {
    return { x: 0, y: 0, k: 1 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) {
    const w = c.w ?? 200;
    const h = c.h ?? 100;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + w > maxX) maxX = c.x + w;
    if (c.y + h > maxY) maxY = c.y + h;
  }
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW <= 0 || contentH <= 0) return { x: 0, y: 0, k: 1 };
  const kx = (wrapperW - padding * 2) / contentW;
  const ky = (wrapperH - padding * 2) / contentH;
  const k = clampZoom(Math.min(kx, ky, 1)); // don't auto-zoom past 100%
  // Center the content in the wrapper
  const x = (wrapperW - contentW * k) / 2 - minX * k;
  const y = (wrapperH - contentH * k) / 2 - minY * k;
  return { x, y, k };
}
