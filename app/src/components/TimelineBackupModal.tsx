// Timeline "Back up" modal. READ-ONLY: it receives the full TimelineRow list
// (fetched once, read-only, by the page) and only ever builds strings from it —
// never writes, deletes, or mutates. Mirrors the Sanctuary export modal.

import { useMemo, useState } from 'react';
import type { TimelineRow } from '../lib/entries';
import {
  buildTimelineBackupJson,
  buildTimelineReadableHtml,
  selectTimelineForExport,
  timelineExportFilename,
} from '../lib/timelineExport';
import { formatLongDate, type BackupMeta } from '../lib/backupEnvelope';
import { downloadTextFile, printHtml } from '../lib/exportDownload';
import { localToday } from '../lib/dates';

export function TimelineBackupModal({
  rows,
  onClose,
}: {
  rows: TimelineRow[];
  onClose: () => void;
}) {
  const bounds = useMemo(() => {
    if (rows.length === 0) return { min: '', max: '' };
    let min = rows[0].entry_date;
    let max = rows[0].entry_date;
    for (const r of rows) {
      if (r.entry_date < min) min = r.entry_date;
      if (r.entry_date > max) max = r.entry_date;
    }
    return { min, max };
  }, [rows]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const inRange = useMemo(() => {
    return rows
      .filter((r) => {
        if (from && r.entry_date < from) return false;
        if (to && r.entry_date > to) return false;
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          b.entry_date.localeCompare(a.entry_date) ||
          (b.created_at || '').localeCompare(a.created_at || ''),
      );
  }, [rows, from, to]);

  // null = "everything selected" — robust against the list loading late (see
  // the Sanctuary modal). An explicit Set materializes only on deselection.
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const allIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const isChecked = (id: string) => checked === null || checked.has(id);
  const inRangeIds = useMemo(() => inRange.map((r) => r.id), [inRange]);
  const selectedCount = useMemo(
    () => inRangeIds.filter(isChecked).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inRangeIds, checked],
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev ?? allIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setChecked((prev) => { const n = new Set(prev ?? allIds); for (const id of inRangeIds) n.add(id); return n; });
  }
  function deselectAll() {
    setChecked((prev) => { const n = new Set(prev ?? allIds); for (const id of inRangeIds) n.delete(id); return n; });
  }

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function resolve(): TimelineRow[] {
    return selectTimelineForExport(rows, { from: from || null, to: to || null, selectedIds: checked });
  }
  function meta(): BackupMeta {
    return { exportedAt: new Date().toISOString(), dateStr: localToday() };
  }
  function guard(fn: () => void) {
    if (busy || selectedCount === 0) return;
    setBusy(true);
    try { fn(); } finally { setTimeout(() => setBusy(false), 600); }
  }

  return (
    <div className="sa-export-bg" onMouseDown={onClose}>
      <div className="sa-export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sa-export-head">
          <div>
            <h2>Back up &amp; export · Timeline</h2>
            <p className="sub">A read-only copy of your Timeline. Nothing here can change an entry.</p>
          </div>
          <button className="sa-export-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="sa-export-controls">
          <label className="sa-export-range"><span>From</span>
            <input type="date" value={from} min={bounds.min} max={bounds.max} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="sa-export-range"><span>To</span>
            <input type="date" value={to} min={bounds.min} max={bounds.max} onChange={(e) => setTo(e.target.value)} /></label>
          {(from || to) && <button className="sa-export-linkbtn" onClick={() => { setFrom(''); setTo(''); }}>clear range</button>}
          <div className="sa-export-spacer" />
          <button className="sa-export-linkbtn" onClick={selectAll}>select all</button>
          <button className="sa-export-linkbtn" onClick={deselectAll}>deselect all</button>
        </div>

        <div className="sa-export-count">
          {selectedCount} of {inRange.length} shown entr{inRange.length === 1 ? 'y' : 'ies'} selected
        </div>

        <div className="sa-export-list">
          {inRange.length === 0 ? (
            <div className="sa-export-empty">No entries in this date range.</div>
          ) : (
            inRange.map((r) => (
              <label key={r.id} className="sa-export-row">
                <input type="checkbox" checked={isChecked(r.id)} onChange={() => toggle(r.id)} />
                <span className="sa-export-date">{formatLongDate(r.entry_date)}</span>
                <span className="sa-export-title">{r.title?.trim() || '—'}</span>
              </label>
            ))
          )}
        </div>

        {note && <div className="sa-export-note">{note}</div>}

        <footer className="sa-export-actions">
          <div className="sa-export-group">
            <span className="sa-export-group-label">Readable</span>
            <button disabled={busy || selectedCount === 0} onClick={() => guard(() => {
              const chosen = resolve(); const m = meta();
              downloadTextFile(timelineExportFilename('html', m.dateStr), 'text/html', buildTimelineReadableHtml(chosen, m));
              setNote(`Saved a readable page of ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'}.`);
            })}>Download page (.html)</button>
            <button disabled={busy || selectedCount === 0} onClick={() => guard(() => {
              printHtml(buildTimelineReadableHtml(resolve(), meta()));
              setNote('Opening your print dialog — choose “Save as PDF”.');
            })}>Save as PDF…</button>
          </div>
          <div className="sa-export-group">
            <span className="sa-export-group-label">Backup</span>
            <button className="primary" disabled={busy || selectedCount === 0} onClick={() => guard(() => {
              const chosen = resolve(); const m = meta();
              downloadTextFile(timelineExportFilename('json', m.dateStr), 'application/json', buildTimelineBackupJson(chosen, m));
              setNote(`Saved a complete backup of ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'}. Keep it safe.`);
            })}>Download full backup (.json)</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
