import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createBookRead,
  createScriptureRead,
  listAllScriptureReads,
  listBookReads,
  listEntryDatesByRoom,
  versesInRead,
  chapterFractionInRead,
  type ScriptureRead,
  type BookRead,
} from '../lib/data';
import {
  bucketLevel,
  buildCalendarGrid,
  buildHeatGrid,
  formatLocalDate,
  MONTH_NAMES,
  MONTH_SHORT,
  sumByDate,
  type HeatLevel,
  type Source,
  type Unit,
} from '../lib/dataAggregation';
import {
  BIBLE_BOOKS,
  chapterCount,
  verseCount,
} from '../lib/bibleVerseCounts';
import { localToday } from '../lib/dates';
import { useFavicon } from '../hooks/useFavicon';
import './Data.css';

// ── Types & constants ────────────────────────────────────────────────

type Tab = 'heatmap' | 'calendar' | 'matrix' | 'stats' | 'plans';

type Theme = 'sage' | 'rose' | 'sky' | 'violet' | 'saffron' | 'ink';

const THEMES: Record<Theme, [string, string, string, string, string]> = {
  sage:    ['#e2dcc6', '#c8d3b3', '#a8bd8d', '#82a165', '#5a7e3f'],
  rose:    ['#efe1d8', '#efd1c4', '#e0a895', '#c87a5e', '#a85540'],
  sky:     ['#e0e6ec', '#c9d6e1', '#9bb1c2', '#6e8aa3', '#4d6b85'],
  violet:  ['#e6dfe8', '#d8cce0', '#b69cc4', '#8d76a8', '#6b568a'],
  saffron: ['#f0e7c8', '#efe0a8', '#dec476', '#c5a347', '#b08820'],
  ink:     ['#dcd5c2', '#c8c1ae', '#8e8674', '#5a5142', '#2b2419'],
};

const HEAT_EMPTY = '#e8e1cc';
const SANCTUARY_MARKER = '#b8521a';
const TIMELINE_MARKER = '#3e5a78';

// ── Page ──────────────────────────────────────────────────────────────

export default function Data() {
  useFavicon('/icons/papers3.png', 'Data · Wardrobe');

  const [tab, setTab] = useState<Tab>('heatmap');
  const [scriptureReads, setScriptureReads] = useState<ScriptureRead[]>([]);
  const [bookReads, setBookReads] = useState<BookRead[]>([]);
  const [sanctuaryDates, setSanctuaryDates] = useState<Set<string>>(new Set());
  const [timelineDates, setTimelineDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Loading…');

  const [modal, setModal] = useState<'scripture' | 'book' | null>(null);

  // Apply selected heatmap theme as CSS custom properties on the page root.
  const [theme, setTheme] = useState<Theme>('sage');
  const pageStyle: CSSProperties = useMemo(() => {
    const ramp = THEMES[theme];
    return {
      ['--heat-1' as any]: ramp[0],
      ['--heat-2' as any]: ramp[1],
      ['--heat-3' as any]: ramp[2],
      ['--heat-4' as any]: ramp[3],
      ['--heat-5' as any]: ramp[4],
      ['--heat-empty' as any]: HEAT_EMPTY,
    };
  }, [theme]);

  const refresh = useCallback(async () => {
    try {
      const [s, b, sd, td] = await Promise.all([
        listAllScriptureReads(),
        listBookReads(),
        listEntryDatesByRoom('sanctuary'),
        listEntryDatesByRoom('timeline'),
      ]);
      setScriptureReads(s);
      setBookReads(b);
      setSanctuaryDates(sd);
      setTimelineDates(td);
      setLoaded(true);
      setStatusMsg(`${s.length} Scripture read${s.length === 1 ? '' : 's'} · ${b.length} book${b.length === 1 ? '' : 's'} finished`);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load data. Have you run migration 0005?');
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="data-page" style={pageStyle}>
      <header className="dt-ribbon">
        <div className="left">
          <Link className="back" to="/">← hallway</Link>
          <div className="place">Data</div>
        </div>
        <div className="right">
          <button className="btn-quiet" onClick={() => setModal('scripture')}>+ Scripture</button>
          <button className="btn-quiet" onClick={() => setModal('book')}>+ Book</button>
        </div>
      </header>

      <nav className="dt-tabs" aria-label="Views">
        <TabButton current={tab} value="heatmap"  setTab={setTab}>Heatmap</TabButton>
        <TabButton current={tab} value="calendar" setTab={setTab}>Calendar</TabButton>
        <TabButton current={tab} value="matrix"   setTab={setTab} disabled>Book × Chapter</TabButton>
        <TabButton current={tab} value="stats"    setTab={setTab} disabled>Stats</TabButton>
        <TabButton current={tab} value="plans"    setTab={setTab} disabled>Plans</TabButton>
      </nav>

      <main className="dt-main">
        {!loaded ? (
          <div className="dt-loading">Loading…</div>
        ) : tab === 'heatmap' ? (
          <HeatmapView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            theme={theme}
            setTheme={setTheme}
          />
        ) : tab === 'calendar' ? (
          <CalendarView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            sanctuaryDates={sanctuaryDates}
            timelineDates={timelineDates}
          />
        ) : (
          <div className="dt-coming-soon">
            <p>Coming in Build 2 (Book × Chapter and Stats) and Build 3 (Reading Plans).</p>
            <p className="hint">Heatmap and Calendar are live now.</p>
          </div>
        )}
      </main>

      <footer className="dt-status">{statusMsg}</footer>

      {modal === 'scripture' && (
        <AddScriptureModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === 'book' && (
        <AddBookModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  current, value, setTab, disabled, children,
}: {
  current: Tab; value: Tab; setTab: (t: Tab) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      className={`tab${current === value ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => !disabled && setTab(value)}
      aria-pressed={current === value}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// ── Heatmap view ─────────────────────────────────────────────────────

function HeatmapView({
  scriptureReads, bookReads, theme, setTheme,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const [source, setSource] = useState<Source>('scripture');
  const [unit, setUnit] = useState<Unit>('verses');
  const todayDate = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(todayDate.getFullYear());

  // Pick the scale for the current source/unit pair.
  const scale = unit === 'chapters' ? 'chapters' : 'verses-or-pages';

  // Build the by-date map according to source + unit.
  const byDate = useMemo(() => {
    if (source === 'scripture') {
      const inYear = scriptureReads.filter((r) => r.read_date.startsWith(String(year)));
      if (unit === 'verses') {
        return sumByDate(inYear, (r) => r.read_date, (r) => versesInRead(r));
      }
      // chapters mode — use fractional chapters so partial reads contribute.
      return sumByDate(inYear, (r) => r.read_date, (r) => chapterFractionInRead(r));
    }
    // Books mode — use book-completion days for now (daily_page_reads coming
    // through the same reducer once Build 1's modal lands them).
    const inYear = bookReads.filter((b) => b.finished_on.startsWith(String(year)));
    if (unit === 'verses') {
      // verses == pages in books mode
      return sumByDate(inYear, (r) => r.finished_on, (r) => r.pages);
    }
    // sections mode = pages / 50
    return sumByDate(inYear, (r) => r.finished_on, (r) => (r.pages > 0 ? r.pages / 50 : 0));
  }, [scriptureReads, bookReads, source, unit, year]);

  const grid = useMemo(
    () => buildHeatGrid(year, byDate, scale, todayDate),
    [year, byDate, scale, todayDate],
  );

  const unitLabel = source === 'books'
    ? (unit === 'verses' ? 'Pages' : 'Sections')
    : (unit === 'verses' ? 'Verses' : 'Chapters');

  // Year rail: show last 5 years up through the current year.
  const yearOptions = Array.from({ length: 5 }, (_, i) => todayDate.getFullYear() - i);

  // Tooltip
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div className="dt-heatmap-wrap">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Heatmap</h2>
            <div className="sub">{grid.totalCount.toFixed(grid.totalCount % 1 ? 1 : 0)} {unitLabel.toLowerCase()} across {grid.totalDays} day{grid.totalDays === 1 ? '' : 's'} · <em>click a square to see that day</em></div>
          </div>
          <div className="controls">
            <Pillbar
              value={source}
              options={[
                { value: 'scripture', label: 'Scripture' },
                { value: 'books', label: 'Books' },
              ]}
              onChange={(v) => setSource(v as Source)}
            />
            <Pillbar
              value={unit}
              options={[
                { value: 'verses', label: source === 'books' ? 'Pages' : 'Verses' },
                { value: 'chapters', label: source === 'books' ? 'Sections' : 'Chapters' },
              ]}
              onChange={(v) => setUnit(v as Unit)}
            />
            <div className="theme-swatches" role="radiogroup" aria-label="Theme">
              {(Object.keys(THEMES) as Theme[]).map((t) => (
                <button
                  key={t}
                  className={`sw${theme === t ? ' active' : ''}`}
                  style={{
                    background: `linear-gradient(135deg, ${THEMES[t][0]} 0%, ${THEMES[t][2]} 50%, ${THEMES[t][4]} 100%)`,
                  }}
                  onClick={() => setTheme(t)}
                  title={t}
                  aria-label={`Theme ${t}`}
                />
              ))}
            </div>
          </div>
        </div>

        <HeatGrid
          cells={grid.cells}
          year={year}
          onHover={(cell, x, y) => {
            if (!cell || cell.isFuture) {
              setTip(null);
              return;
            }
            const value = cell.count;
            const fmt = value % 1 ? value.toFixed(1) : value.toString();
            setTip({
              x, y,
              text: `${cell.date} — ${fmt} ${unitLabel.toLowerCase()}`,
            });
          }}
          onLeave={() => setTip(null)}
        />

        <div className="dt-legend">
          <span className="muted">Less</span>
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="leg-cell" style={{ background: `var(--heat-${l})` }} />
          ))}
          <span className="muted">More</span>
        </div>
      </div>

      <aside className="dt-year-rail">
        {yearOptions.map((y) => (
          <button
            key={y}
            className={`year${year === y ? ' active' : ''}`}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </aside>

      {tip && <div className="dt-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>}
    </div>
  );
}

function HeatGrid({
  cells,
  year,
  onHover,
  onLeave,
}: {
  cells: ReturnType<typeof buildHeatGrid>['cells'];
  year: number;
  onHover: (cell: any, x: number, y: number) => void;
  onLeave: () => void;
}) {
  // Compute total weeks (columns) for the grid template.
  const maxWeek = cells.length === 0 ? 0 : Math.max(...cells.map((c) => c.weekIndex));
  const weeks = maxWeek + 1;

  // Month labels at the appropriate week-column.
  const monthLabels: Array<{ month: number; col: number }> = [];
  let lastMonth = -1;
  for (const c of cells) {
    const m = new Date(c.date + 'T00:00:00').getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ month: m, col: c.weekIndex });
      lastMonth = m;
    }
  }

  return (
    <div className="dt-heatgrid">
      <div className="month-labels" style={{ gridTemplateColumns: `30px repeat(${weeks}, 1fr)` }}>
        <span />
        {monthLabels.map((m, i) => (
          <span key={i} className="month-label" style={{ gridColumnStart: m.col + 2 }}>
            {MONTH_SHORT[m.month]}
          </span>
        ))}
      </div>
      <div className="grid-body">
        <div className="dow-labels">
          <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
        </div>
        <div
          className="grid-cells"
          style={{
            gridTemplateColumns: `repeat(${weeks}, 1fr)`,
            gridTemplateRows: 'repeat(7, 1fr)',
          }}
          onMouseLeave={onLeave}
        >
          {cells.map((c) => (
            <div
              key={c.date}
              className={`heat-cell l${c.level}${c.isFuture ? ' future' : ''}`}
              style={{
                gridColumn: c.weekIndex + 1,
                gridRow: c.dow + 1,
              }}
              onMouseMove={(e) => onHover(c, e.clientX, e.clientY)}
              title={`${c.date} (${year})`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Pillbar<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="dt-pillbar" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Calendar view ────────────────────────────────────────────────────

function CalendarView({
  scriptureReads,
  bookReads,
  sanctuaryDates,
  timelineDates,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  sanctuaryDates: Set<string>;
  timelineDates: Set<string>;
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [source, setSource] = useState<Source>('scripture');

  function navigate(delta: number) {
    let m = monthIndex + delta;
    let y = year;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    setYear(y);
    setMonthIndex(m);
  }

  const byDate = useMemo(() => {
    if (source === 'scripture') {
      return sumByDate(scriptureReads, (r) => r.read_date, (r) => versesInRead(r));
    }
    return sumByDate(bookReads, (r) => r.finished_on, (r) => r.pages);
  }, [scriptureReads, bookReads, source]);

  const refsByDate = useMemo(() => {
    const out = new Map<string, string[]>();
    if (source === 'scripture') {
      for (const r of scriptureReads) {
        const key = r.read_date;
        const ref = `${r.book} ${r.chapter}${r.verse_from !== null && r.verse_to !== null
          ? `:${r.verse_from}${r.verse_from !== r.verse_to ? '-' + r.verse_to : ''}`
          : ''}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key)!.push(ref);
      }
    } else {
      for (const b of bookReads) {
        const text = `${b.pages} pages · ${b.author || b.title}`;
        if (!out.has(b.finished_on)) out.set(b.finished_on, []);
        out.get(b.finished_on)!.push(text);
      }
    }
    return out;
  }, [scriptureReads, bookReads, source]);

  const cells = useMemo(
    () => buildCalendarGrid(year, monthIndex, byDate, 'verses-or-pages', today),
    [year, monthIndex, byDate, today],
  );

  return (
    <div className="dt-calendar-wrap">
      <div className="panel">
        <div className="panel-head">
          <div className="cal-nav">
            <button className="btn-quiet" onClick={() => navigate(-1)} aria-label="Previous month">‹</button>
            <h2 className="cal-month">{MONTH_NAMES[monthIndex]} {year}</h2>
            <button className="btn-quiet" onClick={() => navigate(1)} aria-label="Next month">›</button>
          </div>
          <div className="controls">
            <Pillbar
              value={source}
              options={[
                { value: 'scripture', label: 'Scripture' },
                { value: 'books', label: 'Books' },
              ]}
              onChange={(v) => setSource(v as Source)}
            />
            <div className="cal-legend">
              <span className="cal-marker" style={{ background: SANCTUARY_MARKER, borderRadius: '50%' }} /> Sanctuary
              <span className="cal-marker" style={{ background: TIMELINE_MARKER }} /> Timeline
            </div>
          </div>
        </div>

        <div className="cal-dow-row">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
            <div key={d} className="cal-dow">{d}</div>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((c, i) => {
            const refs = c.date ? refsByDate.get(c.date) || [] : [];
            const hasSanctuary = c.date ? sanctuaryDates.has(c.date) : false;
            const hasTimeline = c.date ? timelineDates.has(c.date) : false;
            const tint = c.level > 0 ? `color-mix(in oklab, var(--heat-${c.level}) 60%, var(--bg) 40%)` : undefined;
            return (
              <div
                key={i}
                className={`cal-cell${c.isToday ? ' today' : ''}${c.isFuture ? ' future' : ''}${c.date ? '' : ' empty'}`}
                style={{ background: tint }}
              >
                {c.date && (
                  <>
                    <div className="cal-cell-top">
                      <div className="cal-markers">
                        {hasSanctuary && (
                          <span
                            className="m"
                            style={{ background: SANCTUARY_MARKER, borderRadius: '50%' }}
                            title="Sanctuary entry"
                          />
                        )}
                        {hasTimeline && (
                          <span
                            className="m"
                            style={{ background: TIMELINE_MARKER }}
                            title="Timeline entry"
                          />
                        )}
                      </div>
                      <div className="cal-day">{c.day}</div>
                    </div>
                    {refs.length > 0 && (
                      <div className="cal-refs">
                        {refs.slice(0, 2).map((r, j) => <span key={j}>{r}</span>)}
                        {refs.length > 2 && <span className="more">+{refs.length - 2}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── + Scripture modal ────────────────────────────────────────────────

function AddScriptureModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(localToday());
  const [book, setBook] = useState('Genesis');
  const [chapter, setChapter] = useState(1);
  const [howMuch, setHowMuch] = useState<'whole' | 'verses'>('whole');
  const [verseFrom, setVerseFrom] = useState(1);
  const [verseTo, setVerseTo] = useState(1);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const maxChapter = useMemo(() => chapterCount(book), [book]);
  const maxVerse = useMemo(() => verseCount(book, chapter) || 1, [book, chapter]);

  // Clamp chapter when book changes
  useEffect(() => {
    if (chapter > maxChapter) setChapter(maxChapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxChapter]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setErr(null);
    try {
      await createScriptureRead({
        read_date: date,
        book,
        chapter,
        verse_from: howMuch === 'verses' ? verseFrom : null,
        verse_to:   howMuch === 'verses' ? verseTo : null,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Modal title="+ Scripture" onClose={onClose}>
      <form className="dt-form" onSubmit={onSubmit}>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Book
          <select value={book} onChange={(e) => setBook(e.target.value)}>
            {BIBLE_BOOKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <div className="row">
          <label>
            Chapter
            <input
              type="number"
              min={1}
              max={maxChapter}
              value={chapter}
              onChange={(e) => setChapter(Math.max(1, Math.min(maxChapter, Number(e.target.value) || 1)))}
              required
            />
          </label>
          <label>
            How much
            <select value={howMuch} onChange={(e) => setHowMuch(e.target.value as 'whole' | 'verses')}>
              <option value="whole">Whole chapter</option>
              <option value="verses">Verses…</option>
            </select>
          </label>
        </div>
        {howMuch === 'verses' && (
          <div className="row">
            <label>
              From verse
              <input
                type="number"
                min={1}
                max={maxVerse}
                value={verseFrom}
                onChange={(e) => setVerseFrom(Math.max(1, Math.min(maxVerse, Number(e.target.value) || 1)))}
              />
            </label>
            <label>
              To verse
              <input
                type="number"
                min={verseFrom}
                max={maxVerse}
                value={verseTo}
                onChange={(e) => setVerseTo(Math.max(verseFrom, Math.min(maxVerse, Number(e.target.value) || verseFrom)))}
              />
            </label>
          </div>
        )}
        <label>
          Note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </label>
        {err && <div className="dt-form-err">{err}</div>}
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ── + Book modal ─────────────────────────────────────────────────────

function AddBookModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(localToday());
  const [pages, setPages] = useState(0);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) { setErr('Title required.'); return; }
    setSaving(true); setErr(null);
    try {
      await createBookRead({
        finished_on: date,
        title: title.trim(),
        author: author.trim(),
        pages,
        rating,
        review: review.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Modal title="+ Book" onClose={onClose}>
      <form className="dt-form" onSubmit={onSubmit}>
        <div className="row">
          <label>
            Date finished
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Pages
            <input
              type="number"
              min={0}
              value={pages}
              onChange={(e) => setPages(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
        <label>
          Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>
        <label>
          Author
          <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label>
          Rating
          <div className="dt-stars" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star${(hoverRating || rating) >= n ? ' lit' : ''}`}
                onClick={() => setRating(n as any)}
                onMouseEnter={() => setHoverRating(n)}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
              >
                ★
              </button>
            ))}
            {rating > 0 && (
              <button type="button" className="star-clear" onClick={() => setRating(0)}>clear</button>
            )}
          </div>
        </label>
        <label>
          Review (optional)
          <textarea value={review} onChange={(e) => setReview(e.target.value)} rows={4} />
        </label>
        {err && <div className="dt-form-err">{err}</div>}
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ── Modal scaffolding ───────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dt-modal-bg" onClick={onClose}>
      <div className="dt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-head">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="dt-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onCancel, saving }: { onCancel: () => void; saving: boolean }) {
  return (
    <div className="dt-modal-actions">
      <button type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      <button type="submit" className="primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
