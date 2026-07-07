// Sanctuary export / backup — PURE, READ-ONLY builders.
//
// SAFETY CONTRACT: nothing in this module touches Supabase, the network, the
// DOM, or localStorage, and nothing mutates its inputs. Every function takes
// already-fetched Entry objects and returns a string (HTML or JSON). It is
// impossible for this code to alter or delete the user's data — it only reads.
//
// Two outputs:
//   • buildReadableHtml — a self-contained, faithfully-styled document for
//     reading / printing / "Save as PDF". Renders the entry bodies with the
//     same styling classes the app uses (highlights, red-letter, drop-caps,
//     verse numbers, blockquotes), with the design tokens inlined so the file
//     stands alone forever.
//   • buildBackupJson — a complete, lossless snapshot: every field of every
//     selected entry, untouched, wrapped with a self-describing header. This
//     is the real restore file.

import type { Entry } from './entries';
import { formatMinutes, totalStillnessMinutes } from './sanctuaryPractice';

// System tags (leading underscore) are hidden from the readable output the
// same way the app hides them everywhere — but they are preserved verbatim in
// the JSON backup, so nothing is lost. VEIL_TAG marks intimate entries; they
// are always included (never omitted from a backup).
export const SYSTEM_TAG_PREFIX = '_';

const ENTRY_TYPE_LABELS: Record<string, string> = {
  lectio: 'Lectio Divina',
  examen: 'Examen',
  prayer: 'Prayer',
  scripture: 'Scripture',
  journal: 'Journal',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type ExportSelection = {
  /** 'YYYY-MM-DD' inclusive lower bound, or null for no lower bound. */
  from?: string | null;
  /** 'YYYY-MM-DD' inclusive upper bound, or null for no upper bound. */
  to?: string | null;
  /** When provided, only entries whose id is in the set are included. */
  selectedIds?: Set<string> | null;
};

export type ExportMeta = {
  /** ISO timestamp, passed in by the caller so the builders stay pure. */
  exportedAt: string;
  /** 'YYYY-MM-DD' local date, for the header + filename. */
  dateStr: string;
};

// ── Selection ─────────────────────────────────────────────────────────────

/**
 * Pick and order the entries an export should contain. Pure: returns a NEW
 * array (never mutates the input) sorted chronologically oldest → newest for
 * reading. String comparison of 'YYYY-MM-DD' is a correct date order.
 */
export function selectEntriesForExport(entries: Entry[], sel: ExportSelection = {}): Entry[] {
  const from = sel.from || null;
  const to = sel.to || null;
  const ids = sel.selectedIds || null;
  return entries
    .filter((e) => {
      if (ids && !ids.has(e.id)) return false;
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    })
    .slice()
    .sort(
      (a, b) =>
        a.entry_date.localeCompare(b.entry_date) ||
        (a.created_at || '').localeCompare(b.created_at || ''),
    );
}

// ── Small helpers ───────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Long, timezone-safe date label, e.g. "Sunday, 5 July 2026". */
export function formatLongDate(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const [y, m, d] = parts;
  // Local construction — no UTC parse, so the weekday never drifts a day.
  const wd = new Date(y, m - 1, d).getDay();
  const month = MONTHS[m - 1] ?? '';
  return `${WEEKDAYS[wd]}, ${d} ${month} ${y}`;
}

export function entryTypeLabel(type: Entry['entry_type']): string {
  return type ? ENTRY_TYPE_LABELS[type] ?? type : '';
}

/** Visible (non-system) tags of an entry, in order. */
export function visibleTags(e: Entry): string[] {
  return (e.tags || []).filter((t) => !t.startsWith(SYSTEM_TAG_PREFIX));
}

/** The entry's HTML body — rich bodies pass through as authored; plain bodies
 *  are escaped and paragraph-wrapped so nothing is ever interpreted as markup. */
function renderBodyHtml(e: Entry): string {
  const body = e.body || '';
  if (e.body_type === 'plain') {
    const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paras.length === 0) return '';
    return paras.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  return body;
}

/** The italic meta line under a title: type · refs · tags · practice. */
function metaLineHtml(e: Entry): string {
  const bits: string[] = [`<span>${escapeHtml(formatLongDate(e.entry_date))}</span>`];
  const type = entryTypeLabel(e.entry_type);
  if (type) bits.push(`<span class="pip">·</span><span>${escapeHtml(type)}</span>`);
  const refs = e.scripture_refs || [];
  if (refs.length) {
    bits.push(`<span class="pip">·</span><span>${escapeHtml(refs.join(', '))}</span>`);
  }
  const tags = visibleTags(e);
  if (tags.length) {
    bits.push(`<span class="pip">·</span><span>${escapeHtml(tags.map((t) => `#${t}`).join(' '))}</span>`);
  }
  const still = totalStillnessMinutes(e.stillness_sessions || []);
  const practice: string[] = [];
  if (still > 0) practice.push(`${escapeHtml(formatMinutes(still))} stillness`);
  if (e.listening_prayer) practice.push('listening prayer');
  if (practice.length) {
    bits.push(`<span class="pip">·</span><span>${escapeHtml(practice.join(' · '))}</span>`);
  }
  return bits.join(' ');
}

// ── Readable HTML document ──────────────────────────────────────────────────

/** Inlined design tokens + the Sanctuary entry-body styles, so the exported
 *  file renders faithfully with no external stylesheet. Values mirror
 *  tokens.css and the .sa-page rules in Sanctuary.css. */
const EXPORT_CSS = `
  :root {
    --bg: #efe7d6; --page: #f6efde; --ink: #2b2419; --ink-soft: #5a4f3c;
    --ink-faint: #8a7d63; --line: #2b241933; --accent: #7a6a3a;
    --accent-strong: #9c8240; --red: #8a2a1a; --hi: rgba(218, 181, 86, 0.35);
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--ink); margin: 0;
    font-family: 'EB Garamond', Georgia, serif;
    -webkit-font-smoothing: antialiased;
    padding: 40px 20px 80px;
  }
  .cover { max-width: 700px; margin: 0 auto 32px; text-align: center; }
  .cover h1 {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400;
    font-size: 40px; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0 0 10px;
  }
  .cover .sub {
    font-style: italic; color: var(--ink-faint); font-size: 14px; margin: 0;
    line-height: 1.6;
  }
  .year-head {
    max-width: 700px; margin: 40px auto 6px;
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
    font-size: 22px; letter-spacing: 0.12em; color: var(--ink-soft);
    border-bottom: 1px solid var(--line); padding-bottom: 6px;
  }
  .month-head {
    max-width: 700px; margin: 20px auto 8px;
    font-family: 'EB Garamond', Georgia, serif; font-style: italic;
    font-size: 15px; color: var(--ink-faint); letter-spacing: 0.06em;
  }
  .sa-page {
    width: 100%; max-width: 700px; margin: 0 auto 22px;
    background: var(--page); padding: 40px 48px 44px;
    border: 1px solid #e4d8bf; border-radius: 2px;
    box-shadow: 0 24px 60px -30px rgba(43,36,25,0.25), 0 2px 10px -4px rgba(43,36,25,0.08);
    font-size: 17px; line-height: 1.65; color: var(--ink);
  }
  .sa-page h1.title {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400;
    font-size: 30px; letter-spacing: 0.02em; margin: 0 0 6px; color: var(--ink);
  }
  .sa-page .meta-line {
    font-style: italic; color: var(--ink-faint); font-size: 13px;
    letter-spacing: 0.04em; margin: 0 0 26px; padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
    display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline;
  }
  .sa-page .meta-line .pip { color: var(--accent); }
  .sa-body > *:first-child { margin-top: 0; }
  .sa-page p { margin: 0 0 1em; }
  .sa-page h1, .sa-page h2, .sa-page h3 {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
  }
  .sa-page mark { background: var(--hi); padding: 0 2px; color: inherit; }
  .sa-page .rubric { color: var(--red); font-variant: small-caps; letter-spacing: 0.08em; }
  .sa-page .verse-num, .sa-page .sa-vnum {
    font-family: 'Sorts Mill Goudy', Georgia, serif; color: var(--accent);
    font-size: 0.78em; vertical-align: super; margin-right: 3px;
  }
  .sa-page .red-letter { color: var(--red); }
  .sa-page blockquote {
    margin: 1em 0 1em 12px; padding-left: 20px;
    border-left: 2px solid var(--accent); color: var(--ink-soft); font-style: italic;
  }
  .sa-page .dropcap::first-letter {
    font-family: 'Sorts Mill Goudy', Georgia, serif; font-size: 4.2em;
    float: left; line-height: 0.85; padding: 6px 10px 0 0; color: var(--accent-strong);
  }
  .sa-empty-body { color: var(--ink-faint); font-style: italic; }
  @media print {
    body { background: #fff; padding: 0; }
    .sa-page {
      box-shadow: none; border-color: #d9ccae; margin: 0 auto 16px;
      break-inside: avoid;
    }
    .cover { margin-top: 8px; }
  }
  @page { margin: 1.6cm; }
`;

/**
 * Build a complete, self-contained HTML document for the given (already
 * selected + ordered) entries, grouped by year then month. Faithful to the
 * app's styling; opens and prints beautifully anywhere.
 */
export function buildReadableHtml(entries: Entry[], meta: ExportMeta): string {
  const rangeNote =
    entries.length > 0
      ? `${formatLongDate(entries[0].entry_date)} — ${formatLongDate(entries[entries.length - 1].entry_date)}`
      : 'no entries';
  const count = entries.length;

  const sections: string[] = [];
  let curYear = '';
  let curMonth = '';
  for (const e of entries) {
    const year = e.entry_date.slice(0, 4);
    const monthIdx = Number(e.entry_date.slice(5, 7)) - 1;
    if (year !== curYear) {
      sections.push(`<div class="year-head">${escapeHtml(year)}</div>`);
      curYear = year;
      curMonth = '';
    }
    const monthName = MONTHS[monthIdx] ?? '';
    if (monthName !== curMonth) {
      sections.push(`<div class="month-head">${escapeHtml(monthName)}</div>`);
      curMonth = monthName;
    }
    const title = e.title && e.title.trim() ? escapeHtml(e.title) : 'Untitled';
    const bodyHtml = renderBodyHtml(e);
    const body = bodyHtml || '<p class="sa-empty-body">(no writing)</p>';
    sections.push(
      `<article class="sa-page">` +
        `<h1 class="title">${title}</h1>` +
        `<div class="meta-line">${metaLineHtml(e)}</div>` +
        `<div class="sa-body">${body}</div>` +
        `</article>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sanctuary — backup ${escapeHtml(meta.dateStr)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Sorts+Mill+Goudy:ital@0;1&display=swap">
<style>${EXPORT_CSS}</style>
</head>
<body>
<header class="cover">
  <h1>Sanctuary</h1>
  <p class="sub">${count} entr${count === 1 ? 'y' : 'ies'} · ${escapeHtml(rangeNote)}<br>exported ${escapeHtml(meta.dateStr)}</p>
</header>
${sections.join('\n')}
</body>
</html>`;
}

// ── Lossless JSON backup ────────────────────────────────────────────────────

/**
 * Build the complete backup: the full, untouched Entry rows plus a
 * self-describing header. This is the real restore file — every field is
 * preserved, including system tags (e.g. the veil marker) and timestamps.
 */
export function buildBackupJson(entries: Entry[], meta: ExportMeta): string {
  const payload = {
    app: 'Wardrobe',
    kind: 'sanctuary-backup',
    schema_version: 1,
    exported_at: meta.exportedAt,
    entry_count: entries.length,
    note:
      'Complete, lossless backup of Sanctuary entries. Each item in "entries" ' +
      'is the full row from the Supabase "entries" table (room = sanctuary), ' +
      'exactly as stored. Keep this file safe; it can be used to restore.',
    entries,
  };
  return JSON.stringify(payload, null, 2);
}

/** Timestamped filename so exports never overwrite one another. */
export function exportFilename(kind: 'html' | 'json', dateStr: string): string {
  return `sanctuary-backup-${dateStr}.${kind}`;
}
