// Data-room backup/export — PURE, READ-ONLY builders. Takes the already-loaded
// reading records and returns strings (lossless JSON + a readable HTML report).
// Never touches Supabase, the DOM, or mutates its inputs.

import type {
  BookRead,
  DailyPageRead,
  PlanCompletion,
  ReadingPlan,
  ScriptureRead,
} from './data';
import {
  backupFilename,
  buildJsonBackup,
  escapeHtml,
  EXPORT_BASE_CSS,
  EXPORT_HEAD,
  formatLongDate,
  type BackupMeta,
} from './backupEnvelope';

export type DataBackupTables = {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
  plans: ReadingPlan[];
  planCompletions: PlanCompletion[];
};

/** Only the manually-logged scripture reads are real rows in
 *  data_scripture_reads; sanctuary-sourced ones are synthesized from Sanctuary
 *  entries (backed up separately), so a lossless Data backup excludes them. */
export function ownedScriptureReads(reads: ScriptureRead[]): ScriptureRead[] {
  return reads.filter((r) => r.source === 'manual');
}

/** Human reference for a scripture read, e.g. "Luke 24:13-35" or "John 1". */
export function scriptureRef(r: ScriptureRead): string {
  const base = `${r.book} ${r.chapter}`;
  if (r.verse_from !== null && r.verse_to !== null) {
    return r.verse_from === r.verse_to
      ? `${base}:${r.verse_from}`
      : `${base}:${r.verse_from}-${r.verse_to}`;
  }
  return base;
}

/**
 * Lossless JSON backup of every owned Data table, verbatim. Scripture reads are
 * narrowed to the manually-logged rows (the real table). Nothing else is
 * filtered — every book, page log, plan, and completion is captured as stored.
 */
export function buildDataBackupJson(tables: DataBackupTables, meta: BackupMeta): string {
  const scripture = ownedScriptureReads(tables.scriptureReads);
  return buildJsonBackup(
    'data-backup',
    'Complete, lossless backup of the Data room reading records. Each array is ' +
      'the full set of rows from its table: scripture_reads (manual logs only — ' +
      'sanctuary-tagged reads live with your Sanctuary backup), book_reads, ' +
      'daily_page_reads, reading_plans, and plan_completions — exactly as stored.',
    {
      counts: {
        scripture_reads: scripture.length,
        book_reads: tables.bookReads.length,
        daily_page_reads: tables.dailyPages.length,
        reading_plans: tables.plans.length,
        plan_completions: tables.planCompletions.length,
      },
      scripture_reads: scripture,
      book_reads: tables.bookReads,
      daily_page_reads: tables.dailyPages,
      reading_plans: tables.plans,
      plan_completions: tables.planCompletions,
    },
    meta,
  );
}

const DATA_CSS = `${EXPORT_BASE_CSS}
  .counts { display: flex; flex-wrap: wrap; gap: 18px; justify-content: center; margin-top: 14px; }
  .count { text-align: center; }
  .count .n { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; color: var(--ink); display: block; }
  .count .l { font-style: italic; font-size: 12px; color: var(--ink-faint); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
       color: var(--ink-soft); border-bottom: 1px solid var(--line); padding: 6px 8px; font-size: 13px;
       letter-spacing: 0.06em; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  .stars { color: var(--accent-strong); letter-spacing: 1px; }
  .muted { color: var(--ink-faint); }
  .sheet + .sheet { margin-top: 22px; }
  .sec-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px;
    color: var(--ink-soft); margin: 0 0 12px; letter-spacing: 0.04em; }
`;

function stars(n: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/** A readable, self-contained report of the reading records: counts, books
 *  finished (newest first), the scripture reading log, and reading plans. */
export function buildDataReadableHtml(tables: DataBackupTables, meta: BackupMeta): string {
  const scripture = ownedScriptureReads(tables.scriptureReads)
    .slice()
    .sort((a, b) => b.read_date.localeCompare(a.read_date));
  const books = tables.bookReads
    .slice()
    .sort((a, b) => (b.finished_on || '').localeCompare(a.finished_on || ''));
  const plans = tables.plans.slice().sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));

  const counts = `
    <div class="counts">
      <div class="count"><span class="n">${scripture.length}</span><span class="l">scripture reads</span></div>
      <div class="count"><span class="n">${books.length}</span><span class="l">books finished</span></div>
      <div class="count"><span class="n">${tables.dailyPages.length}</span><span class="l">page logs</span></div>
      <div class="count"><span class="n">${plans.length}</span><span class="l">reading plans</span></div>
    </div>`;

  const booksTable = books.length
    ? `<div class="sheet"><h2 class="sec-title">Books finished</h2><table>
        <thead><tr><th>Finished</th><th>Title</th><th>Author</th><th>Rating</th></tr></thead>
        <tbody>${books
          .map(
            (b) =>
              `<tr><td class="muted">${escapeHtml(b.finished_on || '')}</td>` +
              `<td>${escapeHtml(b.title || '—')}</td>` +
              `<td class="muted">${escapeHtml(b.author || '')}</td>` +
              `<td class="stars">${b.rating ? stars(b.rating) : '<span class="muted">—</span>'}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
    : '';

  const scriptureTable = scripture.length
    ? `<div class="sheet"><h2 class="sec-title">Scripture reading log</h2><table>
        <thead><tr><th>Date</th><th>Passage</th><th>Note</th></tr></thead>
        <tbody>${scripture
          .map(
            (r) =>
              `<tr><td class="muted">${escapeHtml(r.read_date)}</td>` +
              `<td>${escapeHtml(scriptureRef(r))}</td>` +
              `<td class="muted">${escapeHtml(r.note || '')}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
    : '';

  const plansTable = plans.length
    ? `<div class="sheet"><h2 class="sec-title">Reading plans</h2><table>
        <thead><tr><th>Plan</th><th>Span</th><th>Books</th></tr></thead>
        <tbody>${plans
          .map(
            (p) =>
              `<tr><td>${escapeHtml(p.name || '—')}</td>` +
              `<td class="muted">${escapeHtml(p.start_date || '')} → ${escapeHtml(p.end_date || '')}</td>` +
              `<td class="muted">${escapeHtml((p.books || []).join(', '))}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
    : '';

  // Concatenate every non-empty section — NOT `a || b || c`, which would keep
  // only the first and silently drop the rest.
  const anything = [booksTable, scriptureTable, plansTable].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
${EXPORT_HEAD}
<title>Data — reading backup ${escapeHtml(meta.dateStr)}</title>
<style>${DATA_CSS}</style>
</head>
<body>
<header class="cover">
  <h1>Reading</h1>
  <p class="sub">a record of what you've read · exported ${escapeHtml(meta.dateStr)}</p>
  ${counts}
</header>
${anything || '<div class="sheet"><p class="muted" style="text-align:center;font-style:italic">No reading recorded yet.</p></div>'}
</body>
</html>`;
}

export function dataExportFilename(kind: 'html' | 'json', dateStr: string): string {
  return backupFilename('data', kind, dateStr);
}
