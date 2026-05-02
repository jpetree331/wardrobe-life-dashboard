// Parse Bible references like "Luke 24:13–35", "Romans 8", "Ps. 23:1-3"
// into structured form. Used to feed Sanctuary's `scripture_refs` (free-text
// strings the user typed) into the Data tracker as scripture_reads.
//
// Permissive on input: accepts hyphen-minus, en-dash, em-dash, and dot or
// colon as separators; tolerates spaces; resolves common book abbreviations
// to canonical names. Returns null on unparseable input rather than
// throwing — Sanctuary refs are user-typed and may have typos.

import { BIBLE_BOOKS } from './bibleVerseCounts';

export type ParsedBibleRef = {
  book: string;          // canonical book name
  chapter: number;
  verseFrom?: number;    // inclusive, undefined = whole chapter
  verseTo?: number;      // inclusive
};

// Common abbreviations → canonical name. Lowercase keys; exact match after
// trimming punctuation.
const ABBREVIATIONS: Record<string, string> = {
  'gen': 'Genesis', 'gn': 'Genesis',
  'ex': 'Exodus', 'exo': 'Exodus', 'exod': 'Exodus',
  'lev': 'Leviticus', 'lv': 'Leviticus',
  'num': 'Numbers', 'nm': 'Numbers',
  'deut': 'Deuteronomy', 'dt': 'Deuteronomy',
  'josh': 'Joshua', 'jos': 'Joshua',
  'judg': 'Judges', 'jdg': 'Judges', 'jgs': 'Judges',
  'rt': 'Ruth',
  '1 sam': '1 Samuel', '1sam': '1 Samuel', 'i sam': '1 Samuel', '1 sm': '1 Samuel',
  '2 sam': '2 Samuel', '2sam': '2 Samuel', 'ii sam': '2 Samuel', '2 sm': '2 Samuel',
  '1 kgs': '1 Kings', '1 kings': '1 Kings', '1kgs': '1 Kings', 'i kgs': '1 Kings',
  '2 kgs': '2 Kings', '2 kings': '2 Kings', '2kgs': '2 Kings', 'ii kgs': '2 Kings',
  '1 chr': '1 Chronicles', '1 chron': '1 Chronicles', '1chr': '1 Chronicles',
  '2 chr': '2 Chronicles', '2 chron': '2 Chronicles', '2chr': '2 Chronicles',
  'ezr': 'Ezra',
  'neh': 'Nehemiah', 'ne': 'Nehemiah',
  'est': 'Esther', 'esth': 'Esther',
  'jb': 'Job',
  'ps': 'Psalms', 'psa': 'Psalms', 'pss': 'Psalms', 'psalm': 'Psalms',
  'prov': 'Proverbs', 'prv': 'Proverbs', 'pr': 'Proverbs',
  'eccl': 'Ecclesiastes', 'ecc': 'Ecclesiastes', 'qoh': 'Ecclesiastes',
  'song': 'Song of Solomon', 'sos': 'Song of Solomon', 'sg': 'Song of Solomon',
    'cant': 'Song of Solomon', 'song of songs': 'Song of Solomon',
  'isa': 'Isaiah', 'is': 'Isaiah',
  'jer': 'Jeremiah', 'je': 'Jeremiah',
  'lam': 'Lamentations',
  'ezek': 'Ezekiel', 'ez': 'Ezekiel',
  'dan': 'Daniel', 'dn': 'Daniel',
  'hos': 'Hosea',
  'jl': 'Joel',
  'am': 'Amos',
  'obad': 'Obadiah', 'ob': 'Obadiah',
  'jon': 'Jonah',
  'mic': 'Micah', 'mi': 'Micah',
  'nah': 'Nahum', 'na': 'Nahum',
  'hab': 'Habakkuk', 'hb': 'Habakkuk',
  'zeph': 'Zephaniah', 'zep': 'Zephaniah', 'zph': 'Zephaniah',
  'hag': 'Haggai', 'hg': 'Haggai',
  'zech': 'Zechariah', 'zec': 'Zechariah', 'zch': 'Zechariah',
  'mal': 'Malachi',

  'mt': 'Matthew', 'matt': 'Matthew',
  'mk': 'Mark', 'mrk': 'Mark',
  'lk': 'Luke', 'luk': 'Luke',
  'jn': 'John', 'jhn': 'John',
  'ac': 'Acts', 'acts': 'Acts',
  'rom': 'Romans', 'ro': 'Romans',
  '1 cor': '1 Corinthians', '1 co': '1 Corinthians', '1cor': '1 Corinthians',
  '2 cor': '2 Corinthians', '2 co': '2 Corinthians', '2cor': '2 Corinthians',
  'gal': 'Galatians',
  'eph': 'Ephesians',
  'phil': 'Philippians', 'php': 'Philippians', 'pp': 'Philippians',
  'col': 'Colossians',
  '1 thess': '1 Thessalonians', '1 thes': '1 Thessalonians', '1 th': '1 Thessalonians',
  '2 thess': '2 Thessalonians', '2 thes': '2 Thessalonians', '2 th': '2 Thessalonians',
  '1 tim': '1 Timothy', '1 tm': '1 Timothy',
  '2 tim': '2 Timothy', '2 tm': '2 Timothy',
  'tit': 'Titus',
  'philem': 'Philemon', 'phm': 'Philemon', 'phlm': 'Philemon',
  'heb': 'Hebrews',
  'jas': 'James', 'jm': 'James',
  '1 pet': '1 Peter', '1 pt': '1 Peter', '1pet': '1 Peter',
  '2 pet': '2 Peter', '2 pt': '2 Peter', '2pet': '2 Peter',
  '1 jn': '1 John', '1 jhn': '1 John', '1jn': '1 John', 'i jn': '1 John',
  '2 jn': '2 John', '2 jhn': '2 John', '2jn': '2 John', 'ii jn': '2 John',
  '3 jn': '3 John', '3 jhn': '3 John', '3jn': '3 John', 'iii jn': '3 John',
  'jude': 'Jude', 'jud': 'Jude',
  'rev': 'Revelation', 'rv': 'Revelation', 'apoc': 'Revelation',
};

/** Build a lookup of canonical-book lowercased → canonical for fast match. */
const CANONICAL_LOWER: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const b of BIBLE_BOOKS) map[b.toLowerCase()] = b;
  return map;
})();

/**
 * Resolve a book token to its canonical name. Accepts the canonical form
 * (case-insensitive), any abbreviation in the table, and shapes like
 * "1Cor" / "I Cor" / "1.Cor" / "Phil." (trailing punctuation).
 * Returns null on no match.
 */
export function resolveBookName(input: string): string | null {
  if (!input) return null;
  const cleaned = input
    .trim()
    .replace(/\.$/, '')
    .replace(/\.\s*/g, ' ')      // "Sg." → "Sg" already handled; "Phil. of" → "Phil of"
    .replace(/^I\s+/i, '1 ')     // "I Sam" → "1 Sam"
    .replace(/^II\s+/i, '2 ')
    .replace(/^III\s+/i, '3 ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (CANONICAL_LOWER[cleaned]) return CANONICAL_LOWER[cleaned];
  if (ABBREVIATIONS[cleaned]) return ABBREVIATIONS[cleaned];
  // Try without spaces ("1cor" → ABBREVIATIONS lookup)
  const compact = cleaned.replace(/\s+/g, '');
  if (ABBREVIATIONS[compact]) return ABBREVIATIONS[compact];
  return null;
}

/**
 * Parse a single reference string into a structured form. The string may
 * span multiple chapters or verses; if it's a multi-chapter range we keep
 * just the first chapter (and treat the rest as "whole chapter" — Sanctuary
 * tags rarely span chapters and we don't want to over-engineer).
 *
 * Examples that parse:
 *   "Luke 24:13-35"    → { book:'Luke', chapter:24, verseFrom:13, verseTo:35 }
 *   "Luke 24:13–35"    (en-dash)
 *   "Luke 24:13—35"    (em-dash)
 *   "Romans 8"         → { book:'Romans', chapter:8 }
 *   "Ps 23:1"          → { book:'Psalms', chapter:23, verseFrom:1, verseTo:1 }
 *   "Genesis 1:1"      → { book:'Genesis', chapter:1, verseFrom:1, verseTo:1 }
 *   "1 Cor 13"         → { book:'1 Corinthians', chapter:13 }
 *   "Heb. 11:1-3"
 */
export function parseBibleRef(input: string): ParsedBibleRef | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Match: optional book-number prefix + book token + chapter[:verses]
  // Book token is letters / spaces / dots / commas; chapter follows the
  // last sequence that isn't part of the book name.
  // Pattern: `(book) (chapter)(:verses)?`
  const m = trimmed.match(
    /^\s*(\d?\s*[A-Za-z][A-Za-z\s.]*?)\s+(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[–—\-]\s*(\d+))?)?\s*$/,
  );
  if (!m) return null;
  const [, bookRaw, chapterRaw, vFromRaw, vToRaw] = m;
  const book = resolveBookName(bookRaw);
  if (!book) return null;
  const chapter = Number(chapterRaw);
  if (!Number.isInteger(chapter) || chapter < 1) return null;
  const verseFrom = vFromRaw ? Number(vFromRaw) : undefined;
  const verseTo = vToRaw ? Number(vToRaw) : verseFrom; // single verse → from===to
  if (verseFrom !== undefined && verseFrom < 1) return null;
  if (verseTo !== undefined && verseTo < (verseFrom ?? 1)) return null;
  return {
    book,
    chapter,
    ...(verseFrom !== undefined ? { verseFrom } : {}),
    ...(verseTo !== undefined ? { verseTo } : {}),
  };
}

/**
 * Parse a comma-or-semicolon-separated list of refs, dropping any that
 * fail to parse. Useful for legacy free-text fields.
 */
export function parseBibleRefList(input: string): ParsedBibleRef[] {
  if (!input) return [];
  const out: ParsedBibleRef[] = [];
  for (const piece of input.split(/[,;]\s*/)) {
    const parsed = parseBibleRef(piece);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Verses-read count for a single parsed ref. Returns the verse count of
 * the chapter if no range was given, or (verseTo - verseFrom + 1) if a
 * range was specified.
 *
 * Caller passes a verseCount lookup so this stays a pure function.
 */
export function versesIn(ref: ParsedBibleRef, lookupVerseCount: (book: string, chapter: number) => number): number {
  if (ref.verseFrom !== undefined && ref.verseTo !== undefined) {
    return Math.max(0, ref.verseTo - ref.verseFrom + 1);
  }
  return lookupVerseCount(ref.book, ref.chapter);
}
