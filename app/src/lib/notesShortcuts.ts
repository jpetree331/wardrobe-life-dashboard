// Pure helpers for the Notes room's polish features. Keeping them out of the
// React component lets the markdown-shortcut detection and the title-from-HTML
// extraction get exercised by unit tests without standing up jsdom + a render.

export type SentinelAction =
  | { kind: 'h1' }
  | { kind: 'h2' }
  | { kind: 'h3' }
  | { kind: 'ul' }
  | { kind: 'ol' }
  | { kind: 'blockquote' };

/**
 * Map the text written at the start of a block to a markdown shortcut. The
 * caller passes the text from the block start up to the caret — if it
 * matches one of the supported sentinels, return the action; otherwise
 * null. Intentionally narrow: only single-line block-open sentinels.
 */
export function detectMarkdownSentinel(prefix: string): SentinelAction | null {
  const t = prefix;
  if (t === '#')   return { kind: 'h1' };
  if (t === '##')  return { kind: 'h2' };
  if (t === '###') return { kind: 'h3' };
  if (t === '-' || t === '*') return { kind: 'ul' };
  if (t === '1.')  return { kind: 'ol' };
  if (t === '>')   return { kind: 'blockquote' };
  return null;
}

/**
 * Pull a human-readable title from a Note's HTML body. Used by the
 * Note → Document conversion prompt.
 *
 * Order of preference:
 *   1. First <h1> text
 *   2. First <h2> text
 *   3. First <strong>/<b> text (often used as a manual title in plain notes)
 *   4. First sentence of plain text, capped at 80 chars
 */
export function extractTitleFromHtml(html: string): string {
  if (!html) return '';
  let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) return cleanInline(m[1]);
  m = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (m) return cleanInline(m[1]);
  m = html.match(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
  if (m) {
    const t = cleanInline(m[1]);
    if (t.length >= 3) return truncate(t, 80);
  }
  // First sentence of plain text.
  const plain = stripTags(html).trim();
  if (!plain) return '';
  const firstSentence = plain.split(/(?<=[.!?])\s+/)[0] || plain;
  return truncate(firstSentence, 80);
}

/** Stripped, plain-text length of an HTML body — the trigger metric for the conversion prompt. */
export function plainTextLength(html: string): number {
  return stripTags(html).trim().length;
}

/** Threshold the conversion prompt fires at — exposed for the test. */
export const CONVERT_PROMPT_AT = 320;

export function shouldOfferConvert(html: string, dismissed: boolean | undefined): boolean {
  if (dismissed) return false;
  return plainTextLength(html) > CONVERT_PROMPT_AT;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function cleanInline(s: string): string {
  return stripTags(s).trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}
