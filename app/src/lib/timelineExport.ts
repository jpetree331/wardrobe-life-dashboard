// Timeline backup/export — PURE, READ-ONLY builders (see sanctuaryExport.ts
// for the same safety contract). Takes already-fetched TimelineRow records and
// returns strings; never touches Supabase, the DOM, or mutates its inputs.

import type { TimelineRow } from './entries';
import {
  backupFilename,
  buildJsonBackup,
  escapeHtml,
  EXPORT_BASE_CSS,
  EXPORT_HEAD,
  formatLongDate,
  type BackupMeta,
} from './backupEnvelope';

export type TimelineSelection = {
  from?: string | null;
  to?: string | null;
  selectedIds?: Set<string> | null;
};

/** Filter + order Timeline rows for export. Pure: returns a NEW array sorted
 *  chronologically oldest → newest; never mutates the input. */
export function selectTimelineForExport(rows: TimelineRow[], sel: TimelineSelection = {}): TimelineRow[] {
  const from = sel.from || null;
  const to = sel.to || null;
  const ids = sel.selectedIds || null;
  return rows
    .filter((r) => {
      if (ids && !ids.has(r.id)) return false;
      if (from && r.entry_date < from) return false;
      if (to && r.entry_date > to) return false;
      return true;
    })
    .slice()
    .sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        (a.created_at || '').localeCompare(b.created_at || ''),
    );
}

const TIMELINE_CSS = `${EXPORT_BASE_CSS}
  .tl-entry { padding: 14px 0; border-bottom: 1px solid var(--line); }
  .tl-entry:last-child { border-bottom: 0; }
  .tl-date { font-style: italic; color: var(--ink-faint); font-size: 12.5px; letter-spacing: 0.04em; }
  .tl-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: var(--ink); margin: 2px 0 4px; }
  .tl-summary { font-size: 15px; color: var(--ink); }
  .tl-summary p { margin: 0 0 0.6em; }
  .tl-tags { margin-top: 6px; font-size: 12px; color: var(--accent); }
  .tl-linked { margin-top: 4px; font-style: italic; font-size: 12px; color: var(--ink-faint); }
`;

function summaryHtml(r: TimelineRow): string {
  const s = (r.summary || '').trim();
  if (!s) return '';
  // Timeline summaries are plain text — escape and split on blank lines.
  return s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Self-contained readable HTML chronicle, grouped by year. */
export function buildTimelineReadableHtml(rows: TimelineRow[], meta: BackupMeta): string {
  const count = rows.length;
  const range =
    count > 0
      ? `${formatLongDate(rows[0].entry_date)} — ${formatLongDate(rows[count - 1].entry_date)}`
      : 'no entries';

  const parts: string[] = [];
  let curYear = '';
  for (const r of rows) {
    const year = r.entry_date.slice(0, 4);
    if (year !== curYear) {
      if (curYear !== '') parts.push('</div>'); // close previous .sheet
      parts.push(`<div class="year-head">${escapeHtml(year)}</div><div class="sheet">`);
      curYear = year;
    }
    const title = r.title && r.title.trim() ? escapeHtml(r.title) : '—';
    const tags = (r.tags || []).filter((t) => !t.startsWith('_'));
    const linked =
      r.sanctuary_id && r.sanctuary_title
        ? `<div class="tl-linked">✦ linked to Sanctuary: ${escapeHtml(r.sanctuary_title)}</div>`
        : '';
    parts.push(
      `<div class="tl-entry">` +
        `<div class="tl-date">${escapeHtml(formatLongDate(r.entry_date))}</div>` +
        `<div class="tl-title">${title}</div>` +
        `<div class="tl-summary">${summaryHtml(r)}</div>` +
        (tags.length ? `<div class="tl-tags">${escapeHtml(tags.map((t) => `#${t}`).join(' '))}</div>` : '') +
        linked +
        `</div>`,
    );
  }
  if (curYear !== '') parts.push('</div>'); // close final .sheet

  return `<!doctype html>
<html lang="en">
<head>
${EXPORT_HEAD}
<title>Timeline — backup ${escapeHtml(meta.dateStr)}</title>
<style>${TIMELINE_CSS}</style>
</head>
<body>
<header class="cover">
  <h1>Timeline</h1>
  <p class="sub">${count} entr${count === 1 ? 'y' : 'ies'} · ${escapeHtml(range)}<br>exported ${escapeHtml(meta.dateStr)}</p>
</header>
${parts.join('\n')}
</body>
</html>`;
}

/** Lossless JSON backup: the full TimelineRow records, untouched. */
export function buildTimelineBackupJson(rows: TimelineRow[], meta: BackupMeta): string {
  return buildJsonBackup(
    'timeline-backup',
    'Complete, lossless backup of Timeline entries. Each item in "entries" is ' +
      'the full row from the timeline view (the entries table, room = timeline, ' +
      'with its linked Sanctuary context), exactly as stored.',
    { entry_count: rows.length, entries: rows },
    meta,
  );
}

export function timelineExportFilename(kind: 'html' | 'json', dateStr: string): string {
  return backupFilename('timeline', kind, dateStr);
}
