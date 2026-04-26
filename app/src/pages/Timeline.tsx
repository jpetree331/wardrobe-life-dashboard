import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from '@e965/xlsx';
import {
  bulkInsertTimeline,
  deleteEntry,
  listTimeline,
  timelineYears,
  upsertTimelineEntry,
  type TimelineRow,
} from '../lib/entries';
import { parseFile } from '../lib/timelineImport';
import './Timeline.css';

type YearTab = number | 'all';

type ImportPlan = {
  rows: Array<{ entry_date: string; summary: string; tags: string[] }>;
  fileName: string;
};

export default function Timeline() {
  const navigate = useNavigate();
  const [activeYear, setActiveYear] = useState<YearTab>('all');
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [years, setYears] = useState<{ year: number; count: number }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [edDate, setEdDate] = useState('');
  const [edSummary, setEdSummary] = useState('');
  const [edTags, setEdTags] = useState('');
  const [savingEd, setSavingEd] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Loading…');
  const [statusKey, setStatusKey] = useState(0);
  const [preview, setPreview] = useState<{
    row: TimelineRow;
    top: number;
    left: number;
  } | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [data, ys] = await Promise.all([listTimeline(activeYear), timelineYears()]);
      setRows(data);
      setYears(ys);
      flashStatus(
        data.length === 0
          ? 'No entries yet. Click + entry or drop in your spreadsheet.'
          : `${data.length} entr${data.length === 1 ? 'y' : 'ies'} · ${activeYear === 'all' ? 'all years' : activeYear}`,
      );
    } catch (err) {
      console.error(err);
      flashStatus('Could not load timeline. Check your Supabase connection.');
    }
  }, [activeYear]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-clear status flash after 2.4s
  useEffect(() => {
    if (statusKey === 0) return;
    const t = window.setTimeout(() => {
      const total = rows.length;
      setStatusMsg(
        total === 0
          ? 'No entries yet. Click + entry or drop in your spreadsheet.'
          : `${total} entr${total === 1 ? 'y' : 'ies'} · ${activeYear === 'all' ? 'all years' : activeYear}`,
      );
    }, 2400);
    return () => window.clearTimeout(t);
  }, [statusKey, rows.length, activeYear]);

  function flashStatus(msg: string) {
    setStatusMsg(msg);
    setStatusKey((k) => k + 1);
  }

  // ── Inline summary edit ────────────────────────────────────────────────
  async function commitInlineSummary(row: TimelineRow, newSummary: string) {
    const trimmed = newSummary.trim();
    if (trimmed === (row.summary || '').trim()) return;
    try {
      await upsertTimelineEntry({
        id: row.id,
        entry_date: row.entry_date,
        summary: trimmed,
        tags: row.tags,
      });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, summary: trimmed } : r)));
      flashStatus('Saved.');
    } catch (err) {
      console.error(err);
      flashStatus('Save failed.');
    }
  }

  // ── Side editor ────────────────────────────────────────────────────────
  function openEditor(row: TimelineRow) {
    setEditingId(row.id);
    setEdDate(row.entry_date);
    setEdSummary(row.summary || '');
    setEdTags((row.tags || []).join(', '));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    // delay clearing the id so the slide-out animation looks clean
    window.setTimeout(() => setEditingId(null), 280);
  }

  async function saveEditor() {
    if (!editingId) return;
    setSavingEd(true);
    try {
      const tags = edTags.split(',').map((s) => s.trim()).filter(Boolean);
      await upsertTimelineEntry({
        id: editingId,
        entry_date: edDate,
        summary: edSummary,
        tags,
      });
      flashStatus('Saved.');
      closeEditor();
      await refresh();
    } catch (err: any) {
      console.error(err);
      flashStatus(err?.code === '23505' ? 'Another entry already exists for that date.' : 'Save failed.');
    } finally {
      setSavingEd(false);
    }
  }

  async function deleteEditor() {
    if (!editingId) return;
    if (!window.confirm('Delete this entry?')) return;
    setSavingEd(true);
    try {
      await deleteEntry(editingId);
      flashStatus('Deleted.');
      closeEditor();
      await refresh();
    } catch (err) {
      console.error(err);
      flashStatus('Delete failed.');
    } finally {
      setSavingEd(false);
    }
  }

  // ── Add new ────────────────────────────────────────────────────────────
  async function addToday() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const created = await upsertTimelineEntry({
        entry_date: today,
        summary: '',
        tags: [],
      });
      if (activeYear !== 'all' && !today.startsWith(String(activeYear))) {
        setActiveYear(Number(today.slice(0, 4)));
      }
      await refresh();
      // open the editor on the newly-created row
      const newRow: TimelineRow = {
        id: created.id,
        user_id: created.user_id,
        entry_date: created.entry_date,
        title: created.title,
        summary: created.body,
        tags: created.tags,
        created_at: created.created_at,
        updated_at: created.updated_at,
        sanctuary_id: null,
        sanctuary_title: null,
        sanctuary_scripture_refs: null,
      };
      openEditor(newRow);
    } catch (err: any) {
      console.error(err);
      // Already exists for today → load it and open editor. Don't read from
      // local `rows` here — the closure captured it before refresh().
      if (err?.code === '23505') {
        const fresh = await listTimeline('all');
        const existing = fresh.find((r) => r.entry_date === today);
        if (existing) {
          setRows(fresh);
          openEditor(existing);
        } else {
          flashStatus('An entry for today already exists.');
        }
      } else {
        flashStatus('Could not create entry.');
      }
    }
  }

  // ── Sanctuary link / preview ───────────────────────────────────────────
  function openSanctuary(row: TimelineRow) {
    navigate(`/sanctuary?date=${row.entry_date}${row.sanctuary_id ? `&id=${row.sanctuary_id}` : ''}`);
  }

  function showPreview(row: TimelineRow, target: HTMLElement) {
    const r = target.getBoundingClientRect();
    setPreview({
      row,
      top: Math.max(20, r.top - 12),
      left: Math.max(20, r.left - 380),
    });
  }
  function hidePreview() { setPreview(null); }

  // ── Import / Export ────────────────────────────────────────────────────
  async function handleFile(file: File) {
    flashStatus(`Reading ${file.name}…`);
    try {
      const parsed = await parseFile(file);
      const accepted = parsed.filter((r) => r.entry_date && r.summary);
      if (accepted.length === 0) {
        flashStatus(`Couldn't find any rows in ${file.name}.`);
        return;
      }
      setImportPlan({ rows: accepted, fileName: file.name });
    } catch (err) {
      console.error(err);
      flashStatus(`Could not read ${file.name}.`);
    }
  }

  async function performImport(mode: 'skip' | 'overwrite') {
    if (!importPlan) return;
    flashStatus(`Importing ${importPlan.rows.length} entries…`);
    const plan = importPlan;
    setImportPlan(null);
    try {
      const result = await bulkInsertTimeline(plan.rows, mode);
      flashStatus(
        `Imported ${result.inserted}${result.skipped ? ` · skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}` : ''} from ${plan.fileName}.`,
      );
      await refresh();
    } catch (err) {
      console.error(err);
      flashStatus('Import failed. Some rows may have been added.');
      await refresh();
    }
  }

  async function exportXlsx() {
    try {
      // Pull all entries (across years) for export
      const all = await listTimeline('all');
      const wb = XLSX.utils.book_new();
      const yearMap = new Map<string, typeof all>();
      for (const row of all) {
        const y = row.entry_date.slice(0, 4);
        if (!yearMap.has(y)) yearMap.set(y, []);
        yearMap.get(y)!.push(row);
      }
      const sortedYears = [...yearMap.keys()].sort((a, b) => Number(b) - Number(a));
      for (const y of sortedYears) {
        const rs = yearMap.get(y)!
          .slice()
          .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
          .map((r) => ({
            Date: r.entry_date,
            'One-sentence highlight': r.summary || '',
            Tags: (r.tags || []).join(', '),
          }));
        const ws = XLSX.utils.json_to_sheet(rs);
        XLSX.utils.book_append_sheet(wb, ws, y);
      }
      XLSX.writeFile(wb, 'wardrobe-timeline.xlsx');
      flashStatus('Exported wardrobe-timeline.xlsx.');
    } catch (err) {
      console.error(err);
      flashStatus('Export failed.');
    }
  }

  // Drag-and-drop. Keep enter/leave SYMMETRIC — filtering enter on Files
  // type but not leave (because dataTransfer is masked on leave for security)
  // would let the depth counter drift negative on non-file drags and never
  // recover.
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types && e.dataTransfer.types.includes('Files');
    const onEnter = (e: DragEvent) => {
      depth++;
      if (isFiles(e)) setDropOver(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropOver(false);
    };
    const onOver = (e: DragEvent) => {
      // Need to preventDefault on dragover to allow the drop event to fire.
      if (isFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDropOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) handleFile(f);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // ── Year tabs (always show 'All' + every year that has rows) ───────────
  const yearTabs = useMemo<Array<{ value: YearTab; label: string; count: number }>>(() => {
    const total = years.reduce((acc, y) => acc + y.count, 0);
    return [
      { value: 'all', label: 'All', count: total },
      ...years.map((y) => ({ value: y.year, label: String(y.year), count: y.count })),
    ];
  }, [years]);

  return (
    <div className="timeline-page">
      <header className="tl-ribbon">
        <div className="left">
          <Link className="back" to="/">← hallway</Link>
          <div className="place">Timeline</div>
          <span className="meta">One sentence per day · across the years</span>
        </div>
        <div className="right">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <button className="tl-btn-quiet" onClick={() => fileInputRef.current?.click()}>Import…</button>
          <button className="tl-btn-quiet" onClick={exportXlsx}>Export</button>
          <button className="tl-btn-quiet" onClick={addToday}>+ entry</button>
        </div>
      </header>

      <nav className="tl-year-tabs" aria-label="Years">
        {yearTabs.map((t) => (
          <button
            key={String(t.value)}
            className="tl-year-tab"
            aria-pressed={t.value === activeYear}
            onClick={() => setActiveYear(t.value)}
          >
            {t.label}
            <span className="count">{t.count}</span>
          </button>
        ))}
        <button
          className="add-year"
          onClick={async () => {
            const y = window.prompt('Add year', String(new Date().getFullYear()));
            if (!y || !/^\d{4}$/.test(y)) return;
            // Seed the year by creating a Jan-1 placeholder, then open the editor
            try {
              const created = await upsertTimelineEntry({
                entry_date: `${y}-01-01`,
                summary: '',
                tags: [],
              });
              setActiveYear(Number(y));
              await refresh();
              openEditor({
                id: created.id,
                user_id: created.user_id,
                entry_date: created.entry_date,
                title: null,
                summary: created.body,
                tags: created.tags,
                created_at: created.created_at,
                updated_at: created.updated_at,
                sanctuary_id: null,
                sanctuary_title: null,
                sanctuary_scripture_refs: null,
              });
            } catch (err: any) {
              if (err?.code === '23505') {
                setActiveYear(Number(y));
                await refresh();
              } else {
                console.error(err);
                flashStatus('Could not add year.');
              }
            }
          }}
        >
          + year
        </button>
      </nav>

      <main className="tl-sheet-wrap">
        <div className="tl-sheet">
          <div className="tl-sheet-head">
            <div>Date</div>
            <div>One-sentence highlight</div>
            <div>Tags</div>
            <div title="Linked Sanctuary entry">✦</div>
          </div>
          <div>
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                onCommit={commitInlineSummary}
                onOpenEditor={openEditor}
                onSanctuaryClick={openSanctuary}
                onSanctuaryHover={(target) => showPreview(row, target)}
                onSanctuaryLeave={hidePreview}
              />
            ))}
            {rows.length === 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-faint)', fontStyle: 'italic' }}>
                Nothing here yet. Click <em>+ entry</em>, or drop your existing
                spreadsheet anywhere on the page.
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="tl-status">
        <div>{statusMsg}</div>
        <div>
          {activeYear === 'all' ? 'all years' : activeYear}
          {' · '}
          {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
        </div>
      </footer>

      {preview && (
        <div className="tl-preview" style={{ top: preview.top, left: preview.left }}>
          <div className="head">{preview.row.entry_date} · Sanctuary</div>
          <div className="title">{preview.row.sanctuary_title || 'Prayer journal entry'}</div>
          <div style={{ fontStyle: 'italic', color: 'var(--ink-soft)' }}>
            {preview.row.summary}
          </div>
          <a className="open-link" onClick={() => openSanctuary(preview.row)}>
            Open prayer journal entry →
          </a>
        </div>
      )}

      <aside className={`tl-editor${editorOpen ? ' open' : ''}`} aria-label="Edit entry">
        <div className="head">
          <h3>Entry</h3>
          <button className="close-btn" onClick={closeEditor}>close</button>
        </div>
        <div className="body">
          <label>Date</label>
          <input
            type="date"
            value={edDate}
            onChange={(e) => setEdDate(e.target.value)}
          />
          <label>One-sentence highlight</label>
          <textarea
            value={edSummary}
            onChange={(e) => setEdSummary(e.target.value)}
            placeholder="The one thing that mattered today."
          />
          <label>
            Tags{' '}
            <span style={{ fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, color: 'var(--ink-faint)', fontSize: 12 }}>
              (comma-separated)
            </span>
          </label>
          <input
            type="text"
            value={edTags}
            onChange={(e) => setEdTags(e.target.value)}
            placeholder="family, prayer, work"
          />

          {editingId && (() => {
            const row = rows.find((r) => r.id === editingId);
            if (!row?.sanctuary_id) return null;
            return (
              <div className="sanctuary-link">
                <span className="sig">Linked Sanctuary entry</span>
                <a onClick={() => openSanctuary(row)}>{row.sanctuary_title || 'Open prayer journal entry'}</a>
                <div style={{ fontStyle: 'italic', color: 'var(--ink-faint)', marginTop: 6, fontSize: 12 }}>
                  Same date in Sanctuary — opens the full entry.
                </div>
              </div>
            );
          })()}

          <div className="actions">
            <button className="primary" onClick={saveEditor} disabled={savingEd}>
              {savingEd ? 'Saving…' : 'Save'}
            </button>
            <button onClick={deleteEditor} disabled={savingEd}>Delete</button>
          </div>
        </div>
      </aside>

      {dropOver && (
        <div className="tl-dropzone">
          <div className="panel">Drop your timeline file</div>
        </div>
      )}

      {importPlan && (
        <div className="tl-modal-bg" onClick={() => setImportPlan(null)}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Import {importPlan.fileName}</h2>
            <p>Found <strong>{importPlan.rows.length}</strong> entries with a date and a sentence.</p>
            <p style={{ color: 'var(--ink-faint)', fontStyle: 'italic' }}>
              How should duplicates be handled when a date already exists?
            </p>
            <div className="modal-actions">
              <button onClick={() => setImportPlan(null)}>Cancel</button>
              <button onClick={() => performImport('skip')}>Skip duplicates</button>
              <button className="primary" onClick={() => performImport('overwrite')}>Overwrite duplicates</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────────────

function Row({
  row,
  onCommit,
  onOpenEditor,
  onSanctuaryClick,
  onSanctuaryHover,
  onSanctuaryLeave,
}: {
  row: TimelineRow;
  onCommit: (row: TimelineRow, newSummary: string) => void;
  onOpenEditor: (row: TimelineRow) => void;
  onSanctuaryClick: (row: TimelineRow) => void;
  onSanctuaryHover: (target: HTMLElement) => void;
  onSanctuaryLeave: () => void;
}) {
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const linked = !!row.sanctuary_id;

  // Sync DOM text from row.summary when the row changes (controlled-ish).
  // Skip while the user is actively editing — otherwise an unrelated re-render
  // (status flash, parent state change) would yank their cursor out and
  // overwrite their unsaved keystrokes.
  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== (row.summary || '')) {
      el.textContent = row.summary || '';
    }
  }, [row.summary]);

  return (
    <div
      className="tl-row"
      onClick={(ev) => {
        const t = ev.target as HTMLElement;
        if (t.closest('.summary') || t.closest('.tl-link-icon')) return;
        onOpenEditor(row);
      }}
    >
      <div className="date">{row.entry_date}</div>
      <div>
        <div
          ref={summaryRef}
          className="summary"
          contentEditable
          spellCheck
          suppressContentEditableWarning
          data-empty={!row.summary || row.summary.trim() === '' ? 'true' : 'false'}
          data-placeholder="One sentence — what mattered today?"
          onBlur={(e) => onCommit(row, (e.target as HTMLDivElement).textContent || '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLDivElement).blur(); }
          }}
        />
      </div>
      <div className="tags">
        {(row.tags || []).map((t) => (
          <span key={t} className="tl-tag">{t}</span>
        ))}
      </div>
      <div className="link-cell">
        <button
          className={`tl-link-icon${linked ? '' : ' disabled'}`}
          title={linked ? 'Open in Sanctuary' : 'No Sanctuary entry'}
          onClick={(ev) => {
            ev.stopPropagation();
            if (linked) onSanctuaryClick(row);
          }}
          onMouseEnter={(ev) => { if (linked) onSanctuaryHover(ev.currentTarget); }}
          onMouseLeave={onSanctuaryLeave}
        >
          {linked ? '✦' : '·'}
        </button>
      </div>
    </div>
  );
}

// File parsing helpers live in lib/timelineImport.ts so they can be unit-tested.
