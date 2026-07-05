import { describe, it, expect } from 'vitest';
import {
  aspectResize,
  extFromMime,
  fanOutOffsets,
  fitWithin,
  IMAGE_CARD_MAX_H,
  IMAGE_CARD_MAX_W,
  IMAGE_MIN_W,
  initialCardSize,
  isImageFile,
  needsDownscale,
} from '../src/lib/notesImages';

describe('fitWithin', () => {
  it('scales down preserving aspect', () => {
    expect(fitWithin(1000, 500, 100, 100)).toEqual({ w: 100, h: 50 });
    expect(fitWithin(500, 1000, 100, 100)).toEqual({ w: 50, h: 100 });
  });
  it('never upscales', () => {
    expect(fitWithin(50, 25, 100, 100)).toEqual({ w: 50, h: 25 });
  });
  it('tolerates degenerate input', () => {
    expect(fitWithin(0, 0, 100, 80)).toEqual({ w: 100, h: 80 });
  });
});

describe('initialCardSize', () => {
  it('fits large photos inside the card maximum', () => {
    const { w, h } = initialCardSize(6000, 4000);
    expect(w).toBeLessThanOrEqual(IMAGE_CARD_MAX_W);
    expect(h).toBeLessThanOrEqual(IMAGE_CARD_MAX_H);
    expect(w / h).toBeCloseTo(1.5, 1);
  });
  it('keeps small images at natural size', () => {
    expect(initialCardSize(200, 100)).toEqual({ w: 200, h: 100 });
  });
});

describe('aspectResize', () => {
  it('locks height to the aspect ratio', () => {
    const r = aspectResize(200, 100, 2); // aspect 2:1
    expect(r).toEqual({ w: 300, h: 150 });
  });
  it('enforces the minimum width', () => {
    const r = aspectResize(200, -500, 1);
    expect(r.w).toBe(IMAGE_MIN_W);
    expect(r.h).toBe(IMAGE_MIN_W);
  });
  it('guards against a broken aspect', () => {
    const r = aspectResize(200, 0, 0);
    expect(r.h).toBe(r.w); // falls back to square
  });
});

describe('fanOutOffsets', () => {
  it('flows right then wraps into rows', () => {
    const offs = fanOutOffsets(5, 3, 260, 220);
    expect(offs[0]).toEqual({ dx: 0, dy: 0 });
    expect(offs[2]).toEqual({ dx: 520, dy: 0 });
    expect(offs[3]).toEqual({ dx: 0, dy: 220 });
    expect(offs[4]).toEqual({ dx: 260, dy: 220 });
  });
  it('produces unique positions (no stacking)', () => {
    const offs = fanOutOffsets(9);
    const keys = new Set(offs.map((o) => `${o.dx},${o.dy}`));
    expect(keys.size).toBe(9);
  });
});

describe('file classification helpers', () => {
  it('isImageFile checks the MIME prefix', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/svg+xml' })).toBe(true);
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
  it('extFromMime maps common types and falls back to bin', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg');
    expect(extFromMime('image/png')).toBe('png');
    expect(extFromMime('image/x-unknown')).toBe('bin');
  });
  it('needsDownscale triggers past the rendition cap', () => {
    expect(needsDownscale(6000, 100)).toBe(true);
    expect(needsDownscale(1600, 1600)).toBe(false);
    expect(needsDownscale(800, 601)).toBe(false);
  });
});
