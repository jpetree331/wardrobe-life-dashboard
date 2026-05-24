// Daybook — time-block scheduler.
//
// A visually distinct room from the parchment family: vibrant kid-puzzle
// palette, Newsreader serif headings, Work Sans UI, JetBrains Mono for
// time/meta. All styles scoped under .daybook-page so the vibrant world
// stays sealed inside.
//
// Build 1 ships: app shell + Day view + block CRUD modal + category
// management. Drag-to-create, Week/Month views, Pomodoro, Weekly Review,
// keyboard shortcuts, and templates all land in later builds.
//
// Schema: app/supabase/migrations/0007_daybook.sql
// CRUD:   src/lib/daybook.ts

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createBlock,
  createCategory,
  deleteBlock,
  deleteCategory,
  isoToLocalTime12h,
  isoToLocalTimeHHMM,
  listBlocksForRange,
  listCategories,
  localDateKey,
  localDayEndIso,
  localDayStartIso,
  combineLocalDateTimeToIso,
  seedDefaultCategoriesIfEmpty,
  updateBlock,
  updateCategory,
  type DaybookBlock,
  type DaybookCategory,
  type DaybookRecur,
} from '../lib/daybook';
import { useFavicon } from '../hooks/useFavicon';
import './Daybook.css';

// ── Layout constants ──────────────────────────────────────────────────

const HOUR_START = 6;   // 6 AM — top of canvas
const HOUR_END = 23;    // 11 PM — bottom of canvas
const ROW_H = 72;       // comfy density per handoff

const RECUR_OPTIONS: Array<{ value: DaybookRecur; label: string }> = [
  { value: 'none',     label: 'Just this time' },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly',   label: 'Weekly' },
];

// Neutral fallback color for orphaned blocks (category deleted).
const ORPHAN_COLOR = '#9498A8';

// ── Page ──────────────────────────────────────────────────────────────

type BlockModalState =
  | { mode: 'add'; defaultStart?: string; defaultEnd?: string }
  | { mode: 'edit'; block: DaybookBlock };

type CategoryModalState =
  | { mode: 'add' }
  | { mode: 'edit'; category: DaybookCategory };

export default function Daybook() {
  useFavicon('/icons/wardrobe1.png', 'Daybook · Wardrobe');

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [blocks, setBlocks] = useState<DaybookBlock[]>([]);
  const [categories, setCategories] = useState<DaybookCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [blockModal, setBlockModal] = useState<BlockModalState | null>(null);
  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  // Build 2 — selection: which block has the 2px ink ring, edited by
  // double-click. Esc deselects. Selection survives navigation; the
  // edit modal opens directly without disturbing it.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Esc deselects, OR closes any open modal. Modals already trap Esc
  // via their own handlers, so this only fires when no modal is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockModal && !categoryModal && selectedBlockId) {
        setSelectedBlockId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [blockModal, categoryModal, selectedBlockId]);

  // Initial mount: seed categories if empty, then load.
  const refreshBlocks = useCallback(async (date: Date) => {
    try {
      const start = localDayStartIso(date);
      const end = localDayEndIso(date);
      const data = await listBlocksForRange(start, end);
      setBlocks(data);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load blocks.');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const cats = await seedDefaultCategoriesIfEmpty();
      setCategories(cats);
      await refreshBlocks(selectedDate);
      setLoaded(true);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load Daybook. Have you run migration 0007?');
      setLoaded(true);
    }
  }, [selectedDate, refreshBlocks]);

  useEffect(() => { refreshAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) refreshBlocks(selectedDate); }, [selectedDate, loaded, refreshBlocks]);

  // Status summary
  useEffect(() => {
    if (!loaded) return;
    if (blocks.length === 0) {
      setStatusMsg(`No blocks on ${localDateKey(selectedDate)} yet.`);
    } else {
      const totalMin = blocks.reduce((acc, b) => acc + minutesBetween(b.start_at, b.end_at), 0);
      const hours = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      setStatusMsg(`${blocks.length} block${blocks.length === 1 ? '' : 's'} · ${hours}h ${mins}m planned`);
    }
  }, [blocks, loaded, selectedDate]);

  // Categories indexed by id for fast color lookup.
  const catById = useMemo(() => {
    const m = new Map<string, DaybookCategory>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  function shiftDay(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d);
  }
  function goToToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  }

  return (
    <div className="daybook-page" data-theme="vibrant">
      {/* ── Brand cell (top-left) ─────────────────────────── */}
      <div className="db-brand">
        <div className="db-logo" aria-hidden="true">D</div>
        <span className="db-wordmark">Day<i>book</i></span>
      </div>

      {/* ── Topbar ────────────────────────────────────────── */}
      <div className="db-topbar">
        <button className="db-icon-btn ghost" onClick={() => shiftDay(-1)} aria-label="Previous day" title="Previous day">‹</button>
        <button className="db-today-pill" onClick={goToToday} title="Jump to today">Today</button>
        <button className="db-icon-btn ghost" onClick={() => shiftDay(1)} aria-label="Next day" title="Next day">›</button>
        <h1 className="db-date-heading">
          {formatDateHeading(selectedDate)}
          <span className="db-tz"> · {timezoneAbbr()}</span>
        </h1>
        <div className="db-spacer" />
        <button className="db-add-block" onClick={() => setBlockModal({ mode: 'add' })} title="Add a new block">
          + Block
        </button>
        <div className="db-view-tabs" role="tablist" aria-label="View">
          <button className="active" role="tab" aria-selected="true">Day</button>
          <button disabled role="tab" aria-selected="false" title="Coming in Build 3">Week</button>
          <button disabled role="tab" aria-selected="false" title="Coming in Build 3">Month</button>
        </div>
        <Link to="/" className="db-back" title="Back to hallway">← hallway</Link>
      </div>

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className="db-sidebar" aria-label="Sidebar">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
        <CategoriesSection
          categories={categories}
          blocks={blocks}
          onEdit={(c) => setCategoryModal({ mode: 'edit', category: c })}
          onAdd={() => setCategoryModal({ mode: 'add' })}
        />
      </aside>

      {/* ── Main pane (Day view) ─────────────────────────── */}
      <main className="db-main" aria-label="Day view">
        {!loaded ? (
          <div className="db-loading">Loading…</div>
        ) : (
          <DayView
            date={selectedDate}
            blocks={blocks}
            catById={catById}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onEditBlock={(b) => setBlockModal({ mode: 'edit', block: b })}
            onCreateAtRange={(startIso, endIso) =>
              setBlockModal({ mode: 'add', defaultStart: startIso, defaultEnd: endIso })
            }
          />
        )}
      </main>

      <footer className="db-status">{statusMsg}</footer>

      {/* ── Block modal ──────────────────────────────────── */}
      {blockModal && (
        <BlockModal
          state={blockModal}
          categories={categories}
          selectedDate={selectedDate}
          onClose={() => setBlockModal(null)}
          onSaved={async () => {
            setBlockModal(null);
            await refreshBlocks(selectedDate);
          }}
          onDeleted={async () => {
            setBlockModal(null);
            await refreshBlocks(selectedDate);
          }}
        />
      )}

      {/* ── Category modal ───────────────────────────────── */}
      {categoryModal && (
        <CategoryModal
          state={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSaved={async () => {
            setCategoryModal(null);
            const cats = await listCategories();
            setCategories(cats);
          }}
          onDeleted={async () => {
            setCategoryModal(null);
            const cats = await listCategories();
            setCategories(cats);
            await refreshBlocks(selectedDate);
          }}
        />
      )}
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────
//
// Build 2 added drag-to-create, single-click selection, double-click
// edit, and a hover tooltip. The DayView owns three transient pieces of
// interaction state — drag, selection (via parent), tooltip — and
// dispatches to the parent via callbacks for the persistent ones.

function DayView({
  date,
  blocks,
  catById,
  selectedBlockId,
  onSelectBlock,
  onEditBlock,
  onCreateAtRange,
}: {
  date: Date;
  blocks: DaybookBlock[];
  catById: Map<string, DaybookCategory>;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onEditBlock: (b: DaybookBlock) => void;
  onCreateAtRange: (startIso: string, endIso: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to ~6:30 AM on first render so the user lands on the
  // morning without scrolling.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = 30 / 60 * ROW_H;
  }, []);

  // ── Drag-to-create ───────────────────────────────────────────────
  // Two minutes-since-midnight values, snapped to 15. The start is the
  // anchor; the end follows the mouse. While dragging, a DraftBlock
  // renders between them. On mouseup, the parent's BlockModal opens
  // pre-filled with the dragged range. If the user just clicked
  // (start === end after snap), no modal opens — that's a deselect.
  const [drag, setDrag] = useState<{ startMin: number; endMin: number } | null>(null);
  const dragRef = useRef<{ startMin: number; endMin: number } | null>(null);

  function yToMinutes(yPxFromCanvasTop: number): number {
    const totalMin = HOUR_START * 60 + (yPxFromCanvasTop / ROW_H) * 60;
    return Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 + 59, totalMin));
  }
  function snap15(min: number): number {
    return Math.round(min / 15) * 15;
  }
  function localMinToHHMM(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function onCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only start a drag on the empty canvas — block clicks are handled
    // by BlockTile, which stops propagation on its own mousedown.
    if (e.button !== 0) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const startY = e.clientY - rect.top;
    const startMin = snap15(yToMinutes(startY));
    const initial = { startMin, endMin: startMin };
    setDrag(initial);
    dragRef.current = initial;
    // Clear any selection — starting a new drag is a fresh action.
    onSelectBlock(null);

    const onMove = (ev: MouseEvent) => {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      const y = ev.clientY - r.top;
      const endMin = snap15(yToMinutes(y));
      const next = { startMin: dragRef.current!.startMin, endMin };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finished = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!finished) return;
      const lo = Math.min(finished.startMin, finished.endMin);
      const hi = Math.max(finished.startMin, finished.endMin);
      // A bare click on empty canvas: just a deselect, no modal.
      if (hi - lo < 15) return;
      const dateKey = localDateKey(date);
      const startIso = combineLocalDateTimeToIso(dateKey, localMinToHHMM(lo));
      const endIso = combineLocalDateTimeToIso(dateKey, localMinToHHMM(hi));
      onCreateAtRange(startIso, endIso);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Hover tooltip ────────────────────────────────────────────────
  // 220ms delay before showing — avoids flicker on quick mouse-overs.
  // Position computed in JS so we can flip the tooltip when it would
  // overflow the right edge of the viewport.
  const [tooltip, setTooltip] = useState<{
    block: DaybookBlock;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);

  function showTooltip(block: DaybookBlock, blockRect: DOMRect) {
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => {
      const TOOLTIP_W = 280;
      const MARGIN = 12;
      const wouldOverflow = blockRect.right + MARGIN + TOOLTIP_W > window.innerWidth;
      const x = wouldOverflow ? blockRect.left - MARGIN - TOOLTIP_W : blockRect.right + MARGIN;
      const y = blockRect.top;
      setTooltip({ block, x, y, flip: wouldOverflow });
    }, 220);
  }
  function hideTooltip() {
    if (tooltipTimerRef.current) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  }
  // Cancel the tooltip on any scroll — the cached anchor rect would
  // be stale otherwise.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => hideTooltip();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  const hours: number[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const isToday = localDateKey(date) === localDateKey(new Date());

  return (
    <>
      <div className="db-day-scroller" ref={scrollerRef}>
        <div className="db-day-grid">
          <div className="db-time-gutter" aria-hidden="true">
            {hours.map((h) => (
              <div key={h} className="db-hour-label" style={{ height: `${ROW_H}px` }}>
                <span>{format12h(h)}</span>
              </div>
            ))}
          </div>
          <div
            ref={canvasRef}
            className={`db-canvas${drag ? ' dragging' : ''}`}
            style={{
              height: `${(HOUR_END - HOUR_START + 1) * ROW_H}px`,
              backgroundSize: `${ROW_H}px ${ROW_H}px, ${ROW_H / 2}px ${ROW_H / 2}px`,
            }}
            onMouseDown={onCanvasMouseDown}
          >
            {blocks.map((b) => (
              <BlockTile
                key={b.id}
                block={b}
                catById={catById}
                selected={selectedBlockId === b.id}
                onSelect={() => onSelectBlock(b.id)}
                onEdit={() => { onSelectBlock(null); onEditBlock(b); }}
                onShowTooltip={(rect) => showTooltip(b, rect)}
                onHideTooltip={hideTooltip}
              />
            ))}
            {drag && <DraftBlock startMin={drag.startMin} endMin={drag.endMin} />}
            {isToday && <NowLine />}
          </div>
        </div>
      </div>
      {tooltip && <BlockTooltip {...tooltip} catById={catById} />}
    </>
  );
}

// ── Block tile ────────────────────────────────────────────────────────

function BlockTile({
  block,
  catById,
  selected,
  onSelect,
  onEdit,
  onShowTooltip,
  onHideTooltip,
}: {
  block: DaybookBlock;
  catById: Map<string, DaybookCategory>;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onShowTooltip: (anchor: DOMRect) => void;
  onHideTooltip: () => void;
}) {
  const cat = block.category_id ? catById.get(block.category_id) : undefined;
  const color = cat?.color ?? ORPHAN_COLOR;
  const startMin = minutesFromMidnight(block.start_at);
  const endMin = minutesFromMidnight(block.end_at);
  const top = (startMin - HOUR_START * 60) / 60 * ROW_H;
  const height = (endMin - startMin) / 60 * ROW_H;
  const sizeClass = height < 32 ? ' tiny' : height < 55 ? ' short' : '';
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      className={`db-block${sizeClass}${selected ? ' selected' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        ['--cat-color' as 'color']: color,
      }}
      // Stop the canvas drag from starting when the mousedown lands on
      // a block. Click + double-click handle selection / edit instead.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      onDoubleClick={onEdit}
      onMouseEnter={() => {
        if (ref.current) onShowTooltip(ref.current.getBoundingClientRect());
      }}
      onMouseLeave={onHideTooltip}
      title="Double-click to edit"
    >
      <span className="db-block-bg" aria-hidden="true" />
      <span className="db-block-content">
        <span className="db-block-title">{block.title || '(untitled)'}</span>
        <span className="db-block-time">
          {isoToLocalTime12h(block.start_at)} – {isoToLocalTime12h(block.end_at)}
        </span>
        {height >= 70 && cat && (
          <span className="db-block-cat">{cat.name}</span>
        )}
      </span>
    </button>
  );
}

// ── Draft block (the in-progress drag visual) ────────────────────────

function DraftBlock({
  startMin,
  endMin,
}: {
  startMin: number;
  endMin: number;
}) {
  const lo = Math.min(startMin, endMin);
  const hi = Math.max(startMin, endMin);
  const top = (lo - HOUR_START * 60) / 60 * ROW_H;
  const height = (hi - lo) / 60 * ROW_H;
  // Hide the draft until the drag has moved at least 15 min — otherwise
  // a tiny "phantom" tile flashes on every click.
  if (height < ROW_H / 4) return null;
  const minutes = hi - lo;
  const hLabel = Math.floor(minutes / 60);
  const mLabel = minutes % 60;
  const labelStr = hLabel > 0
    ? `${hLabel}h${mLabel > 0 ? ` ${mLabel}m` : ''}`
    : `${mLabel}m`;
  return (
    <div className="db-draft" style={{ top: `${top}px`, height: `${height}px` }} aria-hidden="true">
      <span className="db-draft-label">{labelStr}</span>
    </div>
  );
}

// ── Hover tooltip ────────────────────────────────────────────────────

function BlockTooltip({
  block,
  x,
  y,
  catById,
}: {
  block: DaybookBlock;
  x: number;
  y: number;
  flip: boolean;
  catById: Map<string, DaybookCategory>;
}) {
  const cat = block.category_id ? catById.get(block.category_id) : undefined;
  const color = cat?.color ?? ORPHAN_COLOR;
  const minutes = minutesBetween(block.start_at, block.end_at);
  const hLabel = Math.floor(minutes / 60);
  const mLabel = minutes % 60;
  const durStr = hLabel > 0
    ? `${hLabel}h${mLabel > 0 ? ` ${mLabel}m` : ''}`
    : `${mLabel}m`;
  return (
    <div
      className="db-tooltip"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        ['--cat-color' as 'color']: color,
      }}
      role="tooltip"
    >
      {cat && <div className="dbt-cat">{cat.name}</div>}
      <div className="dbt-title">{block.title || '(untitled)'}</div>
      <div className="dbt-time">
        {isoToLocalTime12h(block.start_at)} – {isoToLocalTime12h(block.end_at)} · {durStr}
      </div>
      {block.notes && (
        <div className="dbt-notes">{block.notes}</div>
      )}
      <div className="dbt-hint">Double-click to edit · Esc to deselect</div>
    </div>
  );
}

// ── Now-line ──────────────────────────────────────────────────────────

function NowLine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < HOUR_START * 60 || min > HOUR_END * 60) return null;
  const top = (min - HOUR_START * 60) / 60 * ROW_H;
  return (
    <div className="db-now-line" style={{ top: `${top}px` }} aria-hidden="true">
      <span className="db-now-dot" />
      <span className="db-now-bar" />
      <span className="db-now-label">{isoToLocalTime12h(now.toISOString())} {timezoneAbbr()}</span>
    </div>
  );
}

// ── Mini calendar ─────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onSelect,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(selectedDate);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  function shiftMonth(delta: number) {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + delta);
    setViewMonth(d);
  }

  const monthName = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weeks = buildMonthGrid(viewMonth);
  const todayKey = localDateKey(new Date());
  const selectedKey = localDateKey(selectedDate);

  return (
    <section className="db-side-section">
      <div className="db-minical-head">
        <span className="db-minical-month">{monthName}</span>
        <span className="db-minical-nav">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <button onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
        </span>
      </div>
      <div className="db-minical-dow">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="db-minical-grid">
        {weeks.flat().map((day) => {
          const key = localDateKey(day);
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              className={`db-minical-day${inMonth ? '' : ' muted'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
              onClick={() => onSelect(day)}
              aria-label={day.toDateString()}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function buildMonthGrid(monthAnchor: Date): Date[][] {
  // Start from the Sunday on or before the 1st of the month.
  const start = new Date(monthAnchor);
  start.setDate(1);
  start.setDate(start.getDate() - start.getDay());
  // 6 rows of 7 = 42 cells, enough for any month layout.
  const out: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start);
      cell.setDate(start.getDate() + w * 7 + d);
      row.push(cell);
    }
    out.push(row);
  }
  return out;
}

// ── Categories section ────────────────────────────────────────────────

function CategoriesSection({
  categories,
  blocks,
  onEdit,
  onAdd,
}: {
  categories: DaybookCategory[];
  blocks: DaybookBlock[];
  onEdit: (c: DaybookCategory) => void;
  onAdd: () => void;
}) {
  // Per-category block count for today.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of blocks) {
      if (!b.category_id) continue;
      m.set(b.category_id, (m.get(b.category_id) || 0) + 1);
    }
    return m;
  }, [blocks]);

  return (
    <section className="db-side-section">
      <div className="db-side-label">Categories</div>
      <ul className="db-cat-list">
        {categories.map((c) => (
          <li key={c.id}>
            <button className="db-cat-item" onClick={() => onEdit(c)} title="Edit category">
              <span className="db-cat-swatch" style={{ background: c.color }} aria-hidden="true" />
              <span className="db-cat-name">{c.name}</span>
              {(counts.get(c.id) || 0) > 0 && (
                <span className="db-cat-count">{counts.get(c.id)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <button className="db-cat-add" onClick={onAdd}>+ Add category</button>
    </section>
  );
}

// ── Block modal ───────────────────────────────────────────────────────

function BlockModal({
  state,
  categories,
  selectedDate,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: BlockModalState;
  categories: DaybookCategory[];
  selectedDate: Date;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initialBlock = state.mode === 'edit' ? state.block : null;

  // Default start = 9:00 AM, end = 10:00 AM on the selected date.
  const defaultStart = state.mode === 'add'
    ? (state.defaultStart ?? combineLocalDateTimeToIso(localDateKey(selectedDate), '09:00'))
    : initialBlock!.start_at;
  const defaultEnd = state.mode === 'add'
    ? (state.defaultEnd ?? combineLocalDateTimeToIso(localDateKey(selectedDate), '10:00'))
    : initialBlock!.end_at;

  const [title, setTitle] = useState(initialBlock?.title ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initialBlock?.category_id ?? (categories[0]?.id ?? null));
  const [dateKey, setDateKey] = useState(localDateKey(new Date(defaultStart)));
  const [startHHMM, setStartHHMM] = useState(isoToLocalTimeHHMM(defaultStart));
  const [endHHMM, setEndHHMM] = useState(isoToLocalTimeHHMM(defaultEnd));
  const [recur, setRecur] = useState<DaybookRecur>(initialBlock?.recur ?? 'none');
  const [notes, setNotes] = useState(initialBlock?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);
    if (!title.trim()) { setErr('Title required.'); return; }
    const startIso = combineLocalDateTimeToIso(dateKey, startHHMM);
    const endIso = combineLocalDateTimeToIso(dateKey, endHHMM);
    if (new Date(endIso) <= new Date(startIso)) { setErr('End time must be after start time.'); return; }
    setSaving(true);
    try {
      if (isEdit && initialBlock) {
        await updateBlock(initialBlock.id, {
          title: title.trim(),
          category_id: categoryId,
          start_at: startIso,
          end_at: endIso,
          recur,
          notes: notes.trim() || null,
        });
      } else {
        await createBlock({
          title: title.trim(),
          category_id: categoryId,
          start_at: startIso,
          end_at: endIso,
          recur,
          notes: notes.trim() || null,
        });
      }
      onSaved();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!isEdit || !initialBlock) return;
    if (!confirm('Delete this block?')) return;
    try {
      await deleteBlock(initialBlock.id);
      onDeleted();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Could not delete.');
    }
  }

  return (
    <div className="db-modal-bg" onClick={onClose}>
      <div className="db-modal" onClick={(e) => e.stopPropagation()}>
        <div className="db-modal-head">
          <h2>{isEdit ? <>Edit <i>block</i></> : <>New <i>block</i></>}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="db-modal-body" onSubmit={onSubmit}>
          <div className="db-field">
            <input
              type="text"
              className="db-title-input"
              placeholder="What are you doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="db-field">
            <label className="db-field-label">Category</label>
            <div className="db-chip-grid">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`db-opt-chip${categoryId === c.id ? ' active' : ''}`}
                  onClick={() => setCategoryId(c.id)}
                >
                  <span className="db-chip-dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                className={`db-opt-chip${categoryId === null ? ' active' : ''}`}
                onClick={() => setCategoryId(null)}
                title="No category"
              >
                <span className="db-chip-dot" style={{ background: ORPHAN_COLOR }} />
                Uncategorized
              </button>
            </div>
          </div>

          <div className="db-field">
            <label className="db-field-label">Date</label>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              required
            />
          </div>

          <div className="db-field db-row-2">
            <label className="db-sub-field">
              <span className="db-field-label">Start</span>
              <input
                type="time"
                step="900"
                value={startHHMM}
                onChange={(e) => setStartHHMM(e.target.value)}
                required
              />
            </label>
            <label className="db-sub-field">
              <span className="db-field-label">End</span>
              <input
                type="time"
                step="900"
                value={endHHMM}
                onChange={(e) => setEndHHMM(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="db-field">
            <label className="db-field-label">Repeat</label>
            <div className="db-chip-grid">
              {RECUR_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`db-opt-chip${recur === r.value ? ' active' : ''}`}
                  onClick={() => setRecur(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {recur !== 'none' && (
              <p className="db-recur-hint">
                Saved as <strong>{RECUR_OPTIONS.find((r) => r.value === recur)?.label.toLowerCase()}</strong> —
                recurrence isn't materialized in views yet, but the field is preserved.
              </p>
            )}
          </div>

          <div className="db-field">
            <label className="db-field-label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Any context — what you're working toward, who's joining, what to bring…"
            />
          </div>

          {err && <div className="db-form-err">{err}</div>}

          <div className="db-modal-actions">
            {isEdit && (
              <button type="button" className="db-btn danger" onClick={onDelete} disabled={saving}>
                Delete
              </button>
            )}
            <div className="spacer" />
            <button type="button" className="db-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="db-btn primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Category modal ────────────────────────────────────────────────────

function CategoryModal({
  state,
  onClose,
  onSaved,
  onDeleted,
}: {
  state: CategoryModalState;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const initialCat = state.mode === 'edit' ? state.category : null;

  const [name, setName] = useState(initialCat?.name ?? '');
  const [color, setColor] = useState(initialCat?.color ?? '#4FA336');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);
    if (!name.trim()) { setErr('Name required.'); return; }
    setSaving(true);
    try {
      if (isEdit && initialCat) {
        await updateCategory(initialCat.id, { name: name.trim(), color });
      } else {
        await createCategory({ name: name.trim(), color });
      }
      onSaved();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!isEdit || !initialCat) return;
    if (!confirm(
      `Delete "${initialCat.name}"? Any blocks using it will become uncategorized — not deleted.`,
    )) return;
    try {
      await deleteCategory(initialCat.id);
      onDeleted();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Could not delete.');
    }
  }

  return (
    <div className="db-modal-bg" onClick={onClose}>
      <div className="db-modal db-modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="db-modal-head">
          <h2>{isEdit ? <>Edit <i>category</i></> : <>New <i>category</i></>}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="db-modal-body" onSubmit={onSubmit}>
          <div className="db-field">
            <label className="db-field-label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Writing, Errands, Family"
              autoFocus
              required
            />
          </div>

          <div className="db-field">
            <label className="db-field-label">Color</label>
            <div className="db-color-row">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#E73A1A"
                className="db-color-text"
              />
              <span
                className="db-color-preview"
                style={{ background: color }}
                aria-label="Color preview"
              />
            </div>
          </div>

          {err && <div className="db-form-err">{err}</div>}

          <div className="db-modal-actions">
            {isEdit && (
              <button type="button" className="db-btn danger" onClick={onDelete} disabled={saving}>
                Delete
              </button>
            )}
            <div className="spacer" />
            <button type="button" className="db-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="db-btn primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

function format12h(h: number): string {
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh} ${ap}`;
}

function formatDateHeading(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function timezoneAbbr(): string {
  // Friendly timezone abbreviation from the current locale's resolved name.
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value;
    return tz || 'LOCAL';
  } catch {
    return 'LOCAL';
  }
}
