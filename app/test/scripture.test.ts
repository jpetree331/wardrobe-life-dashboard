import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchScripture, TRANSLATIONS } from '../src/lib/scripture';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Reset fetch on each test.
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('TRANSLATIONS catalog', () => {
  it('exposes ESV as the only licensed entry', () => {
    const licensed = TRANSLATIONS.filter((t) => t.tier === 'licensed');
    expect(licensed.map((t) => t.value)).toEqual(['esv']);
  });

  it('includes the public-domain set the design specified', () => {
    const pub = TRANSLATIONS.filter((t) => t.tier === 'public').map((t) => t.value).sort();
    expect(pub).toEqual(['asv', 'bbe', 'darby', 'kjv', 'web', 'ylt']);
  });
});

describe('fetchScripture: public-domain translations', () => {
  it('hits bible-api.com for KJV with the right URL shape', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reference: 'Luke 24:13',
        translation_name: 'King James Version',
        verses: [
          { book_name: 'Luke', chapter: 24, verse: 13, text: 'And, behold, two of them…' },
        ],
      }),
    });
    const out = await fetchScripture('Luke 24:13', 'kjv');
    const callUrl = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(callUrl).toBe('https://bible-api.com/Luke%2024%3A13?translation=kjv');
    expect(out).toMatchObject({
      reference: 'Luke 24:13',
      translation: 'kjv',
      translationName: 'King James Version',
      source: expect.stringContaining('bible-api.com'),
    });
    expect(out.verses[0]).toEqual({
      book: 'Luke',
      chapter: 24,
      verse: 13,
      text: 'And, behold, two of them…',
    });
  });

  it('encodes complex references safely', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reference: '1 Corinthians 13:1-3', verses: [] }),
    });
    await fetchScripture('1 Corinthians 13:1-3', 'web');
    const url = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('1%20Corinthians%2013%3A1-3');
    expect(url).toContain('translation=web');
  });

  it('throws on non-OK responses', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchScripture('Bogus 99:99', 'kjv')).rejects.toThrow(/lookup failed/i);
  });

  it('trims whitespace from verse text', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reference: 'X',
        verses: [{ book_name: 'X', chapter: 1, verse: 1, text: '   padded text   \n' }],
      }),
    });
    const out = await fetchScripture('X 1:1', 'kjv');
    expect(out.verses[0].text).toBe('padded text');
  });

  it('falls back to translation code when translation_name is absent', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reference: 'X', verses: [] }),
    });
    const out = await fetchScripture('X 1:1', 'asv');
    expect(out.translationName).toBe('ASV');
  });

  it('handles empty verses array safely', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reference: 'X' }),
    });
    const out = await fetchScripture('X 1:1', 'kjv');
    expect(out.verses).toEqual([]);
  });
});

describe('fetchScripture: ESV (proxy)', () => {
  it('routes ESV through /api/scripture, never hitting bible-api.com', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reference: 'Luke 24:13',
        translation: 'esv',
        verses: [{ book: 'Luke', chapter: 24, verse: 13, text: 'That very day…' }],
        source: 'api.esv.org · ESV® Bible (Crossway)',
      }),
    });
    const out = await fetchScripture('Luke 24:13', 'esv');
    const url = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(url).toBe('/api/scripture?ref=Luke%2024%3A13&translation=esv');
    expect(url).not.toContain('bible-api.com');
    expect(out.translation).toBe('esv');
    expect(out.translationName).toBe('ESV');
    expect(out.verses).toHaveLength(1);
  });

  it('surfaces the proxy error body when ESV proxy returns non-OK', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'ESV_API_TOKEN not configured on the server' }),
    });
    await expect(fetchScripture('Luke 24:13', 'esv')).rejects.toThrow(/ESV_API_TOKEN/);
  });

  it('falls back to a generic message when proxy error body is unparseable', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('parse fail'); },
    });
    await expect(fetchScripture('Luke 24:13', 'esv')).rejects.toThrow(/502/);
  });
});
