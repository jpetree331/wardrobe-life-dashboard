// Pure helpers for parsing Scrivener "File → Export → Files…" output
// (MultiMarkdown format) into the shape Sanctuary expects in `entries`.
//
// Each Scrivener document becomes one .md file plus a sibling
// `<name> MetaData.txt`. Dates live in the filename across five different
// historical conventions; the importer canonicalises every one to
// YYYY-MM-DD on the way in.

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

/** "25" → 2025; "98" → 1998. Standard Excel/Scrivener two-digit-year convention. */
function expandYear(yy: string): number {
  const n = Number(yy);
  return n < 70 ? 2000 + n : 1900 + n;
}

export type ScrivenerMetadata = {
  created: Date | null;
  modified: Date | null;
  keywords: string[];
  synopsis: string;
};

/**
 * Parse a Scrivener `<name> MetaData.txt` file. Format is line-oriented:
 *   Created:   Wednesday, January 1, 2025 4:39:46 PM
 *   Modified:  Sunday, April 26, 2026 1:15:03 PM
 *   Keywords:  tag1, tag2
 *   Synopsis:  one-line summary
 *
 * Tolerates trailing whitespace, missing fields, and the multi-line synopsis
 * shape Scrivener occasionally emits.
 */
export function parseMetadata(text: string): ScrivenerMetadata {
  const lines = text.split(/\r?\n/);
  const out: ScrivenerMetadata = {
    created: null,
    modified: null,
    keywords: [],
    synopsis: '',
  };
  let synopsisStarted = false;
  let synopsisLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (synopsisStarted) {
      synopsisLines.push(line);
      continue;
    }
    const m = line.match(/^(Created|Modified|Status|Label|Keywords|Synopsis):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case 'Created':
        out.created = parseScrivenerDate(value);
        break;
      case 'Modified':
        out.modified = parseScrivenerDate(value);
        break;
      case 'Keywords':
        out.keywords = value
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case 'Synopsis':
        out.synopsis = value.trim();
        synopsisStarted = true;
        break;
      default:
        break;
    }
  }
  if (synopsisLines.length > 0) {
    const extra = synopsisLines.join('\n').trim();
    if (extra) out.synopsis = (out.synopsis + '\n' + extra).trim();
  }
  return out;
}

/** "Wednesday, January 1, 2025 4:39:46 PM" → Date object. */
function parseScrivenerDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d;
  // Fallback regex if the locale-y Date parse fails.
  const m = t.match(/(\w+),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (month) return new Date(Number(m[4]), month - 1, Number(m[3]));
  }
  return null;
}

export type FilenameParse = {
  date: string | null;          // 'YYYY-MM-DD' or null if no date in filename
  title: string;                // remainder after date / sort prefix / DOW; may be ''
  rawAfterSortPrefix: string;   // for diagnostics
};

/**
 * Parse a Scrivener-export filename. Five conventions to handle:
 *   "26 Apr 2, 2023; Su.md"       → 2023-04-02, "" or "Apr 2, 2023; Su"
 *   "47 April 9, 2024; Tu.md"     → 2024-04-09
 *   "3 Jan 1, 2025.md"            → 2025-01-01
 *   "18 3.1.25.md"                → 2025-03-01
 *   "<idx> 2026-04-19 Title.md"   → 2026-04-19, "Title"   (current convention)
 *   "<idx> 2026.04.19 Title.md"   → same
 *
 * Also strips the leading "<sortIdx> " prefix Scrivener prepends on export.
 */
export function parseFilenameDate(filename: string): FilenameParse {
  // Strip extension
  let stem = filename.replace(/\.(md|markdown|mmd|txt)$/i, '');

  // Strip leading "<sortIdx> " (one or more digits + whitespace)
  const sortStripped = stem.replace(/^\s*\d+\s+/, '');
  const rawAfterSortPrefix = sortStripped;
  stem = sortStripped;

  // --- Try YYYY-MM-DD or YYYY.MM.DD prefix ---
  let m = stem.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})\b\s*[:;,\-]?\s*(.*)$/);
  if (m) {
    return {
      date: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`,
      title: cleanupTitle(m[4]),
      rawAfterSortPrefix,
    };
  }

  // --- Try "Mon D, YYYY[; DOW]" — also accepts "Month D, YYYY" full names ---
  m = stem.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s*;\s*([A-Za-z]+))?\s*(.*)$/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (month) {
      return {
        date: `${m[3]}-${pad2(month)}-${pad2(m[2])}`,
        title: cleanupTitle(m[5] || ''),
        rawAfterSortPrefix,
      };
    }
  }

  // --- Try M.D.YY / M.D.YYYY / M-D-YY / M-D-YYYY ---
  m = stem.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})\b\s*[:;,\-]?\s*(.*)$/);
  if (m) {
    const year = m[3].length === 2 ? expandYear(m[3]) : Number(m[3]);
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        date: `${year}-${pad2(month)}-${pad2(day)}`,
        title: cleanupTitle(m[4]),
        rawAfterSortPrefix,
      };
    }
  }

  // No date found; whole stem (sans sortIdx) is the title candidate
  return { date: null, title: cleanupTitle(stem), rawAfterSortPrefix };
}

function cleanupTitle(s: string): string {
  return s
    .trim()
    .replace(/^[;:,\-–—\s]+/, '')
    .replace(/[;:,\-–—\s]+$/, '')
    .trim();
}

/**
 * Tiny markdown → HTML converter sized for prayer-journal content:
 * paragraphs, **bold**, *italic*, _italic_, > blockquotes, # headings,
 * --- horizontal rules. Anything we miss the user can fix in the editor.
 *
 * Escapes raw HTML chars first so user text can't sneak in markup.
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out: string[] = [];

  for (const blockRaw of blocks) {
    const block = blockRaw.replace(/^\n+|\n+$/g, '');
    if (!block) continue;

    // Horizontal rule
    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(block.trim())) {
      out.push('<hr/>');
      continue;
    }

    // Headings
    const heading = block.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    // Blockquote (entire block prefixed with >)
    if (block.split('\n').every((l) => /^\s*>/.test(l))) {
      const inner = block
        .split('\n')
        .map((l) => l.replace(/^\s*>\s?/, ''))
        .join(' ');
      out.push(`<blockquote>${inline(escapeHtml(inner))}</blockquote>`);
      continue;
    }

    // Plain paragraph (collapse internal newlines to spaces — matches the
    // contentEditable's flat paragraph shape)
    const text = block.split('\n').map((l) => l.trim()).join(' ');
    out.push(`<p>${inline(escapeHtml(text))}</p>`);
  }

  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  // Order matters: bold (** / __) before italic (* / _).
  return s
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
}

export type ParsedSanctuaryEntry = {
  filename: string;
  date: string;                // 'YYYY-MM-DD'
  dateSource: 'filename' | 'metadata';
  title: string;
  body_html: string;
  tags: string[];
  scripture_refs: string[];
  // For dry-run diagnostics
  bodyPreview: string;
  warnings: string[];
};

/**
 * Decide the title from these sources, in order of preference:
 *   1. Whatever's left in the filename after stripping sort-prefix/date/DOW
 *   2. A single-line bold or heading at the top of the body
 *      ("**Today: God's first miracle**" → "Today: God's first miracle")
 *   3. A *multi-line* bold preamble (date metadata + title line + verse all
 *      wrapped in one **...**) — common in the 2023 Lectio entries.
 *      We pick the first preamble line that isn't date-y, isn't a quote,
 *      and isn't a verse reference.
 *   4. Synopsis from metadata (truncated)
 *   5. Empty string. The binder UI shows "untitled" as a styled placeholder
 *      so the row still reads cleanly without us inventing a title.
 *
 * Returns the chosen title plus a body with the lifted line(s) removed.
 */
export function chooseTitleAndBody(
  filenameTitle: string,
  body: string,
  synopsis: string,
): { title: string; body: string } {
  if (filenameTitle && filenameTitle.length >= 2) {
    return { title: filenameTitle, body };
  }
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const first = (lines[i] || '').trim();

  // Single-line bold or heading
  const boldMatch = first.match(/^\*\*(.+?)\*\*$/) || first.match(/^__(.+?)__$/);
  const headingMatch = first.match(/^#{1,6}\s+(.+)$/);
  if (boldMatch) {
    const rest = lines.slice(i + 1).join('\n').replace(/^\n+/, '');
    return { title: boldMatch[1].trim(), body: rest };
  }
  if (headingMatch) {
    const rest = lines.slice(i + 1).join('\n').replace(/^\n+/, '');
    return { title: headingMatch[1].trim(), body: rest };
  }

  // Multi-line bold preamble
  const preamble = liftBoldPreamble(lines, i);
  if (preamble) {
    return { title: preamble.title, body: preamble.bodyAfter };
  }

  if (synopsis) return { title: truncate(synopsis, 80), body };
  return { title: '', body };
}

/**
 * Detect a multi-line bold block at lines[start..]: opens with `**`, closes
 * with `**` somewhere in the next 20 lines. Returns the most-title-shaped
 * line from inside the block.
 */
function liftBoldPreamble(
  lines: string[],
  start: number,
): { title: string; bodyAfter: string } | null {
  if (start >= lines.length) return null;
  if (!lines[start].trimStart().startsWith('**')) return null;
  // If it closes on the same line we'd have matched single-line bold — skip.
  if (/\*\*[^*\n]*\*\*\s*$/.test(lines[start].trim())) return null;

  let endIdx = -1;
  for (let j = start; j < Math.min(lines.length, start + 20); j++) {
    if (j > start && /\*\*\s*$/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  if (endIdx === -1) return null;

  const inside: string[] = [];
  for (let j = start; j <= endIdx; j++) {
    let line = lines[j];
    if (j === start) line = line.replace(/^\s*\*\*/, '');
    if (j === endIdx) line = line.replace(/\*\*\s*$/, '');
    line = line.trim();
    if (line) inside.push(line);
  }
  if (inside.length === 0) return null;

  const looksLikeDate = (s: string) =>
    /\b\d{4}\b/.test(s) ||                 // contains a year
    /\b(am|pm|a\.m\.|p\.m\.)\b/i.test(s) || // contains a time
    /^\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?\s*$/.test(s); // bare M/D
  const looksLikeQuote = (s: string) => /^["'“”‘’«»]/.test(s);
  const looksLikeVerse = (s: string) => /^[A-Z][\w.]+\s+\d+:\d+/.test(s);

  for (const line of inside) {
    if (looksLikeDate(line)) continue;
    if (looksLikeQuote(line)) continue;
    if (looksLikeVerse(line)) continue;
    if (line.length < 3) continue;
    return {
      title: line.length > 100 ? line.slice(0, 97).trimEnd() + '…' : line,
      bodyAfter: lines.slice(endIdx + 1).join('\n').replace(/^\n+/, ''),
    };
  }
  // No clean title in the preamble — fall back to the first line, capped.
  const fallback = inside[0];
  return {
    title: fallback.length > 80 ? fallback.slice(0, 77).trimEnd() + '…' : fallback,
    bodyAfter: lines.slice(endIdx + 1).join('\n').replace(/^\n+/, ''),
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/**
 * Combine filename parse + body + metadata into one importable entry.
 * Returns null if no date can be determined (caller should flag for review).
 */
export function parseSanctuaryFile(
  filename: string,
  body: string,
  metadata: ScrivenerMetadata | null,
): ParsedSanctuaryEntry | null {
  const warnings: string[] = [];
  const fp = parseFilenameDate(filename);

  let date = fp.date;
  let dateSource: 'filename' | 'metadata' = 'filename';
  if (!date) {
    if (metadata?.created) {
      date = isoDate(metadata.created);
      dateSource = 'metadata';
      warnings.push(`No date in filename — using metadata Created (${date}).`);
    } else {
      return null;
    }
  }

  const synopsis = metadata?.synopsis || '';
  const { title, body: bodyAfterTitleLift } = chooseTitleAndBody(
    fp.title,
    body,
    synopsis,
  );
  if (!title) warnings.push('No title in filename or body — binder will show "untitled".');

  const body_html = markdownToHtml(bodyAfterTitleLift);
  const tags = metadata?.keywords ?? [];

  return {
    filename,
    date,
    dateSource,
    title,
    body_html,
    tags,
    scripture_refs: [],
    bodyPreview: bodyAfterTitleLift.replace(/\s+/g, ' ').trim().slice(0, 100),
    warnings,
  };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}
