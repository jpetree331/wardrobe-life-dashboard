// Pure helpers for the Notes room's polish features. Keeping them out of the
// React component lets the markdown-shortcut detection and the title-from-HTML
// extraction get exercised by unit tests without standing up jsdom + a render.

// NOTE: the manual markdown-sentinel detection that used to live here was
// retired in Sprint 12 — TipTap's input rules own #/##/###/-/*/1./> (plus
// **bold**, *italic*, ~~strike~~, `code`, ```, and [ ] tasks) now.

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

/**
 * True when a keyboard event's target is a text-entry context — an input,
 * textarea, select, or any contentEditable element. Global canvas shortcuts
 * (nudge, delete, zoom, select-all…) must not fire while the user is typing.
 * Centralized here so every keyboard feature shares one definition.
 */
export function isTypingContext(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  // Fallback for environments where isContentEditable isn't implemented
  // (jsdom): inspect the attribute directly.
  const ce = el.getAttribute?.('contenteditable');
  return ce === '' || ce === 'true' || ce === 'plaintext-only';
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
