// Pure aggregation helpers for the Writing-stats panel in the Data room.
//
// Strips Sanctuary's HTML bodies down to plain text, counts words,
// tokenizes for top-N frequency, and rolls up per-date / per-month
// totals. No React, no Supabase — everything in here is a pure function
// over a `{ id, entry_date, title, body }` shape, so it's all unit
// testable in isolation.

export type EntryLike = {
  id: string;
  entry_date: string;     // YYYY-MM-DD
  title: string | null;
  body: string;           // HTML
};

// ── HTML → text ──────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode the small handful of entities the Sanctuary
 * editor actually emits (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`,
 * `&#NNN;`, `&#xHEX;`). Collapses whitespace to single spaces.
 *
 * Regex-based so it's pure JS and runs the same in node tests and in the
 * browser. Sanctuary's editor produces a very narrow subset of HTML
 * (block-level wrappers, <br>, <span> for verse-num/red-letter/highlight),
 * not arbitrary user-supplied HTML, so a regex stripper is safe here.
 * Don't reuse this for sanitization.
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  let t = html;
  // <br> and block breaks → space (so words separated only by a tag
  // boundary don't merge into one).
  t = t.replace(/<\s*br\s*\/?\s*>/gi, ' ');
  t = t.replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)\s*>/gi, ' ');
  // Strip the rest of the tags.
  t = t.replace(/<[^>]+>/g, '');
  // Decode entities.
  t = t.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/g, "'")
       .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
       .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  // Collapse runs of whitespace.
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// ── Word count ───────────────────────────────────────────────────────

/**
 * Count words in a plain-text string. "Word" = a run of letters /
 * digits / apostrophes / hyphens — so "isn't" and "well-being" count
 * as one each. Empty input → 0.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const m = text.match(/[A-Za-z0-9À-ɏ][A-Za-z0-9'’À-ɏ-]*/g);
  return m ? m.length : 0;
}

/** Convenience: strip HTML then count words. */
export function wordsInEntry(entry: EntryLike): number {
  return countWords(stripHtmlToText(entry.body));
}

// ── Tokenizer + stopwords ────────────────────────────────────────────

/**
 * Tokenize text for frequency analysis. Lowercased, punctuation
 * stripped, contractions kept whole ("isn't" stays one token). Returns
 * an array preserving order so callers can do bigram analysis later if
 * we ever add it.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const re = /[A-Za-z0-9À-ɏ][A-Za-z0-9'’À-ɏ-]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Normalize curly apostrophe to straight for stable stopword matching.
    const w = m[0].toLowerCase().replace(/’/g, "'");
    tokens.push(w);
  }
  return tokens;
}

/**
 * Default English stopword set. Includes the usual suspects (the / and /
 * of / to / a / in / that / I / etc.), plus common contractions, plus
 * a handful of biblical / devotional filler words ("thee" / "thou" can
 * be informative so they're NOT here, but generic Christian markers
 * like "lord" are kept because the user may legitimately want to track
 * how often they appeal to that). The toggle in the UI flips this on
 * and off.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // articles / determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
  'her', 'its', 'our', 'their', 'some', 'any', 'no', 'every', 'all', 'each',
  'much', 'many', 'few', 'such', 'one', 'two', 'three',
  // prepositions
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'about', 'as',
  'into', 'over', 'under', 'after', 'before', 'between', 'through', 'during',
  'against', 'without', 'within', 'across', 'around', 'up', 'down', 'out',
  'off', 'than', 'until',
  // pronouns
  'i', 'me', 'we', 'us', 'you', 'he', 'she', 'it', 'they', 'them',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves',
  'themselves', 'who', 'whom', 'whose', 'which', 'what',
  // verbs (auxiliary + common)
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'get', 'got', 'gets', 'getting',
  'go', 'goes', 'went', 'going', 'gone',
  'make', 'makes', 'made', 'making',
  // conjunctions / connectives
  'and', 'or', 'but', 'so', 'if', 'because', 'while', 'though', 'although',
  'when', 'where', 'why', 'how', 'then', 'else', 'either', 'neither',
  // contractions (after our apostrophe normalization)
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
  "i've", "you've", "we've", "they've",
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
  "isn't", "aren't", "wasn't", "weren't",
  "don't", "doesn't", "didn't",
  "won't", "wouldn't", "shouldn't", "couldn't", "can't", "cannot", "mustn't",
  "hasn't", "haven't", "hadn't", "that's", "there's", "here's", "what's",
  // misc filler
  'just', 'also', 'very', 'really', 'even', 'still', 'only', 'too', 'so',
  'not', 'now', 'today', 'yesterday', 'tomorrow', 'yes', 'no',
  'thing', 'things', 'something', 'someone', 'somewhere', 'anything',
  'anyone', 'nothing', 'everything', 'everyone',
  // dates / numbers commonly typed
  'first', 'second', 'last', 'next',
]);

// ── Top words across many entries ────────────────────────────────────

export type TopWord = {
  word: string;
  count: number;
};

/**
 * Compute the top N most-frequent words across all entries. Walks every
 * entry's body once; case-insensitive; uses the curated stopword set
 * when `excludeStopwords` is true.
 *
 * Ties are broken by alphabetical order so the result is deterministic
 * — important for tests and for stable rendering between renders.
 */
export function topWords(
  entries: EntryLike[],
  opts: { topN?: number; excludeStopwords?: boolean; minLength?: number } = {},
): TopWord[] {
  const topN = opts.topN ?? 10;
  const excludeStopwords = opts.excludeStopwords ?? true;
  const minLength = opts.minLength ?? 2;
  const counts = new Map<string, number>();
  for (const e of entries) {
    const text = stripHtmlToText(e.body);
    for (const tok of tokenize(text)) {
      if (tok.length < minLength) continue;
      if (excludeStopwords && STOPWORDS.has(tok)) continue;
      counts.set(tok, (counts.get(tok) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── By-date / by-month rollups ───────────────────────────────────────

export type DateWordTotal = {
  date: string;          // YYYY-MM-DD
  words: number;
  entries: number;
};

/**
 * Map each YYYY-MM-DD with at least one entry to its summed word count
 * and entry count. If the user wrote two entries on the same day, both
 * counts add to the total.
 */
export function wordsByDate(entries: EntryLike[]): Map<string, DateWordTotal> {
  const m = new Map<string, DateWordTotal>();
  for (const e of entries) {
    const words = wordsInEntry(e);
    const prev = m.get(e.entry_date);
    if (prev) {
      prev.words += words;
      prev.entries += 1;
    } else {
      m.set(e.entry_date, { date: e.entry_date, words, entries: 1 });
    }
  }
  return m;
}

/**
 * Per-month word totals for a year: 12 numbers (Jan..Dec). Entries
 * outside the year are silently ignored.
 */
export function monthlyWordTotals(entries: EntryLike[], year: number): number[] {
  const out = new Array<number>(12).fill(0);
  const yearPrefix = `${year}-`;
  for (const e of entries) {
    if (!e.entry_date.startsWith(yearPrefix)) continue;
    const monthIdx = parseInt(e.entry_date.slice(5, 7), 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) continue;
    out[monthIdx] += wordsInEntry(e);
  }
  return out;
}

// ── Per-entry stats (table rows) ─────────────────────────────────────

export type EntryStat = {
  id: string;
  entry_date: string;
  title: string;
  words: number;
};

/**
 * One row per entry, with computed word count. Stable: title falls back
 * to "(untitled)" if blank. Caller decides sort order.
 */
export function perEntryStats(entries: EntryLike[]): EntryStat[] {
  return entries.map((e) => ({
    id: e.id,
    entry_date: e.entry_date,
    title: (e.title || '').trim() || '(untitled)',
    words: wordsInEntry(e),
  }));
}

// ── Headline summary ─────────────────────────────────────────────────

export type WritingSummary = {
  entryCount: number;
  totalWords: number;
  avgWords: number;           // rounded to nearest int
  longestEntry: { id: string; title: string; words: number; entry_date: string } | null;
  daysWritten: number;        // distinct YYYY-MM-DD with at least one entry
  thisYearEntries: number;
  thisYearWords: number;
};

export function writingSummary(entries: EntryLike[], year: number): WritingSummary {
  const stats = perEntryStats(entries);
  const totalWords = stats.reduce((s, r) => s + r.words, 0);
  const entryCount = stats.length;
  const avgWords = entryCount > 0 ? Math.round(totalWords / entryCount) : 0;
  let longest: WritingSummary['longestEntry'] = null;
  for (const r of stats) {
    if (!longest || r.words > longest.words) {
      longest = { id: r.id, title: r.title, words: r.words, entry_date: r.entry_date };
    }
  }
  const days = new Set<string>();
  let thisYearEntries = 0;
  let thisYearWords = 0;
  const yearPrefix = `${year}-`;
  for (const r of stats) {
    days.add(r.entry_date);
    if (r.entry_date.startsWith(yearPrefix)) {
      thisYearEntries++;
      thisYearWords += r.words;
    }
  }
  return {
    entryCount,
    totalWords,
    avgWords,
    longestEntry: longest,
    daysWritten: days.size,
    thisYearEntries,
    thisYearWords,
  };
}
