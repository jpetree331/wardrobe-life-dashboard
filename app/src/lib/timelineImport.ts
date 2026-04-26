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

export async function parseFile(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();
  const out: ParsedRow[] = [];

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    for (const sn of wb.SheetNames) {
      const sh = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: '', raw: false });
      for (const r of data) {
        const row = normalizeRow(r, sn);
        if (row.entry_date && row.summary) out.push(row);
      }
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
