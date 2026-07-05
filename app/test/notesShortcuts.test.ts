import { describe, it, expect } from 'vitest';
import {
  CONVERT_PROMPT_AT,
  detectMarkdownSentinel,
  extractTitleFromHtml,
  isTypingContext,
  plainTextLength,
  shouldOfferConvert,
} from '../src/lib/notesShortcuts';

describe('detectMarkdownSentinel', () => {
  it('matches the supported single-block sentinels', () => {
    expect(detectMarkdownSentinel('#')?.kind).toBe('h1');
    expect(detectMarkdownSentinel('##')?.kind).toBe('h2');
    expect(detectMarkdownSentinel('###')?.kind).toBe('h3');
    expect(detectMarkdownSentinel('-')?.kind).toBe('ul');
    expect(detectMarkdownSentinel('*')?.kind).toBe('ul');
    expect(detectMarkdownSentinel('1.')?.kind).toBe('ol');
    expect(detectMarkdownSentinel('>')?.kind).toBe('blockquote');
  });

  it('returns null for non-sentinel prefixes', () => {
    expect(detectMarkdownSentinel('')).toBeNull();
    expect(detectMarkdownSentinel('hello')).toBeNull();
    expect(detectMarkdownSentinel('# something')).toBeNull(); // trailing text disqualifies
    expect(detectMarkdownSentinel('####')).toBeNull(); // h4+ unsupported
    expect(detectMarkdownSentinel('2.')).toBeNull(); // only "1." triggers ol
  });
});

describe('extractTitleFromHtml', () => {
  it('prefers h1 over everything else', () => {
    expect(
      extractTitleFromHtml('<h1>The Bell</h1><p>Body text begins here.</p>'),
    ).toBe('The Bell');
  });

  it('falls back to h2 if no h1', () => {
    expect(extractTitleFromHtml('<h2>Section</h2><p>Body</p>')).toBe('Section');
  });

  it('falls back to leading bold if no headings', () => {
    expect(
      extractTitleFromHtml('<p><strong>Today: God\'s first miracle</strong></p><p>The body.</p>'),
    ).toBe("Today: God's first miracle");
  });

  it('falls back to the first sentence of plain text', () => {
    expect(
      extractTitleFromHtml('<p>The shepherd knows his sheep by name. Not by number.</p>'),
    ).toBe('The shepherd knows his sheep by name.');
  });

  it('truncates very long fallbacks', () => {
    const long = 'a'.repeat(200);
    const out = extractTitleFromHtml(`<p>${long}</p>`);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty for empty / whitespace HTML', () => {
    expect(extractTitleFromHtml('')).toBe('');
    expect(extractTitleFromHtml('<p>   </p>')).toBe('');
  });

  it('strips inline formatting from inside the heading', () => {
    expect(extractTitleFromHtml('<h1>Some <em>title</em> here</h1>')).toBe('Some title here');
  });
});

describe('isTypingContext', () => {
  it('is true for input, textarea, and select elements', () => {
    expect(isTypingContext(document.createElement('input'))).toBe(true);
    expect(isTypingContext(document.createElement('textarea'))).toBe(true);
    expect(isTypingContext(document.createElement('select'))).toBe(true);
  });

  it('is true for contentEditable elements', () => {
    // React's contentEditable prop renders as this attribute.
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isTypingContext(div)).toBe(true);
    const bare = document.createElement('div');
    bare.setAttribute('contenteditable', '');
    expect(isTypingContext(bare)).toBe(true);
    const off = document.createElement('div');
    off.setAttribute('contenteditable', 'false');
    expect(isTypingContext(off)).toBe(false);
  });

  it('is false for plain elements, document, and null', () => {
    expect(isTypingContext(document.createElement('div'))).toBe(false);
    expect(isTypingContext(document.createElement('button'))).toBe(false);
    expect(isTypingContext(document)).toBe(false);
    expect(isTypingContext(null)).toBe(false);
  });
});

describe('plainTextLength + shouldOfferConvert', () => {
  it('counts visible characters, not HTML tags', () => {
    expect(plainTextLength('<p>hello</p>')).toBe(5);
    expect(plainTextLength('<p><strong>hi</strong> there</p>')).toBe(8); // "hi there"
  });

  it('treats whitespace runs as single spaces', () => {
    expect(plainTextLength('<p>a  \n\nb</p>')).toBe(3); // "a b"
  });

  it('shouldOfferConvert respects the threshold and dismissal flag', () => {
    const short = '<p>short note</p>';
    const long = '<p>' + 'word '.repeat(100) + '</p>';   // ~500 chars
    expect(plainTextLength(long)).toBeGreaterThan(CONVERT_PROMPT_AT);
    expect(shouldOfferConvert(short, false)).toBe(false);
    expect(shouldOfferConvert(long, false)).toBe(true);
    expect(shouldOfferConvert(long, true)).toBe(false); // dismissed
  });
});
