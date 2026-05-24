// Goodreads CSV importer — pure, side-effect-free helpers. Parses the
// standard `goodreads_library_export.csv` shape and maps it into rows
// shaped for `data_book_reads`. The UI calls these from a modal; the
// parser is also unit-tested in isolation.
//
// Goodreads export columns (the ones we care about):
//   Title · Author · Number of Pages · My Rating (0..5) · Date Read
//   Date Added · Exclusive Shelf · My Review · Read Count
//
// We import only `Exclusive Shelf == "read"`. Books without a Date Read
// fall back to Date Added — the alternative is silently dropping them.
// HTML in reviews is normalized: `<br/>` → newline, other tags stripped.

/** Cleaned, ready-to-insert candidate. Maps 1-1 onto createBookRead's input. */
export type GoodreadsBookCandidate = {
  finished_on: string;          // 'YYYY-MM-DD'
  title: string;
  author: string;
  pages: number;                // 0 if unknown
  rating: 0 | 1 | 2 | 3 | 4 | 5;
  review: string | null;
  /** True when finished_on came from "Date Added" (no explicit Date Read). */
  dateFallback: boolean;
  /** Goodreads' Read Count — surfaced for the preview only, not stored. */
  readCount: number;
};

/** Aggregate stats shown to the user before they confirm. */
export type GoodreadsImportPreview = {
  candidates: GoodreadsBookCandidate[];
  /** Books on shelves we ignore: 'to-read', 'currently-reading', etc. */
  skippedNonRead: number;
  /** Per-shelf breakdown for the skipped count. */
  shelfBreakdown: Record<string, number>;
  /** Books with no Date Read where we fell back to Date Added. */
  dateFallbackCount: number;
  /** Books with no page count — will need editing after import. */
  missingPagesCount: number;
  /** Books where Read Count > 1 (Goodreads doesn't store the older dates). */
  reReadCount: number;
};

// ── CSV parsing ───────────────────────────────────────────────────────
// Goodreads' CSV is well-formed: comma-separated, double-quote-wrapped
// fields when they contain commas/newlines/quotes, and "" for an
// embedded quote. The `=""..."` Excel-escaping prefix on ISBN columns is
// fine for us — we don't read those.

/** Parse a CSV string into an array of {column → value} dicts. */
export function parseCSV(text: string): Array<Record<string, string>> {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0] === '') continue; // blank line
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] ?? '';
    }
    out.push(obj);
  }
  return out;
}

/** Lower-level: splits the raw text into rows of cells. */
function parseRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        out.push(row); row = [];
      } else if (ch === '\r') {
        // Skip — handle '\r\n' or bare '\r' transparently.
      } else {
        cell += ch;
      }
    }
  }
  // Flush trailing cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

// ── Field cleaning ────────────────────────────────────────────────────

/** 'YYYY/MM/DD' or 'YYYY/M/D' → 'YYYY-MM-DD'. Returns null on failure. */
export function parseGoodreadsDate(s: string): string | null {
  const trimmed = (s || '').trim();
  if (!trimmed) return null;
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (!m) return null;
  const yyyy = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Strip Goodreads-style HTML from a review while preserving readable
 * structure. Common patterns: `<br/>`, `<br>`, `<i>...</i>`, `<b>...</b>`,
 * `<a href="...">...</a>`. We normalize line breaks to `\n`, drop the
 * rest of the tags, decode the few HTML entities Goodreads uses.
 */
export function normalizeReview(html: string): string {
  if (!html) return '';
  let out = html;
  // Line breaks
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  out = out.replace(/<p[^>]*>/gi, '');
  out = out.replace(/<\/p>/gi, '');
  // Strip remaining tags
  out = out.replace(/<[^>]+>/g, '');
  // Decode the entities Goodreads actually emits
  out = out
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse triple+ blank lines to double; trim outer whitespace
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

// ── Mapping ───────────────────────────────────────────────────────────

/**
 * Build the import preview from a parsed Goodreads CSV. Returns the
 * candidates array plus aggregate stats for the user-facing preview.
 */
export function buildImportPreview(
  rawRows: Array<Record<string, string>>,
): GoodreadsImportPreview {
  const candidates: GoodreadsBookCandidate[] = [];
  const shelfBreakdown: Record<string, number> = {};
  let skippedNonRead = 0;
  let dateFallbackCount = 0;
  let missingPagesCount = 0;
  let reReadCount = 0;

  for (const r of rawRows) {
    const shelf = (r['Exclusive Shelf'] || '').trim();
    if (shelf !== 'read') {
      skippedNonRead++;
      shelfBreakdown[shelf || '(no shelf)'] = (shelfBreakdown[shelf || '(no shelf)'] || 0) + 1;
      continue;
    }

    // Date: prefer Date Read, fall back to Date Added.
    const dateRead = parseGoodreadsDate(r['Date Read'] || '');
    const dateAdded = parseGoodreadsDate(r['Date Added'] || '');
    const finishedOn = dateRead ?? dateAdded;
    if (!finishedOn) continue; // can't import a row without any date
    const dateFallback = dateRead === null;
    if (dateFallback) dateFallbackCount++;

    // Pages
    const pagesStr = (r['Number of Pages'] || '').trim();
    const pages = pagesStr ? parseInt(pagesStr, 10) || 0 : 0;
    if (pages === 0) missingPagesCount++;

    // Rating: Goodreads stores 0..5; clamp defensively.
    const ratingRaw = parseInt((r['My Rating'] || '0').trim(), 10) || 0;
    const rating = Math.max(0, Math.min(5, ratingRaw)) as 0 | 1 | 2 | 3 | 4 | 5;

    // Read Count — surface for the preview, don't store.
    const readCount = parseInt((r['Read Count'] || '1').trim(), 10) || 1;
    if (readCount > 1) reReadCount++;

    const reviewRaw = r['My Review'] || '';
    const review = reviewRaw.trim() ? normalizeReview(reviewRaw) : null;

    candidates.push({
      finished_on: finishedOn,
      title: (r['Title'] || '').trim(),
      author: (r['Author'] || '').trim(),
      pages,
      rating,
      review: review && review.length ? review : null,
      dateFallback,
      readCount,
    });
  }

  return {
    candidates,
    skippedNonRead,
    shelfBreakdown,
    dateFallbackCount,
    missingPagesCount,
    reReadCount,
  };
}

/**
 * Filter out candidates that already exist in `existingBooks`. Match key
 * is `(title, finished_on)` — the same finish on the same date is treated
 * as a duplicate. Returns the candidates that would be inserted plus the
 * count of duplicates skipped.
 */
export function dedupAgainstExisting(
  candidates: GoodreadsBookCandidate[],
  existingBooks: Array<{ title: string; finished_on: string }>,
): { toInsert: GoodreadsBookCandidate[]; duplicateCount: number } {
  const seen = new Set<string>();
  for (const b of existingBooks) {
    seen.add(dedupeKey(b.title, b.finished_on));
  }
  const toInsert: GoodreadsBookCandidate[] = [];
  let duplicateCount = 0;
  for (const c of candidates) {
    const k = dedupeKey(c.title, c.finished_on);
    if (seen.has(k)) {
      duplicateCount++;
    } else {
      seen.add(k); // also dedupe within the import itself
      toInsert.push(c);
    }
  }
  return { toInsert, duplicateCount };
}

function dedupeKey(title: string, finishedOn: string): string {
  return `${title.trim().toLowerCase()}|${finishedOn}`;
}
