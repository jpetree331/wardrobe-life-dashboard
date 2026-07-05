// Pure palette extraction for the image-card "extract palette" action:
// a simple median-cut over RGBA pixel data. Deliberately basic — 5 good
// colors from a moodboard photo, not a color-science library.

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Normalize '#abc', 'ABC123', '#AABBCC' → '#aabbcc'; null if invalid. */
export function normalizeHex(input: string): string | null {
  const t = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) {
    return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  return null;
}

type Px = [number, number, number];

/**
 * Median-cut palette from RGBA pixel data (as returned by
 * ImageData.data). Transparent pixels are skipped; pixels are sampled
 * with a stride for speed. Returns up to `count` hex colors ordered by
 * bucket population (most dominant first).
 */
export function extractPalette(
  pixels: Uint8ClampedArray | number[],
  count = 5,
  sampleStride = 4, // sample every Nth pixel
): string[] {
  const px: Px[] = [];
  const step = 4 * Math.max(1, sampleStride);
  for (let i = 0; i + 3 < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue; // skip transparent
    px.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (px.length === 0) return [];

  let boxes: Px[][] = [px];
  while (boxes.length < count) {
    // Split the most populous box along its widest channel.
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.shift()!;
    if (box.length < 2) {
      boxes.push(box);
      break;
    }
    let widest = 0;
    let range = -1;
    for (let ch = 0; ch < 3; ch++) {
      let min = 255, max = 0;
      for (const p of box) {
        if (p[ch] < min) min = p[ch];
        if (p[ch] > max) max = p[ch];
      }
      if (max - min > range) {
        range = max - min;
        widest = ch;
      }
    }
    box.sort((a, b) => a[widest] - b[widest]);
    // Split at the midpoint of the VALUE range (separates distinct color
    // clusters cleanly); fall back to the positional median when one side
    // would be empty (i.e. the box is a single tight cluster).
    let min = 255, max = 0;
    for (const p of box) {
      if (p[widest] < min) min = p[widest];
      if (p[widest] > max) max = p[widest];
    }
    const threshold = (min + max) / 2;
    let splitAt = box.findIndex((p) => p[widest] > threshold);
    if (splitAt <= 0 || splitAt >= box.length) splitAt = box.length >> 1;
    boxes.push(box.slice(0, splitAt), box.slice(splitAt));
  }

  boxes.sort((a, b) => b.length - a.length);
  return boxes.slice(0, count).map((box) => {
    let r = 0, g = 0, b = 0;
    for (const p of box) {
      r += p[0];
      g += p[1];
      b += p[2];
    }
    return rgbToHex(r / box.length, g / box.length, b / box.length);
  });
}
