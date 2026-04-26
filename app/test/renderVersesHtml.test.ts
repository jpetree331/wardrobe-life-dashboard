import { describe, it, expect } from 'vitest';
import { renderVersesHtml } from '../src/pages/Sanctuary';

describe('renderVersesHtml', () => {
  it('wraps each verse in an outer span with vnum + text', () => {
    const out = renderVersesHtml([
      { verse: 13, text: 'That very day two of them were going to a village.' },
    ]);
    expect(out).toContain('<span><span class="sa-vnum">13</span>That very day');
    expect(out.endsWith(' </span>')).toBe(true);
  });

  it('renders verses in order, separated', () => {
    const out = renderVersesHtml([
      { verse: 1, text: 'A' },
      { verse: 2, text: 'B' },
      { verse: 3, text: 'C' },
    ]);
    const order = ['1', '2', '3']
      .map((n) => out.indexOf(`>${n}</span>`))
      .filter((i) => i >= 0);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order).toHaveLength(3);
  });

  it('escapes HTML special characters in verse text', () => {
    const out = renderVersesHtml([
      { verse: 1, text: 'a < b & c > d "quoted"' },
    ]);
    expect(out).toContain('a &lt; b &amp; c &gt; d "quoted"');
    expect(out).not.toContain('a < b');
  });

  it('handles empty verse list cleanly', () => {
    expect(renderVersesHtml([])).toBe('');
  });

  it('tolerates verses with empty text', () => {
    const out = renderVersesHtml([{ verse: 7, text: '' }]);
    expect(out).toBe('<span><span class="sa-vnum">7</span> </span>');
  });

  it('treats null / undefined text as empty rather than crashing', () => {
    const out = renderVersesHtml([{ verse: 1, text: undefined as unknown as string }]);
    expect(out).toContain('<span class="sa-vnum">1</span>');
  });
});
