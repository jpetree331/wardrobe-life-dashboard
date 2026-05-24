// Pure helpers for parsing imported Timeline data (xlsx, csv, txt).
// Kept separate from the React page so they can be unit-tested.

import * as XLSX from '@e965/xlsx';

export type ParsedRow = {
  entry_date: string;
  summary: string;
  tags: string[];
};

export function pad2(n: string | number): string {
  return String(n).padStart(2, '0');
}

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

/**
 * Loose date parser. Returns ISO 'YYYY-MM-DD', or null if nothing matches.
 *
 * Handles formats actually seen in the source xlsx:
 *   "2024-04-19", "2026.04.02"           - already-canonical
 *   "4/19/2024"                           - US slash
 *   "1-Apr", "12-Jun"                     - D-Mon, year from sheet name
 *   "Mar-14", "Apr-9"                     - Mon-D, year from sheet name
 *   "14-17-June"                          - D-D-Mon range, takes FIRST day
 *   "Jan", "February"                     - month-only, maps to the 1st
 *
 * `fallbackYear` is the implied year from a year-named sheet (e.g. "2017").
 */
export function parseLooseDate(
  s: string,
  fallbackYear?: string | null,
): { date: string; rangeEnd?: string } | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;

  // YYYY-MM-DD or YYYY.MM.DD
  let m = t.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (m) return { date: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` };

  // MM/DD/YYYY (US)
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { date: `${m[3]}-${pad2(m[1])}-${pad2(m[2])}` };

  // D-D-Mon range, e.g. "14-17-June"
  m = t.match(/^(\d{1,2})\s*[–—-]\s*(\d{1,2})\s*[–—-]\s*([a-zA-Z.]+)$/);
  if (m && fallbackYear) {
    const month = MONTH_NAMES[m[3].toLowerCase().replace(/\.$/, '')];
    if (month) {
      return {
        date: `${fallbackYear}-${pad2(month)}-${pad2(m[1])}`,
        rangeEnd: `${fallbackYear}-${pad2(month)}-${pad2(m[2])}`,
      };
    }
  }

  // D-Mon, e.g. "1-Apr", "12-Jun"
  m = t.match(/^(\d{1,2})\s*[–—-]\s*([a-zA-Z.]+)$/);
  if (m && fallbackYear) {
    const month = MONTH_NAMES[m[2].toLowerCase().replace(/\.$/, '')];
    if (month) return { date: `${fallbackYear}-${pad2(month)}-${pad2(m[1])}` };
  }

  // Mon-D, e.g. "Mar-14", "Apr-9"
  m = t.match(/^([a-zA-Z.]+)\s*[–—-]\s*(\d{1,2})$/);
  if (m && fallbackYear) {
    const month = MONTH_NAMES[m[1].toLowerCase().replace(/\.$/, '')];
    if (month) return { date: `${fallbackYear}-${pad2(month)}-${pad2(m[2])}` };
  }

  // Month only, e.g. "Jan", "February" → 1st of month (per import policy)
  m = t.match(/^([a-zA-Z.]+)$/);
  if (m && fallbackYear) {
    const month = MONTH_NAMES[m[1].toLowerCase().replace(/\.$/, '')];
    if (month) return { date: `${fallbackYear}-${pad2(month)}-01` };
  }

  return null;
}

/**
 * Position-based row parser. For sheets where the header row doesn't tell
 * us which column is the date and which is the summary (the Reckoning of
 * Years xlsx has 13 sheets with 6+ different layouts), pick column-by-shape:
 *   - First cell that parses to a date → entry_date
 *   - Last non-empty cell with substantial text (≥ 10 chars) → summary
 * Day-of-week ("Tu", "Sat") and page numbers ("53") are filtered out by
 * the length floor so they never become a summary by accident.
 */
export function normalizeArrayRow(
  cells: unknown[],
  fallbackYear?: string | null,
): ParsedRow | null {
  if (!Array.isArray(cells) || cells.length === 0) return null;

  let date: string | null = null;
  for (const c of cells) {
    const s = String(c ?? '').trim();
    if (!s) continue;
    const parsed = parseLooseDate(s, fallbackYear);
    if (parsed) { date = parsed.date; break; }
  }
  if (!date) return null;

  let summary = '';
  for (let i = cells.length - 1; i >= 0; i--) {
    const s = String(cells[i] ?? '').trim();
    if (s.length >= 10) { summary = s; break; }
  }
  if (!summary) return null;

  return { entry_date: date, summary, tags: [] };
}

export function pickField(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}

export function coerceDate(r: Record<string, unknown>, sheetName?: string): string {
  const y =
    (r.Year as string) || (r.year as string) ||
    (sheetName && /^\d{4}$/.test(sheetName) ? sheetName : '');
  const m = (r.Month as string) || (r.month as string) || '';
  const d = (r.Day as string) || (r.day as string) || '';
  if (y && m && d) return `${y}-${pad2(m)}-${pad2(d)}`;
  return '';
}

export function normalizeDate(s: string): string {
  if (!s) return '';
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
  // Last resort: Date(). This is locale-dependent — prefer the explicit
  // patterns above. Only kept so SheetJS Date objects (already normalized)
  // pass through.
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

export function normalizeRow(
  r: Record<string, unknown>,
  sheetName?: string,
): ParsedRow {
  // Note: do NOT include 'Day'/'day' here. They mean "day of month" when
  // paired with Year/Month columns and are handled by coerceDate. Treating a
  // bare "19" as a full date silently produced empty entry_date for split-
  // column spreadsheets.
  const date =
    pickField(r, ['Date', 'date', 'DATE']) ||
    coerceDate(r, sheetName);
  const summary = pickField(r, [
    'Summary', 'summary', 'Highlight', 'highlight', 'One-sentence highlight',
    'One Sentence', 'sentence', 'Note', 'note', 'Entry', 'entry',
  ]);
  const tagsRaw = pickField(r, ['Tags', 'tags', 'Tag', 'tag', 'Categories', 'category']);
  const tags = tagsRaw
    ? String(tagsRaw).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : [];
  return {
    entry_date: normalizeDate(date),
    summary: String(summary || '').trim(),
    tags,
  };
}

export function parsePlainText(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{4}-\d{2}-\d{2})[\s–—\-:|]+(.+)$/);
    if (m) out.push({ entry_date: m[1], summary: m[2].trim(), tags: [] });
  }
  return out;
}

/**
 * Parse one xlsx sheet. First tries the named-column path (clean exports
 * with a `Date | Highlight | Tags` header) so we keep tag support for
 * those. If that yields zero rows, falls back to the position-based
 * `normalizeArrayRow` path so messy multi-year sheets — varying headers,
 * year-as-header rows, "1-Apr" style dates with year implicit from the
 * sheet name — still import.
 */
export function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedRow[] {
  const fallbackYear = /^\d{4}$/.test(sheetName) ? sheetName : undefined;

  const named: ParsedRow[] = [];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  for (const r of records) {
    const row = normalizeRow(r, sheetName);
    if (row.entry_date && row.summary) named.push(row);
  }
  if (named.length > 0) return named;

  const out: ParsedRow[] = [];
  const cellsList = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  for (const cells of cellsList) {
    const parsed = normalizeArrayRow(cells, fallbackYear);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function parseFile(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();
  const out: ParsedRow[] = [];

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    for (const sn of wb.SheetNames) {
      out.push(...parseSheet(wb.Sheets[sn], sn));
    }
  } else if (name.endsWith('.csv')) {
    const text = await file.text();
    const wb = XLSX.read(text, { type: 'string' });
    const sh = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: '', raw: false });
    for (const r of data) {
      const row = normalizeRow(r);
      if (row.entry_date && row.summary) out.push(row);
    }
  } else {
    const text = await file.text();
    for (const r of parsePlainText(text)) {
      if (r.entry_date && r.summary) out.push(r);
    }
  }
  return out;
}
