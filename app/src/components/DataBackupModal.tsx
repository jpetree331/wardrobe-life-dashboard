// Data-room "Back up" modal. READ-ONLY: it receives the reading tables the Data
// page already holds in memory and only builds strings from them — it never
// writes, deletes, or mutates. No per-record selection: it backs up everything.

import { useState } from 'react';
import {
  buildDataBackupJson,
  buildDataReadableHtml,
  dataExportFilename,
  ownedScriptureReads,
  type DataBackupTables,
} from '../lib/dataExport';
import type { BackupMeta } from '../lib/backupEnvelope';
import { downloadTextFile, printHtml } from '../lib/exportDownload';
import { localToday } from '../lib/dates';

export function DataBackupModal({
  tables,
  onClose,
}: {
  tables: DataBackupTables;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const scriptureCount = ownedScriptureReads(tables.scriptureReads).length;
  const isEmpty =
    scriptureCount === 0 &&
    tables.bookReads.length === 0 &&
    tables.dailyPages.length === 0 &&
    tables.plans.length === 0;

  function meta(): BackupMeta {
    return { exportedAt: new Date().toISOString(), dateStr: localToday() };
  }
  function guard(fn: () => void) {
    if (busy || isEmpty) return;
    setBusy(true);
    try { fn(); } finally { setTimeout(() => setBusy(false), 600); }
  }

  return (
    <div className="sa-export-bg" onMouseDown={onClose}>
      <div className="sa-export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="sa-export-head">
          <div>
            <h2>Back up &amp; export · Data</h2>
            <p className="sub">A read-only copy of your reading records. Nothing here can change your data.</p>
          </div>
          <button className="sa-export-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="sa-data-backup-body">
          <p className="sa-data-backup-lead">This captures everything the Data room holds:</p>
          <ul className="sa-data-backup-list">
            <li><b>{scriptureCount}</b> scripture reads <span className="muted">(your manual log)</span></li>
            <li><b>{tables.bookReads.length}</b> books finished</li>
            <li><b>{tables.dailyPages.length}</b> daily-page logs</li>
            <li><b>{tables.plans.length}</b> reading plans <span className="muted">and their progress</span></li>
          </ul>
          <p className="sa-data-backup-fine">
            Scripture references you tagged in Sanctuary aren’t duplicated here — they travel with your Sanctuary backup.
          </p>
        </div>

        {note && <div className="sa-export-note">{note}</div>}

        <footer className="sa-export-actions">
          <div className="sa-export-group">
            <span className="sa-export-group-label">Readable</span>
            <button disabled={busy || isEmpty} onClick={() => guard(() => {
              const m = meta();
              downloadTextFile(dataExportFilename('html', m.dateStr), 'text/html', buildDataReadableHtml(tables, m));
              setNote('Saved a readable reading report.');
            })}>Download report (.html)</button>
            <button disabled={busy || isEmpty} onClick={() => guard(() => {
              printHtml(buildDataReadableHtml(tables, meta()));
              setNote('Opening your print dialog — choose “Save as PDF”.');
            })}>Save as PDF…</button>
          </div>
          <div className="sa-export-group">
            <span className="sa-export-group-label">Backup</span>
            <button className="primary" disabled={busy || isEmpty} onClick={() => guard(() => {
              const m = meta();
              downloadTextFile(dataExportFilename('json', m.dateStr), 'application/json', buildDataBackupJson(tables, m));
              setNote('Saved a complete backup of your reading records. Keep it safe.');
            })}>Download full backup (.json)</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
