// Sanctuary "Back up / Export" modal.
//
// READ-ONLY by construction: it receives the entries array the Sanctuary page
// already holds in memory and never fetches, writes, or deletes anything. All
// it does is filter that array, build a string (HTML or JSON) via the pure
// lib/sanctuaryExport builders, and hand the string to the browser as a file
// download or a print view. It cannot alter the user's data.

import { useMemo, useState } from 'react';
import type { Entry } from '../lib/entries';
import {
  buildBackupJson,
  buildReadableHtml,
  entryTypeLabel,
  exportFilename,
  formatLongDate,
  selectEntriesForExport,
  type ExportMeta,
} from '../lib/sanctuaryExport';
import { localToday } from '../lib/dates';

/** Trigger a browser download of a text file (no libraries, no side effects
 *  beyond creating and revoking a temporary object URL). */
function downloadTextFile(filename: string, mime: string, contents: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has surely started.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Open the readable HTML in a hidden iframe and invoke the print dialog —
 *  no popup window, so nothing is blocked and the app stays put. */
function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow!;
  const go = () => {
    win.focus();
    win.print();
    // Leave the iframe long enough for the print dialog to read from it.
    setTimeout(() => iframe.remove(), 60000);
  };
  // Wait for the web fonts to load so the PDF matches the app; fall back to
  // a fixed delay if the Font Loading API is unavailable or slow.
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready) {
    let done = false;
    const fire = () => { if (!done) { done = true; go(); } };
    fonts.ready.then(fire).catch(fire);
    setTimeout(fire, 2500); // safety net: never hang waiting on fonts
  } else if (doc.readyState === 'complete') {
    setTimeout(go, 400);
  } else {
    iframe.onload = () => setTimeout(go, 400);
  }
}

export function SanctuaryExportModal({
  entries,
  onClose,
}: {
  entries: Entry[];
  onClose: () => void;
}) {
  // Bounds of the user's history, for sensible default date inputs.
  const bounds = useMemo(() => {
    if (entries.length === 0) return { min: '', max: '' };
    let min = entries[0].entry_date;
    let max = entries[0].entry_date;
    for (const e of entries) {
      if (e.entry_date < min) min = e.entry_date;
      if (e.entry_date > max) max = e.entry_date;
    }
    return { min, max };
  }, [entries]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Entries within the current date range, newest-first for the checklist.
  const inRange = useMemo(() => {
    const list = entries.filter((e) => {
      if (from && e.entry_date < from) return false;
      if (to && e.entry_date > to) return false;
      return true;
    });
    return list
      .slice()
      .sort(
        (a, b) =>
          b.entry_date.localeCompare(a.entry_date) ||
          (b.created_at || '').localeCompare(a.created_at || ''),
      );
  }, [entries, from, to]);

  // Which entries are checked. `null` means "everything selected" — the
  // default, and deliberately NOT a snapshot of ids taken at mount. If the
  // modal is opened before entries finish loading, or entries arrive later,
  // they stay selected-by-default and can never be silently dropped from a
  // backup. An explicit Set materializes only once the user unchecks
  // something. A helper set of all ids seeds that materialization.
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const allIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);
  const isChecked = (id: string) => checked === null || checked.has(id);

  const inRangeIds = useMemo(() => inRange.map((e) => e.id), [inRange]);
  const selectedInRange = useMemo(
    () => inRangeIds.filter(isChecked),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isChecked derives from `checked`
    [inRangeIds, checked],
  );
  const selectedCount = selectedInRange.length;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev ?? allIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllInRange() {
    setChecked((prev) => {
      const next = new Set(prev ?? allIds);
      for (const id of inRangeIds) next.add(id);
      return next;
    });
  }
  function deselectAllInRange() {
    setChecked((prev) => {
      const next = new Set(prev ?? allIds);
      for (const id of inRangeIds) next.delete(id);
      return next;
    });
  }

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /** The entries the current selection resolves to, chronologically ordered.
   *  `checked === null` means "all", so no id filter is applied — only the
   *  date range narrows it. */
  function resolveSelection(): Entry[] {
    return selectEntriesForExport(entries, {
      from: from || null,
      to: to || null,
      selectedIds: checked, // null → no id filter (everything in range)
    });
  }

  function makeMeta(): ExportMeta {
    return { exportedAt: new Date().toISOString(), dateStr: localToday() };
  }

  function doDownloadHtml() {
    const chosen = resolveSelection();
    if (chosen.length === 0) return;
    const meta = makeMeta();
    downloadTextFile(exportFilename('html', meta.dateStr), 'text/html', buildReadableHtml(chosen, meta));
    setNote(`Saved a readable page of ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'}.`);
  }

  function doPrint() {
    const chosen = resolveSelection();
    if (chosen.length === 0) return;
    printHtml(buildReadableHtml(chosen, makeMeta()));
    setNote('Opening your print dialog — choose “Save as PDF” as the destination.');
  }

  function doDownloadJson() {
    const chosen = resolveSelection();
    if (chosen.length === 0) return;
    const meta = makeMeta();
    downloadTextFile(exportFilename('json', meta.dateStr), 'application/json', buildBackupJson(chosen, meta));
    setNote(`Saved a complete backup of ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'}. Keep it somewhere safe.`);
  }

  function guard(fn: () => void) {
    if (busy || selectedCount === 0) return;
    setBusy(true);
    try {
      fn();
    } finally {
      // The download/print is synchronous to hand-off; clear the busy state
      // shortly after so the buttons re-enable.
      setTimeout(() => setBusy(false), 600);
    }
  }

  return (
    <div className="sa-export-bg" onMouseDown={onClose}>
      <div className="sa-export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sa-export-head">
          <div>
            <h2>Back up &amp; export</h2>
            <p className="sub">
              A read-only copy of your Sanctuary. Nothing here can change or delete an entry.
            </p>
          </div>
          <button className="sa-export-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="sa-export-controls">
          <label className="sa-export-range">
            <span>From</span>
            <input type="date" value={from} min={bounds.min} max={bounds.max}
              onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="sa-export-range">
            <span>To</span>
            <input type="date" value={to} min={bounds.min} max={bounds.max}
              onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button className="sa-export-linkbtn" onClick={() => { setFrom(''); setTo(''); }}>
              clear range
            </button>
          )}
          <div className="sa-export-spacer" />
          <button className="sa-export-linkbtn" onClick={selectAllInRange}>select all</button>
          <button className="sa-export-linkbtn" onClick={deselectAllInRange}>deselect all</button>
        </div>

        <div className="sa-export-count">
          {selectedCount} of {inRange.length} shown entr{inRange.length === 1 ? 'y' : 'ies'} selected
          {entries.length !== inRange.length && (
            <span className="muted"> · {entries.length} in all</span>
          )}
        </div>

        <div className="sa-export-list">
          {inRange.length === 0 ? (
            <div className="sa-export-empty">No entries in this date range.</div>
          ) : (
            inRange.map((e) => {
              const type = entryTypeLabel(e.entry_type);
              return (
                <label key={e.id} className="sa-export-row">
                  <input
                    type="checkbox"
                    checked={isChecked(e.id)}
                    onChange={() => toggle(e.id)}
                  />
                  <span className="sa-export-date">{formatLongDate(e.entry_date)}</span>
                  <span className="sa-export-title">{e.title?.trim() || 'Untitled'}</span>
                  {type && <span className="sa-export-type">{type}</span>}
                </label>
              );
            })
          )}
        </div>

        {note && <div className="sa-export-note">{note}</div>}

        <footer className="sa-export-actions">
          <div className="sa-export-group">
            <span className="sa-export-group-label">Readable</span>
            <button disabled={busy || selectedCount === 0} onClick={() => guard(doDownloadHtml)}>
              Download page (.html)
            </button>
            <button disabled={busy || selectedCount === 0} onClick={() => guard(doPrint)}>
              Save as PDF…
            </button>
          </div>
          <div className="sa-export-group">
            <span className="sa-export-group-label">Backup</span>
            <button className="primary" disabled={busy || selectedCount === 0} onClick={() => guard(doDownloadJson)}>
              Download full backup (.json)
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
