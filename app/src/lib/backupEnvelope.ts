// Pure helpers shared by the Timeline and Data backups. No DOM, no Supabase,
// no mutation — they wrap already-fetched records into a self-describing,
// lossless JSON envelope and produce timestamped filenames.

export type BackupMeta = {
  /** ISO timestamp, passed in so the builder stays pure/testable. */
  exportedAt: string;
  /** 'YYYY-MM-DD' local date, for the header + filename. */
  dateStr: string;
};

/**
 * Wrap a payload of records into the standard Wardrobe backup envelope and
 * serialize it, pretty-printed. `payload` is spread in verbatim — every field
 * of every record is preserved exactly (lossless). `note` describes what the
 * file is and how it maps back to the database.
 */
export function buildJsonBackup(
  kind: string,
  note: string,
  payload: Record<string, unknown>,
  meta: BackupMeta,
): string {
  return JSON.stringify(
    {
      app: 'Wardrobe',
      kind,
      schema_version: 1,
      exported_at: meta.exportedAt,
      note,
      ...payload,
    },
    null,
    2,
  );
}

/** Timestamped filename so backups never overwrite one another. */
export function backupFilename(area: string, kind: 'html' | 'json', dateStr: string): string {
  return `${area}-backup-${dateStr}.${kind}`;
}

/** Escape text for safe embedding in exported HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Long, timezone-safe date label, e.g. "Sunday, 5 July 2026". */
export function formatLongDate(ymd: string): string {
  const parts = (ymd || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd || '';
  const [y, m, d] = parts;
  const wd = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[wd]}, ${d} ${MONTHS[m - 1] ?? ''} ${y}`;
}

/** The shared parchment stylesheet + font links for readable HTML exports. */
export const EXPORT_HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Sorts+Mill+Goudy:ital@0;1&display=swap">`;

export const EXPORT_BASE_CSS = `
  :root {
    --bg: #efe7d6; --page: #f6efde; --ink: #2b2419; --ink-soft: #5a4f3c;
    --ink-faint: #8a7d63; --line: #2b241933; --accent: #7a6a3a;
    --accent-strong: #9c8240; --red: #8a2a1a;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--ink); margin: 0;
    font-family: 'EB Garamond', Georgia, serif; -webkit-font-smoothing: antialiased;
    padding: 40px 20px 80px; line-height: 1.6;
  }
  .cover { max-width: 720px; margin: 0 auto 32px; text-align: center; }
  .cover h1 {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400;
    font-size: 40px; letter-spacing: 0.28em; text-transform: uppercase;
    color: var(--ink-soft); margin: 0 0 10px;
  }
  .cover .sub { font-style: italic; color: var(--ink-faint); font-size: 14px; margin: 0; line-height: 1.6; }
  .sheet {
    max-width: 720px; margin: 0 auto; background: var(--page);
    border: 1px solid #e4d8bf; border-radius: 2px; padding: 34px 40px;
    box-shadow: 0 24px 60px -30px rgba(43,36,25,0.25), 0 2px 10px -4px rgba(43,36,25,0.08);
  }
  .year-head {
    font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500;
    font-size: 22px; letter-spacing: 0.12em; color: var(--ink-soft);
    border-bottom: 1px solid var(--line); padding-bottom: 6px; margin: 26px 0 6px;
  }
  .year-head:first-child { margin-top: 0; }
  h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 500; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-color: #d9ccae; }
  }
  @page { margin: 1.6cm; }
`;
