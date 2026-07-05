import { describe, it, expect } from 'vitest';
import { extractPalette, normalizeHex, rgbToHex } from '../src/lib/notesPalette';

function pixelBlock(rgb: [number, number, number], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rgb[0], rgb[1], rgb[2], 255);
  return out;
}

describe('rgbToHex / normalizeHex', () => {
  it('formats and clamps', () => {
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080');
    expect(rgbToHex(300, -5, 12.6)).toBe('#ff000d');
  });
  it('normalizes 3- and 6-digit hex with or without #', () => {
    expect(normalizeHex('#AbC')).toBe('#aabbcc');
    expect(normalizeHex('112233')).toBe('#112233');
    expect(normalizeHex(' #FF8800 ')).toBe('#ff8800');
    expect(normalizeHex('xyz')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('extractPalette', () => {
  it('finds the dominant colors of a two-color image', () => {
    const pixels = [
      ...pixelBlock([200, 40, 40], 300), // red-ish, dominant
      ...pixelBlock([40, 60, 200], 100), // blue-ish
    ];
    const palette = extractPalette(pixels, 2, 1);
    expect(palette).toHaveLength(2);
    // Dominant first.
    const [first, second] = palette;
    expect(first).toBe(rgbToHex(200, 40, 40));
    expect(second).toBe(rgbToHex(40, 60, 200));
  });

  it('skips transparent pixels', () => {
    const opaque = pixelBlock([10, 200, 10], 50);
    const transparent = [255, 0, 0, 0, 255, 0, 0, 0]; // alpha 0
    const palette = extractPalette([...transparent, ...opaque], 1, 1);
    expect(palette).toEqual([rgbToHex(10, 200, 10)]);
  });

  it('caps the count and tolerates tiny inputs', () => {
    expect(extractPalette(pixelBlock([5, 5, 5], 1), 5, 1).length).toBeLessThanOrEqual(5);
    expect(extractPalette([], 5)).toEqual([]);
  });

  it('returns distinct-ish colors for a mixed image', () => {
    const pixels = [
      ...pixelBlock([250, 250, 250], 100),
      ...pixelBlock([10, 10, 10], 100),
      ...pixelBlock([200, 30, 30], 100),
      ...pixelBlock([30, 200, 30], 100),
      ...pixelBlock([30, 30, 200], 100),
    ];
    const palette = extractPalette(pixels, 5, 1);
    expect(new Set(palette).size).toBe(palette.length);
    expect(palette.length).toBe(5);
  });
});
