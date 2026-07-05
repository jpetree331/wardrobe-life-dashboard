// Pure image-card math: sizing, aspect-locked resize, and multi-drop
// fan-out. No DOM or Supabase imports so it unit-tests cleanly; the
// storage I/O lives in notesMedia.ts.

export const IMAGE_MIN_W = 80;
/** Longest edge of the client-side resized canvas rendition. */
export const IMAGE_MAX_RENDITION = 1600;
/** Default on-canvas footprint for a freshly created image card. */
export const IMAGE_CARD_MAX_W = 320;
export const IMAGE_CARD_MAX_H = 280;

/** Scale (w, h) down to fit maxW×maxH preserving aspect. Never upscales. */
export function fitWithin(
  w: number,
  h: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Initial card dimensions for an image with the given natural size. */
export function initialCardSize(naturalW: number, naturalH: number): { w: number; h: number } {
  const fitted = fitWithin(naturalW, naturalH, IMAGE_CARD_MAX_W, IMAGE_CARD_MAX_H);
  // Tiny images still get a usable card.
  return { w: Math.max(fitted.w, IMAGE_MIN_W), h: Math.max(fitted.h, Math.round(IMAGE_MIN_W * (naturalH / Math.max(naturalW, 1)))) };
}

/**
 * Aspect-locked corner resize: width follows the horizontal drag, height
 * derives from the image's aspect ratio.
 */
export function aspectResize(
  startW: number,
  dx: number,
  aspect: number, // naturalW / naturalH
  minW = IMAGE_MIN_W,
): { w: number; h: number } {
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const w = Math.max(minW, startW + dx);
  return { w, h: w / safeAspect };
}

/**
 * Offsets for dropping several files at once: a loose grid flowing right
 * then down from the drop point, so nothing lands exactly stacked.
 */
export function fanOutOffsets(
  count: number,
  cols = 3,
  stepX = 260,
  stepY = 220,
): Array<{ dx: number; dy: number }> {
  return Array.from({ length: count }, (_, i) => ({
    dx: (i % cols) * stepX,
    dy: Math.floor(i / cols) * stepY,
  }));
}

/** Is this (File-like) an image we can make an image card from? */
export function isImageFile(f: { type: string }): boolean {
  return f.type.startsWith('image/');
}

/** File extension for a stored rendition, from the MIME type. */
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
  };
  return map[mime] ?? 'bin';
}

/** Does an image of this size need a downscaled canvas rendition? */
export function needsDownscale(naturalW: number, naturalH: number): boolean {
  return Math.max(naturalW, naturalH) > IMAGE_MAX_RENDITION;
}
