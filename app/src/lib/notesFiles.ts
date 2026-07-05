// Pure helpers for file cards: MIME grouping (icon/behavior routing),
// human-readable sizes, and middle-truncated filenames. No DOM/Supabase.

export type FileGroup = 'pdf' | 'archive' | 'audio' | 'video' | 'doc' | 'generic';

const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/gzip',
  'application/x-tar',
  'application/x-bzip2',
]);
const ARCHIVE_EXTS = new Set(['zip', '7z', 'rar', 'gz', 'tar', 'bz2', 'tgz']);
const DOC_EXTS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'odt']);

/** Lowercased extension of a filename ('' when none). */
export function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i <= 0 || i === filename.length - 1) return '';
  return filename.slice(i + 1).toLowerCase();
}

/** Group a file for icon + behavior routing. */
export function fileGroup(mime: string, filename = ''): FileGroup {
  if (mime === 'application/pdf' || extOf(filename) === 'pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (ARCHIVE_MIMES.has(mime) || ARCHIVE_EXTS.has(extOf(filename))) return 'archive';
  if (
    mime === 'text/plain' ||
    mime === 'text/csv' ||
    mime === 'application/rtf' ||
    mime === 'application/msword' ||
    mime.startsWith('application/vnd.openxmlformats-officedocument') ||
    mime.startsWith('application/vnd.ms-') ||
    mime.startsWith('application/vnd.oasis.opendocument') ||
    DOC_EXTS.has(extOf(filename))
  ) {
    return 'doc';
  }
  return 'generic';
}

/** '0 B', '412 B', '1.2 KB', '3.4 MB', '1.1 GB' */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  for (const unit of units) {
    v /= 1024;
    if (v < 1024) return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${unit}`;
  }
  return `${v.toFixed(1)} PB`;
}

/**
 * Truncate a filename in the MIDDLE so both the start and the extension
 * stay readable: 'a-very-long-report-name.pdf' → 'a-very-l…name.pdf'.
 */
export function truncateMiddle(name: string, max = 28): string {
  if (name.length <= max) return name;
  const keep = max - 1; // room for the ellipsis
  const tail = Math.ceil(keep * 0.4);
  const head = keep - tail;
  return name.slice(0, head) + '…' + name.slice(name.length - tail);
}
