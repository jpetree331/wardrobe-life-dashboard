// Unified paste/drop routing for the Notes canvas — Milanote's "just
// paste it" layer. Pure classification + serialization; the DOM/Supabase
// side lives in Notes.tsx. Unit-tested.

import type { Card, CardType, SwatchKey } from './notes';

/** Plain-text length above which pasted text becomes a Document. */
export const NOTE_TO_DOC_AT = 600;

/** Internal clipboard MIME for copying cards between boards. */
export const INTERNAL_MIME = 'application/x-wardrobe-cards';

// ── Classification ──────────────────────────────────────────────────────

export type ClipboardClassification =
  | { kind: 'files' }
  | { kind: 'url'; url: string }
  | { kind: 'html-note'; html: string }
  | { kind: 'html-document'; html: string }
  | { kind: 'note-text'; text: string }
  | { kind: 'document-text'; text: string }
  | { kind: 'none' };

function isBareUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t) || !/^https?:\/\//i.test(t)) return false;
  try {
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

/** Does the HTML carry real formatting (vs. a plain-text wrapper)? */
export function hasRichMarkup(html: string): boolean {
  if (!html) return false;
  if (/<(b|strong|i|em|u|s|a|h[1-6]|ul|ol|li|blockquote|code|pre|table|img)\b/i.test(html)) return true;
  // More than one paragraph/div also counts as structure.
  const blocks = html.match(/<(p|div)\b/gi);
  return (blocks?.length ?? 0) > 1;
}

function plainLen(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length;
}

/**
 * Route clipboard/drop content to a card intent. Precedence mirrors
 * Milanote: files (richest) → bare URL → rich HTML → plain text, with
 * long text upgrading to a Document.
 */
export function classifyClipboard(input: {
  fileCount: number;
  text: string;
  html: string;
}): ClipboardClassification {
  if (input.fileCount > 0) return { kind: 'files' };
  const text = input.text ?? '';
  if (isBareUrl(text)) return { kind: 'url', url: text.trim() };
  const html = input.html ?? '';
  if (hasRichMarkup(html)) {
    return plainLen(text || html.replace(/<[^>]+>/g, ' ')) > NOTE_TO_DOC_AT
      ? { kind: 'html-document', html }
      : { kind: 'html-note', html };
  }
  if (plainLen(text) > 0) {
    return plainLen(text) > NOTE_TO_DOC_AT
      ? { kind: 'document-text', text }
      : { kind: 'note-text', text };
  }
  return { kind: 'none' };
}

// ── HTML sanitize / text conversion ─────────────────────────────────────

/**
 * Sanitize a pasted HTML fragment: strip scripts/styles/comments/wrapper
 * tags and ALL attributes except safe http(s)/mailto hrefs.
 */
export function sanitizeHtmlFragment(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|head|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(html|body|meta|link|base|form|input|button)\b[^>]*>/gi, '');
  s = s.replace(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, slash, tag, attrs: string) => {
    if (slash) return `</${tag}>`;
    let keep = '';
    if (tag.toLowerCase() === 'a') {
      const href = attrs.match(/href\s*=\s*("[^"]*"|'[^']*')/i)?.[1];
      if (href && /^["'](https?:|mailto:)/i.test(href)) keep = ` href=${href}`;
    }
    return `<${tag}${keep}>`;
  });
  return s.trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text → note HTML: one <p> per paragraph, <br> for single breaks. */
export function textToNoteHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return paragraphs
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Long pasted text → document title (first line) + body HTML (rest). */
export function splitTitleBody(text: string): { title: string; bodyHtml: string } {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const firstBreak = normalized.indexOf('\n');
  const first = (firstBreak === -1 ? normalized : normalized.slice(0, firstBreak)).trim();
  const rest = firstBreak === -1 ? '' : normalized.slice(firstBreak + 1).trim();
  const title = first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first;
  // A too-long first line stays part of the body so nothing is lost.
  const bodyText = first.length > 80 ? normalized : rest || normalized;
  return { title: title || 'Untitled document', bodyHtml: textToNoteHtml(bodyText) };
}

// ── Internal card serialization (cross-board copy/paste) ───────────────

export type SerializedMember = {
  type: CardType;
  w: number | null;
  h: number | null;
  color: SwatchKey;
  payload: unknown;
};

export type SerializedItem = SerializedMember & {
  dx: number;
  dy: number;
  members?: SerializedMember[]; // columns carry their contents
};

export type SerializedCards = {
  kind: 'wardrobe-cards';
  v: 1;
  items: SerializedItem[];
};

/**
 * Serialize cards (with column contents) relative to their bounding-box
 * origin, so a paste can lay them out faithfully anywhere.
 */
export function serializeCards(
  cards: Card[],
  membersOf: (columnId: string) => Card[],
): SerializedCards {
  let minX = Infinity;
  let minY = Infinity;
  for (const c of cards) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
  }
  const toMember = (c: Card): SerializedMember => ({
    type: c.type,
    w: c.w,
    h: c.h,
    color: c.color,
    payload: c.payload,
  });
  return {
    kind: 'wardrobe-cards',
    v: 1,
    items: cards.map((c, i) => ({
      ...toMember(c),
      // Cards living inside a column have no meaningful x/y — stagger.
      dx: c.parent_column ? i * 24 : c.x - minX,
      dy: c.parent_column ? i * 24 : c.y - minY,
      members: c.type === 'column' ? membersOf(c.id).map(toMember) : undefined,
    })),
  };
}

export function parseSerializedCards(raw: string): SerializedCards | null {
  try {
    const data = JSON.parse(raw) as SerializedCards;
    if (data?.kind !== 'wardrobe-cards' || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Human-readable fallback for pasting into other apps. */
export function cardsPlainTextDigest(
  cards: Card[],
  membersOf: (columnId: string) => Card[],
): string {
  const strip = (html: unknown) =>
    typeof html === 'string' ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const one = (c: Card): string => {
    const p = c.payload as Record<string, any>;
    switch (c.type) {
      case 'note':
      case 'heading':  return strip(p.body);
      case 'todo':     return [p.title, ...((p.items ?? []) as Array<{ text: string; done: boolean }>).map((it) => `${it.done ? '[x]' : '[ ]'} ${it.text}`)].filter(Boolean).join('\n');
      case 'link':     return [p.title, p.url].filter(Boolean).join(' — ');
      case 'document': return [p.title, strip(p.body)].filter(Boolean).join('\n');
      case 'image':    return p.caption || '(image)';
      case 'file':     return p.filename || '(file)';
      case 'swatch':   return [p.label, p.hex].filter(Boolean).join(' ');
      case 'comment':  return p.body || '';
      case 'column':   return [p.title, ...membersOf(c.id).map(one)].filter(Boolean).join('\n');
      default:         return '';
    }
  };
  return cards.map(one).filter(Boolean).join('\n\n');
}
