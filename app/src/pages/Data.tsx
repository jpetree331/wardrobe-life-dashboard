import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  bulkCreateBookReads,
  createBookRead,
  createDailyPageRead,
  createReadingPlan,
  createScriptureRead,
  deleteReadingPlan,
  listAllPlanCompletions,
  listAllScriptureReads,
  listBookReads,
  listDailyPageReads,
  listEntryDatesByRoom,
  listReadingPlans,
  togglePlanCompletion,
  updateBookRead,
  versesInRead,
  chapterFractionInRead,
  type BookRead,
  type DailyPageRead,
  type PlanCompletion,
  type ReadingPlan,
  type ScriptureRead,
} from '../lib/data';
import {
  buildImportPreview,
  dedupAgainstExisting,
  parseCSV,
  type GoodreadsBookCandidate,
  type GoodreadsImportPreview,
} from '../lib/goodreadsImport';
import {
  aggregateBooksByAuthor,
  aggregateScriptureByBookChapter,
  bucketChapterReads,
  buildCalendarGrid,
  buildHeatGrid,
  computeYearStats,
  daysWithReadingByYear,
  formatLocalDate,
  MONTH_NAMES,
  MONTH_SHORT,
  mergeByDate,
  monthlyTotalsForYear,
  otNtVerseSplit,
  planChapterSequence,
  planPaceStatus,
  sumByDate,
  topAuthorsByCount,
  topBooksByVerses,
  yearsInBooksRetro,
  type HeatLevel,
  type Source,
  type Unit,
} from '../lib/dataAggregation';
import {
  BIBLE_BOOKS,
  NEW_TESTAMENT,
  OLD_TESTAMENT,
  chapterCount,
  isOldTestament,
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

// Cross-room calendar markers. These two colors are also used in the
// Heatmap source-tag legends; keeping them as named constants avoids
// drift between the JSX and the CSS where they appear.
const SANCTUARY_MARKER = '#b8521a';
const TIMELINE_MARKER = '#3e5a78';

// ── Page ──────────────────────────────────────────────────────────────

export default function Data() {
  useFavicon('/icons/papers3.png', 'Data · Wardrobe');

  const [tab, setTab] = useState<Tab>('heatmap');
  const [scriptureReads, setScriptureReads] = useState<ScriptureRead[]>([]);
  const [bookReads, setBookReads] = useState<BookRead[]>([]);
  const [dailyPages, setDailyPages] = useState<DailyPageRead[]>([]);
  const [plans, setPlans] = useState<ReadingPlan[]>([]);
  const [planCompletions, setPlanCompletions] = useState<PlanCompletion[]>([]);
  const [sanctuaryDates, setSanctuaryDates] = useState<Set<string>>(new Set());
  const [timelineDates, setTimelineDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Loading…');

  const [modal, setModal] = useState<
    'scripture' | 'book' | 'daily-pages' | 'goodreads-import' | null
  >(null);
  // Edit-book modal — separate state because it carries the row to edit
  // and is summoned from the Books pane, not the ribbon.
  const [editBook, setEditBook] = useState<BookRead | null>(null);

  // Apply selected heatmap theme as CSS custom properties on the page
  // root. --heat-empty is theme-independent and lives in Data.css.
  const [theme, setTheme] = useState<Theme>('sage');
  const pageStyle: CSSProperties = useMemo(() => {
    const ramp = THEMES[theme];
    return {
      ['--heat-1' as any]: ramp[0],
      ['--heat-2' as any]: ramp[1],
      ['--heat-3' as any]: ramp[2],
      ['--heat-4' as any]: ramp[3],
      ['--heat-5' as any]: ramp[4],
    };
  }, [theme]);

  const refresh = useCallback(async () => {
    try {
      const [s, b, dp, p, pc, sd, td] = await Promise.all([
        listAllScriptureReads(),
        listBookReads(),
        listDailyPageReads(),
        listReadingPlans(),
        listAllPlanCompletions(),
        listEntryDatesByRoom('sanctuary'),
        listEntryDatesByRoom('timeline'),
      ]);
      setScriptureReads(s);
      setBookReads(b);
      setDailyPages(dp);
      setPlans(p);
      setPlanCompletions(pc);
      setSanctuaryDates(sd);
      setTimelineDates(td);
      setLoaded(true);
      const dpPagesTotal = dp.reduce((sum, r) => sum + r.pages, 0);
      setStatusMsg(
        `${s.length} Scripture read${s.length === 1 ? '' : 's'} · ${b.length} book${b.length === 1 ? '' : 's'} finished${dpPagesTotal ? ` · ${dpPagesTotal} pages logged` : ''}${p.length ? ` · ${p.length} plan${p.length === 1 ? '' : 's'}` : ''}`,
      );
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
          <button className="btn-quiet" onClick={() => setModal('daily-pages')} title="Log pages read on a day you didn't finish a book">+ Daily pages</button>
        </div>
      </header>

      <nav className="dt-tabs" aria-label="Views">
        <TabButton current={tab} value="heatmap"  setTab={setTab}>Heatmap</TabButton>
        <TabButton current={tab} value="calendar" setTab={setTab}>Calendar</TabButton>
        <TabButton current={tab} value="matrix"   setTab={setTab}>Book × Chapter</TabButton>
        <TabButton current={tab} value="stats"    setTab={setTab}>Stats</TabButton>
        <TabButton current={tab} value="plans"    setTab={setTab}>Plans</TabButton>
      </nav>

      <main className="dt-main">
        {!loaded ? (
          <div className="dt-loading">Loading…</div>
        ) : tab === 'heatmap' ? (
          <HeatmapView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            dailyPages={dailyPages}
            theme={theme}
            setTheme={setTheme}
          />
        ) : tab === 'calendar' ? (
          <CalendarView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            dailyPages={dailyPages}
            sanctuaryDates={sanctuaryDates}
            timelineDates={timelineDates}
          />
        ) : tab === 'matrix' ? (
          <BookByChapterView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            onEditBook={setEditBook}
          />
        ) : tab === 'stats' ? (
          <StatsView
            scriptureReads={scriptureReads}
            bookReads={bookReads}
            dailyPages={dailyPages}
          />
        ) : tab === 'plans' ? (
          <PlansView
            plans={plans}
            completions={planCompletions}
            onChanged={refresh}
          />
        ) : null}
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
        <BookFormModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
          onWantImport={() => setModal('goodreads-import')}
        />
      )}
      {modal === 'daily-pages' && (
        <AddDailyPagesModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === 'goodreads-import' && (
        <GoodreadsImportModal
          existingBooks={bookReads}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {editBook && (
        <BookFormModal
          existing={editBook}
          onClose={() => setEditBook(null)}
          onSaved={async () => {
            setEditBook(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  current, value, setTab, disabled, comingIn, children,
}: {
  current: Tab;
  value: Tab;
  setTab: (t: Tab) => void;
  disabled?: boolean;
  comingIn?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`tab${current === value ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => !disabled && setTab(value)}
      aria-pressed={current === value}
      disabled={disabled}
      title={disabled && comingIn ? `Coming in ${comingIn}` : undefined}
    >
      {children}
      {disabled && comingIn && <span className="soon">soon</span>}
    </button>
  );
}

// ── Heatmap view ─────────────────────────────────────────────────────

function HeatmapView({
  scriptureReads, bookReads, dailyPages, theme, setTheme,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const [source, setSource] = useState<Source>('scripture');
  const [unit, setUnit] = useState<Unit>('verses');
  const todayDate = useMemo(() => new Date(), []);
  const [year, setYear] = useState<number>(todayDate.getFullYear());

  // Pick the scale for the current source/unit pair.
  const scale = unit === 'chapters' ? 'chapters' : 'verses-or-pages';

  // Build the by-date map across ALL years. The heatmap's grid extends a
  // few days into the prior year (the leading partial week when Jan 1 isn't
  // a Sunday) and into the next year (trailing partial week); using the
  // unfiltered map means real reads on those overflow days light up too.
  // The "totalDays / totalCount" displayed in the header is still
  // year-bounded — buildHeatGrid only counts cells where inYear=true.
  const byDate = useMemo(() => {
    if (source === 'scripture') {
      if (unit === 'verses') {
        return sumByDate(scriptureReads, (r) => r.read_date, (r) => versesInRead(r));
      }
      return sumByDate(scriptureReads, (r) => r.read_date, (r) => chapterFractionInRead(r));
    }
    // Books mode — sum pages from BOTH the completion records AND the
    // daily-page logs, so days when she read but didn't finish a book
    // still light up. Same date appearing on both sides correctly adds.
    if (unit === 'verses') {
      // "Verses" pillbar means "Pages" when source=books
      return mergeByDate(
        sumByDate(bookReads, (r) => r.finished_on, (r) => r.pages),
        sumByDate(dailyPages, (r) => r.read_date, (r) => r.pages),
      );
    }
    // "Chapters" pillbar means "Sections" when source=books — sections = pages / 50.
    return mergeByDate(
      sumByDate(bookReads, (r) => r.finished_on, (r) => (r.pages > 0 ? r.pages / 50 : 0)),
      sumByDate(dailyPages, (r) => r.read_date, (r) => (r.pages > 0 ? r.pages / 50 : 0)),
    );
  }, [scriptureReads, bookReads, dailyPages, source, unit]);

  const grid = useMemo(
    () => buildHeatGrid(year, byDate, scale, todayDate),
    [year, byDate, scale, todayDate],
  );

  const unitLabel = source === 'books'
    ? (unit === 'verses' ? 'Pages' : 'Sections')
    : (unit === 'verses' ? 'Verses' : 'Chapters');

  // Year-rail counts: distinct days with any reading per year. Same metric
  // across Heatmap and Stats so paging back through history feels uniform.
  const yearCounts = useMemo(
    () => daysWithReadingByYear({ scriptureReads, bookReads, dailyPages }),
    [scriptureReads, bookReads, dailyPages],
  );
  const dataYears = useMemo(() => Array.from(yearCounts.keys()), [yearCounts]);

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

        {grid.totalDays === 0 && (
          <div className="dt-empty-state">
            <em>No reading recorded in {year} yet.</em>
            <span> Click <strong>+ Scripture</strong>, <strong>+ Book</strong>, or <strong>+ Daily pages</strong> to begin —
            or tag scripture refs on a Sanctuary entry and they'll appear here automatically.</span>
          </div>
        )}

        <div className="dt-legend">
          <span className="muted">Less</span>
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="leg-cell" style={{ background: `var(--heat-${l})` }} />
          ))}
          <span className="muted">More</span>
        </div>
      </div>

      <YearRail
        layout="vertical"
        value={year}
        onChange={setYear}
        counts={yearCounts}
        dataYears={dataYears}
      />

      {tip && <div className="dt-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>}
    </div>
  );
}

/**
 * The "pick a year" rail used by Heatmap and Stats. Two layouts:
 *   - vertical: next to the heatmap; cells stacked top-to-bottom
 *   - horizontal: next to the Stats title bar
 *
 * Shows a 5-year window. `<` chevron pages back 5 years (further into
 * history); `>` chevron pages forward. Chevrons are disabled when the
 * window is at a boundary defined by `dataYears` (the years in which
 * the user has any reading data) — so paging back stops when she hits
 * her oldest year, and paging forward stops at the current year.
 *
 * `counts` is an optional Map<year, n> that puts a small "(n)" next to
 * each year so blank years are easy to spot.
 */
const YEAR_WINDOW = 5;

function YearRail({
  value, onChange, layout, counts, dataYears,
}: {
  value: number;
  onChange: (y: number) => void;
  layout: 'vertical' | 'horizontal';
  counts?: Map<number, number>;
  /** Years where the user has data — used to bound chevron paging. */
  dataYears: number[];
}) {
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const earliestYear = dataYears.length > 0 ? Math.min(...dataYears) : currentYear;

  // The window's RIGHTMOST year — we render 5 years ending here.
  // Persisted in state so chevron paging works; default to the year
  // containing `value` (so navigating away and back doesn't lose place).
  const [windowEnd, setWindowEnd] = useState<number>(currentYear);

  // If the user picks a year outside the current window via some other
  // path, slide the window so it's visible.
  useEffect(() => {
    if (value > windowEnd) setWindowEnd(value);
    else if (value <= windowEnd - YEAR_WINDOW) setWindowEnd(value + YEAR_WINDOW - 1);
  }, [value, windowEnd]);

  const options = Array.from({ length: YEAR_WINDOW }, (_, i) => windowEnd - i);
  const canGoBack = windowEnd - YEAR_WINDOW >= earliestYear;
  const canGoForward = windowEnd < currentYear;

  function pageBack() {
    if (canGoBack) setWindowEnd((w) => Math.max(earliestYear + YEAR_WINDOW - 1, w - YEAR_WINDOW));
  }
  function pageForward() {
    if (canGoForward) setWindowEnd((w) => Math.min(currentYear, w + YEAR_WINDOW));
  }

  // Vertical: chevrons stack top/bottom. Horizontal: chevrons sit at left/right.
  const olderChevron = (
    <button
      type="button"
      className="year-page-btn"
      onClick={pageBack}
      disabled={!canGoBack}
      aria-label="Older years"
      title={canGoBack ? 'Older' : 'No older data'}
    >
      {layout === 'vertical' ? '▾' : '‹'}
    </button>
  );
  const newerChevron = (
    <button
      type="button"
      className="year-page-btn"
      onClick={pageForward}
      disabled={!canGoForward}
      aria-label="Newer years"
      title={canGoForward ? 'Newer' : 'No newer data'}
    >
      {layout === 'vertical' ? '▴' : '›'}
    </button>
  );

  return (
    <div className={`year-rail ${layout}`} role="radiogroup" aria-label="Year">
      {layout === 'vertical' ? newerChevron : olderChevron}
      {options.map((y) => {
        const n = counts?.get(y);
        return (
          <button
            key={y}
            className={`year${value === y ? ' active' : ''}${!n ? ' no-data' : ''}`}
            onClick={() => onChange(y)}
            aria-pressed={value === y}
          >
            <span className="year-num">{y}</span>
            {counts !== undefined && (
              <span className="year-count">{n ? `(${n})` : '·'}</span>
            )}
          </button>
        );
      })}
      {layout === 'vertical' ? olderChevron : newerChevron}
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

  // Month labels at the appropriate week-column. Skip out-of-year cells
  // so the leading prior-year overflow (e.g. Dec 28-31 in a 2026 grid)
  // doesn't emit a spurious "Dec" label before the year's "Jan."
  const monthLabels: Array<{ month: number; col: number }> = [];
  let lastMonth = -1;
  for (const c of cells) {
    if (!c.inYear) continue;
    const m = new Date(c.date + 'T00:00:00').getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ month: m, col: c.weekIndex });
      lastMonth = m;
    }
  }

  // Single grid: column 1 = dow gutter (30px), columns 2..N+1 = week
  // columns (1fr each so cells stretch to fill available width).
  // Row 1 = month labels, rows 2..8 = the seven dow rows.
  // Putting labels and cells in the same grid means they share column
  // sizing AND the 3px gap exactly — no drift between a label's
  // position and the cells it points to. Cells stay square via
  // `aspect-ratio: 1` and grow with the container.
  const dowLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <div
      className="dt-heatgrid"
      style={{ gridTemplateColumns: `30px repeat(${weeks}, minmax(0, 1fr))` }}
      onMouseLeave={onLeave}
    >
      {/* Top-left corner spacer (aligns over the dow gutter). */}
      <span className="hg-corner" />

      {/* Month labels — row 1, columns 2..N+1 keyed by week index. */}
      {monthLabels.map((m) => (
        <span
          key={m.col}
          className="month-label"
          style={{ gridRow: 1, gridColumn: m.col + 2 }}
        >
          {MONTH_SHORT[m.month]}
        </span>
      ))}

      {/* Day-of-week labels — column 1, rows 2..8. */}
      {dowLabels.map((d, i) => (
        <span
          key={i}
          className="dow-label"
          style={{ gridRow: i + 2, gridColumn: 1 }}
        >
          {d}
        </span>
      ))}

      {/* Cells — rows 2..8, columns 2..N+1. */}
      {cells.map((c) => (
        <div
          key={c.date}
          className={`heat-cell l${c.level}${c.isFuture ? ' future' : ''}`}
          style={{
            gridColumn: c.weekIndex + 2,
            gridRow: c.dow + 2,
          }}
          onMouseMove={(e) => onHover(c, e.clientX, e.clientY)}
          title={`${c.date} (${year})`}
        />
      ))}
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
  dailyPages,
  sanctuaryDates,
  timelineDates,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
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
    // Books mode — merge completions + daily pages.
    return mergeByDate(
      sumByDate(bookReads, (r) => r.finished_on, (r) => r.pages),
      sumByDate(dailyPages, (r) => r.read_date, (r) => r.pages),
    );
  }, [scriptureReads, bookReads, dailyPages, source]);

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
        const text = `${b.pages}p · ${b.title}${b.author ? ` (${b.author})` : ''}`;
        if (!out.has(b.finished_on)) out.set(b.finished_on, []);
        out.get(b.finished_on)!.push(text);
      }
      for (const d of dailyPages) {
        const text = `${d.pages}p${d.title ? ` · ${d.title}` : ''}`;
        if (!out.has(d.read_date)) out.set(d.read_date, []);
        out.get(d.read_date)!.push(text);
      }
    }
    return out;
  }, [scriptureReads, bookReads, dailyPages, source]);

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

// ── Book × Chapter view ──────────────────────────────────────────────

function BookByChapterView({
  scriptureReads,
  bookReads,
  onEditBook,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  onEditBook: (b: BookRead) => void;
}) {
  const [source, setSource] = useState<Source>('scripture');

  return (
    <div className="dt-matrix-wrap">
      <div className="panel matrix-panel">
        <div className="panel-head">
          <div>
            <h2>Book × Chapter</h2>
            <div className="sub">
              {source === 'scripture'
                ? 'Pick a book to see which chapters you\'ve read, how often, and the entries behind each.'
                : 'Authors A–Z, with every finished book and review.'}
            </div>
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
          </div>
        </div>

        {source === 'scripture' ? (
          <ScriptureMatrix scriptureReads={scriptureReads} />
        ) : (
          <BookByAuthor bookReads={bookReads} onEditBook={onEditBook} />
        )}
      </div>
    </div>
  );
}

// ── Scripture matrix (book rail + chapter grid + reads pane) ─────────

function ScriptureMatrix({ scriptureReads }: { scriptureReads: ScriptureRead[] }) {
  // Aggregate reads → per-book/per-chapter fractions.
  const aggregate = useMemo(
    () => aggregateScriptureByBookChapter(scriptureReads, (r) => chapterFractionInRead(r)),
    [scriptureReads],
  );

  // Default selected book: first one with reads, else 'Genesis'.
  const initialBook = useMemo(() => {
    for (const b of BIBLE_BOOKS) if (aggregate.has(b)) return b;
    return 'Genesis';
  }, [aggregate]);

  const [selectedBook, setSelectedBook] = useState<string>(initialBook);
  // Reset whenever the underlying reads change and the selection vanishes.
  useEffect(() => {
    if (!aggregate.has(selectedBook) && initialBook) setSelectedBook(initialBook);
  }, [aggregate, initialBook, selectedBook]);

  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  // Clear chapter filter when we switch books.
  useEffect(() => { setSelectedChapter(null); }, [selectedBook]);

  const bookAgg = aggregate.get(selectedBook);
  const chapters = chapterCount(selectedBook);
  const visibleReads = useMemo(() => {
    if (!bookAgg) return [] as ScriptureRead[];
    if (selectedChapter === null) return bookAgg.reads;
    return bookAgg.reads.filter((r) => r.chapter === selectedChapter);
  }, [bookAgg, selectedChapter]);

  return (
    <div className="dt-matrix-grid">
      {/* Book rail — OT then NT, with a small read-count next to each book */}
      <aside className="dt-book-rail">
        <div className="rail-head">Old Testament</div>
        {OLD_TESTAMENT.map((b) => (
          <BookRailItem
            key={b}
            book={b}
            count={aggregate.get(b)?.readCount || 0}
            active={b === selectedBook}
            onClick={() => setSelectedBook(b)}
          />
        ))}
        <div className="rail-head">New Testament</div>
        {NEW_TESTAMENT.map((b) => (
          <BookRailItem
            key={b}
            book={b}
            count={aggregate.get(b)?.readCount || 0}
            active={b === selectedBook}
            onClick={() => setSelectedBook(b)}
          />
        ))}
      </aside>

      {/* Centre: chapter matrix */}
      <section className="dt-chapter-pane">
        <header className="pane-head">
          <h3>{selectedBook}</h3>
          <span className="meta">
            {chapters} chapter{chapters === 1 ? '' : 's'}
            {bookAgg ? ` · ${bookAgg.readCount} read${bookAgg.readCount === 1 ? '' : 's'}` : ''}
          </span>
          {selectedChapter !== null && (
            <button className="clear-filter" onClick={() => setSelectedChapter(null)}>
              clear ch. {selectedChapter}
            </button>
          )}
        </header>
        <div className="chapter-matrix">
          {Array.from({ length: chapters }, (_, i) => i + 1).map((ch) => {
            const fraction = bookAgg?.chapters.get(ch) || 0;
            const level = bucketChapterReads(fraction);
            const isSelected = ch === selectedChapter;
            return (
              <button
                key={ch}
                className={`chap-tile l${level}${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedChapter(isSelected ? null : ch)}
                title={fraction > 0
                  ? `Chapter ${ch} — ${fraction.toFixed(fraction % 1 ? 2 : 0)} read${fraction === 1 ? '' : 's'}`
                  : `Chapter ${ch} — not read yet`}
              >
                {ch}
              </button>
            );
          })}
        </div>
        <div className="dt-legend matrix-legend">
          <span className="muted">Less</span>
          {[1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="leg-cell" style={{ background: `var(--heat-${l})` }} />
          ))}
          <span className="muted">More</span>
        </div>
      </section>

      {/* Right: reads pane */}
      <aside className="dt-reads-pane">
        <header className="pane-head">
          <h3>Reads</h3>
          <span className="meta">
            {visibleReads.length} entr{visibleReads.length === 1 ? 'y' : 'ies'}
            {selectedChapter !== null ? ` · ch. ${selectedChapter}` : ''}
          </span>
        </header>
        {visibleReads.length === 0 ? (
          <div className="reads-empty">
            {bookAgg
              ? selectedChapter !== null
                ? <em>No reads recorded for {selectedBook} {selectedChapter} yet.</em>
                : <em>No reads recorded for {selectedBook} yet.</em>
              : <em>Pick a book on the left to see reads here. Books with darker rails have more entries.</em>}
          </div>
        ) : (
          <ul className="reads-list">
            {visibleReads.map((r) => (
              <ReadItem key={r.id} read={r} />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function BookRailItem({
  book, count, active, onClick,
}: {
  book: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rail-item${active ? ' active' : ''}${count === 0 ? ' empty' : ''}`}
      onClick={onClick}
    >
      <span className="rail-name">{book}</span>
      {count > 0 && <span className="rail-count">{count}</span>}
    </button>
  );
}

function ReadItem({ read }: { read: ScriptureRead }) {
  const refStr = `${read.book} ${read.chapter}${
    read.verse_from !== null && read.verse_to !== null
      ? `:${read.verse_from}${read.verse_from !== read.verse_to ? '–' + read.verse_to : ''}`
      : ''
  }`;

  // Sanctuary-derived reads carry their entry id in the synthetic id:
  // `sanctuary:<entry_id>:<ref_index>`. Extract it so the date can deep-
  // link to the original Sanctuary entry. Sanctuary reads `?id=...` from
  // useSearchParams to focus that entry on load.
  const sanctuaryHref = read.source === 'sanctuary'
    ? (() => {
        const parts = read.id.split(':');
        return parts.length >= 2 ? `/sanctuary?id=${parts[1]}` : null;
      })()
    : null;

  return (
    <li className={`read-item${read.source === 'sanctuary' ? ' from-sanctuary' : ''}`}>
      <div className="read-row">
        {sanctuaryHref ? (
          <Link className="read-date link" to={sanctuaryHref} title="Open this Sanctuary entry">
            {read.read_date}
          </Link>
        ) : (
          <span className="read-date">{read.read_date}</span>
        )}
        <span className="read-ref">{refStr}</span>
        {read.source === 'sanctuary' && (
          <span className="read-source" title="Synthesized from a Sanctuary entry — click the date to open it">sanctuary</span>
        )}
      </div>
      {read.note && <div className="read-note">{read.note}</div>}
    </li>
  );
}

// ── Books-by-author panel ────────────────────────────────────────────

function BookByAuthor({
  bookReads, onEditBook,
}: {
  bookReads: BookRead[];
  onEditBook: (b: BookRead) => void;
}) {
  const aggregate = useMemo(() => aggregateBooksByAuthor(bookReads), [bookReads]);

  // Sort authors A→Z (case-insensitive). "Unknown author" sinks to the bottom.
  const authors = useMemo(() => {
    const names = Array.from(aggregate.keys());
    return names.sort((a, b) => {
      if (a === 'Unknown author' && b !== 'Unknown author') return 1;
      if (b === 'Unknown author' && a !== 'Unknown author') return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [aggregate]);

  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(authors[0] || null);
  // Re-sync when the dataset changes.
  useEffect(() => {
    if (selectedAuthor && !aggregate.has(selectedAuthor)) {
      setSelectedAuthor(authors[0] || null);
    } else if (!selectedAuthor && authors[0]) {
      setSelectedAuthor(authors[0]);
    }
  }, [aggregate, authors, selectedAuthor]);

  if (authors.length === 0) {
    return (
      <div className="dt-empty-state">
        <em>No books finished yet.</em>
        <span> Click <strong>+ Book</strong> in the ribbon above to log your first finished read.</span>
      </div>
    );
  }

  const authorAgg = selectedAuthor ? aggregate.get(selectedAuthor) : undefined;

  return (
    <div className="dt-matrix-grid books-grid">
      {/* Author rail */}
      <aside className="dt-book-rail authors">
        <div className="rail-head">Authors</div>
        {authors.map((a) => {
          const agg = aggregate.get(a)!;
          return (
            <button
              key={a}
              className={`rail-item${selectedAuthor === a ? ' active' : ''}`}
              onClick={() => setSelectedAuthor(a)}
            >
              <span className="rail-name">{a}</span>
              <span className="rail-count">{agg.total}</span>
            </button>
          );
        })}
      </aside>

      {/* Centre + right are merged into a single books pane (no chapter matrix). */}
      <section className="dt-author-pane" style={{ gridColumn: '2 / span 2' }}>
        {authorAgg ? (
          <>
            <header className="pane-head">
              <h3>{selectedAuthor}</h3>
              <span className="meta">
                {authorAgg.total} book{authorAgg.total === 1 ? '' : 's'}
                {authorAgg.pages > 0 ? ` · ${authorAgg.pages} pages` : ''}
              </span>
            </header>
            <ul className="author-books">
              {authorAgg.books.map((b) => (
                <BookCard key={b.id} book={b} onEdit={() => onEditBook(b)} />
              ))}
            </ul>
          </>
        ) : (
          <div className="reads-empty"><em>Pick an author on the left.</em></div>
        )}
      </section>
    </div>
  );
}

function BookCard({ book, onEdit }: { book: BookRead; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const stars = '★'.repeat(book.rating) + '☆'.repeat(5 - book.rating);
  return (
    <li className="book-card">
      <div className="book-card-row">
        <span className="book-date">{book.finished_on}</span>
        <span className="book-title">{book.title}</span>
        {book.pages > 0
          ? <span className="book-pages">{book.pages}p</span>
          : <button type="button" className="book-pages-missing" onClick={onEdit} title="Click to add a page count">
              add pages
            </button>}
        {book.rating > 0 && <span className="book-stars" title={`${book.rating}/5`}>{stars}</span>}
        <button type="button" className="book-edit" onClick={onEdit} title="Edit this book" aria-label="Edit this book">
          edit
        </button>
      </div>
      {book.review && (
        <div className={`book-review${expanded ? ' expanded' : ''}`}>
          <button
            className="review-toggle"
            onClick={() => setExpanded((x) => !x)}
            aria-expanded={expanded}
          >
            {expanded ? '▾ review' : '▸ review'}
          </button>
          {expanded && <div className="review-body">{book.review}</div>}
        </div>
      )}
    </li>
  );
}

// ── Stats view ───────────────────────────────────────────────────────
//
// Top-level Scripture/Books toggle scopes the entire page. KPIs, the
// middle panels, and the Years-in-X retrospective all swap shape
// between modes; the year rail (with chevron paging into history) and
// the title bar are shared.

type StatsMode = 'scripture' | 'books';

function StatsView({
  scriptureReads,
  bookReads,
  dailyPages,
}: {
  scriptureReads: ScriptureRead[];
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
}) {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<StatsMode>('scripture');
  const [year, setYear] = useState(today.getFullYear());

  // Year-bound KPIs.
  const stats = useMemo(
    () => computeYearStats({
      year,
      scriptureReads,
      bookReads,
      dailyPages,
      versesFor: (r) => versesInRead(r),
      today,
    }),
    [year, scriptureReads, bookReads, dailyPages, today],
  );

  // Year-rail counts: distinct days with any reading per year. Same
  // metric across Heatmap and Stats so paging back through history
  // feels uniform.
  const yearCounts = useMemo(
    () => daysWithReadingByYear({ scriptureReads, bookReads, dailyPages }),
    [scriptureReads, bookReads, dailyPages],
  );
  const dataYears = useMemo(() => Array.from(yearCounts.keys()), [yearCounts]);

  // Monthly chart — verses in scripture mode, pages in books mode.
  // Auto-syncs with the page-level mode toggle (no separate pillbar).
  const monthlyTotals = useMemo(() => {
    if (mode === 'scripture') {
      return monthlyTotalsForYear(year,
        sumByDate(scriptureReads, (r) => r.read_date, (r) => versesInRead(r)));
    }
    return monthlyTotalsForYear(year, mergeByDate(
      sumByDate(bookReads, (r) => r.finished_on, (r) => r.pages),
      sumByDate(dailyPages, (r) => r.read_date, (r) => r.pages),
    ));
  }, [mode, year, scriptureReads, bookReads, dailyPages]);
  const monthlyMax = Math.max(1, ...monthlyTotals);
  const monthlyUnitLabel = mode === 'scripture' ? 'verses' : 'pages';
  const monthlyTotal = monthlyTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="dt-stats-wrap">
      <div className="dt-stats-head">
        <div>
          <h2 className="stats-title">{year}</h2>
          <div className="stats-sub">
            {stats.combined.days > 0
              ? `${stats.combined.days} day${stats.combined.days === 1 ? '' : 's'} of reading · longest streak ${stats.combined.streakLongest}`
              : 'No reading recorded for this year yet.'}
          </div>
        </div>
        <div className="stats-controls">
          <Pillbar
            value={mode}
            options={[
              { value: 'scripture', label: 'Scripture' },
              { value: 'books', label: 'Books' },
            ]}
            onChange={(v) => setMode(v as StatsMode)}
          />
          <YearRail
            layout="horizontal"
            value={year}
            onChange={setYear}
            counts={yearCounts}
            dataYears={dataYears}
          />
        </div>
      </div>

      {mode === 'scripture' ? (
        <ScriptureStats
          stats={stats}
          year={year}
          scriptureReads={scriptureReads}
          monthlyTotals={monthlyTotals}
          monthlyMax={monthlyMax}
          monthlyTotal={monthlyTotal}
          monthlyUnitLabel={monthlyUnitLabel}
        />
      ) : (
        <BooksStats
          stats={stats}
          year={year}
          bookReads={bookReads}
          dailyPages={dailyPages}
          scriptureReads={scriptureReads}
          monthlyTotals={monthlyTotals}
          monthlyMax={monthlyMax}
          monthlyTotal={monthlyTotal}
          monthlyUnitLabel={monthlyUnitLabel}
        />
      )}
    </div>
  );
}

// ── Stats: Scripture mode ────────────────────────────────────────────

function ScriptureStats({
  stats, year, scriptureReads,
  monthlyTotals, monthlyMax, monthlyTotal, monthlyUnitLabel,
}: {
  stats: ReturnType<typeof computeYearStats>;
  year: number;
  scriptureReads: ScriptureRead[];
  monthlyTotals: number[];
  monthlyMax: number;
  monthlyTotal: number;
  monthlyUnitLabel: string;
}) {
  const otNt = useMemo(
    () => otNtVerseSplit({
      year,
      reads: scriptureReads,
      versesFor: (r) => versesInRead(r),
      isOldTestament,
    }),
    [year, scriptureReads],
  );

  const top10 = useMemo(
    () => topBooksByVerses({ year, n: 10, reads: scriptureReads, versesFor: (r) => versesInRead(r) }),
    [year, scriptureReads],
  );

  return (
    <>
      {/* KPIs — Scripture flavor */}
      <div className="kpi-row">
        <KpiCard label="Reading days" value={stats.scripture.days.toLocaleString()} hint="days you opened the Word" />
        <KpiCard label="Verses" value={stats.scripture.verses.toLocaleString()} hint={`${stats.scripture.chapters} chapter reads`} />
        <KpiCard label="Distinct chapters" value={stats.scripture.distinctChapters.toLocaleString()} hint={`across ${stats.scripture.booksTouched} of 66 books`} />
        <KpiCard label="Longest streak" value={`${stats.combined.streakLongest} day${stats.combined.streakLongest === 1 ? '' : 's'}`} hint={stats.combined.streakCurrent > 0 ? `current ${stats.combined.streakCurrent}` : 'no current streak'} />
      </div>

      {/* Top books · Monthly · OT/NT side by side */}
      <div className="stats-row scripture-row">
        <div className="panel stats-panel">
          <div className="panel-head">
            <div>
              <h3 className="stats-h3">Top books read</h3>
              <div className="sub">most-read by verses · {year}</div>
            </div>
          </div>
          {top10.length === 0 ? (
            <div className="reads-empty"><em>No Scripture reads recorded for {year}.</em></div>
          ) : (
            <TopBooksBar rows={top10} />
          )}
        </div>

        <div className="panel stats-panel">
          <div className="panel-head">
            <div>
              <h3 className="stats-h3">By month</h3>
              <div className="sub">{monthlyTotal.toLocaleString()} {monthlyUnitLabel}</div>
            </div>
          </div>
          <MonthlyBars totals={monthlyTotals} max={monthlyMax} unit={monthlyUnitLabel} />
        </div>

        <div className="panel stats-panel donut-panel">
          <div className="panel-head">
            <div>
              <h3 className="stats-h3">Old / New</h3>
              <div className="sub">by testament</div>
            </div>
          </div>
          <OtNtDonut ot={otNt.ot} nt={otNt.nt} />
        </div>
      </div>

      {/* Years-in-Scripture retrospective — all-time */}
      <YearsInScripture
        scriptureReads={scriptureReads}
        activeYear={year}
      />
    </>
  );
}

// ── Stats: Books mode ────────────────────────────────────────────────

function BooksStats({
  stats, year, bookReads, dailyPages, scriptureReads,
  monthlyTotals, monthlyMax, monthlyTotal, monthlyUnitLabel,
}: {
  stats: ReturnType<typeof computeYearStats>;
  year: number;
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
  scriptureReads: ScriptureRead[];
  monthlyTotals: number[];
  monthlyMax: number;
  monthlyTotal: number;
  monthlyUnitLabel: string;
}) {
  const topAuthors = useMemo(
    () => topAuthorsByCount({ year, n: 8, bookReads }),
    [year, bookReads],
  );

  // "Recently finished" = the last 6 books finished within the active year,
  // newest first. bookReads is already sorted newest-first by listBookReads.
  const recentlyFinished = useMemo(
    () => bookReads
      .filter((b) => b.finished_on.startsWith(`${year}-`))
      .slice(0, 6),
    [year, bookReads],
  );

  return (
    <>
      {/* KPIs — Books flavor */}
      <div className="kpi-row">
        <KpiCard label="Books finished" value={stats.books.finished.toLocaleString()} hint={`in ${year}`} />
        <KpiCard label="Pages" value={stats.books.pages.toLocaleString()} hint="approximate" />
        <KpiCard label="Authors" value={stats.books.authors.toLocaleString()} hint="distinct" />
        <KpiCard label="Reading days" value={stats.books.days.toLocaleString()} hint="at least one page" />
      </div>

      {/* Top authors + Recently finished + Monthly */}
      <div className="stats-row books-row">
        <div className="panel stats-panel">
          <div className="panel-head">
            <div>
              <h3 className="stats-h3">Top authors</h3>
              <div className="sub">books finished · {year}</div>
            </div>
          </div>
          {topAuthors.length === 0 ? (
            <div className="reads-empty"><em>No books finished in {year} yet.</em></div>
          ) : (
            <TopAuthorsBar rows={topAuthors} />
          )}
        </div>

        <div className="panel stats-panel">
          <div className="panel-head">
            <div>
              <h3 className="stats-h3">Recently finished</h3>
              <div className="sub">{year}</div>
            </div>
          </div>
          {recentlyFinished.length === 0 ? (
            <div className="reads-empty"><em>No books finished in {year} yet.</em></div>
          ) : (
            <RecentlyFinishedList books={recentlyFinished} />
          )}
        </div>
      </div>

      <div className="panel stats-panel">
        <div className="panel-head">
          <div>
            <h3 className="stats-h3">By month</h3>
            <div className="sub">{monthlyTotal.toLocaleString()} {monthlyUnitLabel} · {year}</div>
          </div>
        </div>
        <MonthlyBars totals={monthlyTotals} max={monthlyMax} unit={monthlyUnitLabel} />
      </div>

      {/* Years-in-Books retrospective — all-time */}
      <YearsInBooks
        bookReads={bookReads}
        dailyPages={dailyPages}
        scriptureReads={scriptureReads}
        activeYear={year}
      />
    </>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

function MonthlyBars({ totals, max, unit }: { totals: number[]; max: number; unit: string }) {
  return (
    <div className="monthly-chart">
      <div className="monthly-bars">
        {totals.map((v, i) => {
          const pct = max > 0 ? (v / max) * 100 : 0;
          const level = bucketLevelForBar(v, max);
          return (
            <div key={i} className="monthly-col" title={`${MONTH_NAMES[i]}: ${v.toLocaleString()} ${unit}`}>
              <div className="monthly-bar-track">
                <div className={`monthly-bar l${level}`} style={{ height: `${pct}%` }} />
              </div>
              <div className="monthly-label">{MONTH_SHORT[i]}</div>
              <div className="monthly-value">{v > 0 ? v.toLocaleString() : '·'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Map a bar value (0..max) to a heat level 1..5. Empty = level 0. */
function bucketLevelForBar(value: number, max: number): HeatLevel {
  if (value <= 0 || max <= 0) return 0;
  const pct = value / max;
  if (pct < 0.2) return 1;
  if (pct < 0.45) return 2;
  if (pct < 0.7) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

function OtNtDonut({ ot, nt }: { ot: number; nt: number }) {
  const total = ot + nt;
  if (total === 0) {
    return <div className="reads-empty"><em>No Scripture verses logged for this year.</em></div>;
  }
  const otPct = ot / total;
  const ntPct = nt / total;

  // SVG donut math: r=46, c=2πr ≈ 289.0
  const r = 46;
  const c = 2 * Math.PI * r;
  const otLen = c * otPct;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut-svg" aria-label={`Old Testament ${Math.round(otPct * 100)} percent, New Testament ${Math.round(ntPct * 100)} percent`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--heat-2)" strokeWidth="14" />
        <circle
          cx="60" cy="60" r={r}
          fill="none"
          stroke="var(--heat-5)"
          strokeWidth="14"
          strokeDasharray={`${otLen} ${c - otLen}`}
          strokeDashoffset={c / 4}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="58" textAnchor="middle" className="donut-pct">
          {Math.round(otPct * 100)}%
        </text>
        <text x="60" y="74" textAnchor="middle" className="donut-label">
          OT
        </text>
      </svg>
      <ul className="donut-legend">
        <li>
          <span className="dot" style={{ background: 'var(--heat-5)' }} />
          OT · {ot.toLocaleString()} verses
        </li>
        <li>
          <span className="dot" style={{ background: 'var(--heat-2)' }} />
          NT · {nt.toLocaleString()} verses
        </li>
      </ul>
    </div>
  );
}

function TopBooksBar({ rows }: { rows: Array<{ book: string; verses: number; reads: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.verses));
  return (
    <ul className="topbooks-list">
      {rows.map((r) => {
        const pct = (r.verses / max) * 100;
        const level = bucketLevelForBar(r.verses, max);
        return (
          <li key={r.book} className="topbooks-row">
            <span className="topbooks-name">{r.book}</span>
            <div className="topbooks-track">
              <div className={`topbooks-bar l${level}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="topbooks-num">{r.verses.toLocaleString()}</span>
            <span className="topbooks-meta">{r.reads}× read</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Top authors bar (Books mode) ─────────────────────────────────────

function TopAuthorsBar({ rows }: { rows: Array<{ author: string; total: number; pages: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="topbooks-list">
      {rows.map((r) => {
        const pct = (r.total / max) * 100;
        const level = bucketLevelForBar(r.total, max);
        return (
          <li key={r.author} className="topbooks-row">
            <span className="topbooks-name">{r.author}</span>
            <div className="topbooks-track">
              <div className={`topbooks-bar l${level}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="topbooks-num">{r.total.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Recently finished list (Books mode) ──────────────────────────────

function RecentlyFinishedList({ books }: { books: BookRead[] }) {
  // EB Garamond italic for the meta line, Cormorant for the title — matches
  // the rest of the room's voice.
  return (
    <ul className="recent-finished">
      {books.map((b) => (
        <li key={b.id} className="recent-finished-row">
          <div className="rf-title">{b.title}</div>
          <div className="rf-meta">
            <em>{b.author || 'Unknown author'}</em>
            <span className="dot-sep">·</span>
            <span>{formatRecentDate(b.finished_on)}</span>
            {b.pages > 0 && <>
              <span className="dot-sep">·</span>
              <span>{b.pages} pp</span>
            </>}
            {b.rating > 0 && <>
              <span className="dot-sep">·</span>
              <span className="rf-stars">{'★'.repeat(b.rating)}</span>
            </>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Apr 22, 2026" — short month + day + year. */
function formatRecentDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((s) => parseInt(s, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Years-in-Books retrospective ─────────────────────────────────────
//
// Shows all years with reading data, descending. Each row is a
// horizontal bar showing the number of books finished that year, with
// a chevron toggle to expand. Expanded rows show every book grouped by
// star rating, plus footer stats (books / pages / longest / shortest).

function YearsInBooks({
  bookReads, dailyPages, scriptureReads, activeYear,
}: {
  bookReads: BookRead[];
  dailyPages: DailyPageRead[];
  scriptureReads: ScriptureRead[];
  activeYear: number;
}) {
  // Default to expanding the active year for instant visual continuity.
  const [expandedYear, setExpandedYear] = useState<number | null>(activeYear);
  useEffect(() => { setExpandedYear(activeYear); }, [activeYear]);

  const retro = useMemo(
    () => yearsInBooksRetro({
      scriptureReads, bookReads, dailyPages,
      versesFor: (r) => versesInRead(r),
    }),
    [scriptureReads, bookReads, dailyPages],
  );

  // Books grouped by year for fast lookup when a row expands.
  const booksByYear = useMemo(() => {
    const out = new Map<number, BookRead[]>();
    for (const b of bookReads) {
      const y = parseInt(b.finished_on.slice(0, 4), 10);
      if (!Number.isFinite(y)) continue;
      if (!out.has(y)) out.set(y, []);
      out.get(y)!.push(b);
    }
    return out;
  }, [bookReads]);

  if (retro.length === 0) {
    return (
      <div className="panel stats-panel">
        <div className="panel-head">
          <div>
            <h3 className="stats-h3">Years in Books</h3>
            <div className="sub">a long view of your reading life</div>
          </div>
        </div>
        <div className="reads-empty"><em>Nothing logged yet. Add a finished book to begin building this picture.</em></div>
      </div>
    );
  }

  const max = Math.max(1, ...retro.map((r) => r.books));

  return (
    <div className="panel stats-panel years-in-books">
      <div className="panel-head">
        <div>
          <h3 className="stats-h3">Years in Books</h3>
          <div className="sub">click a year to see what you read</div>
        </div>
      </div>
      <ul className="yib-list">
        {retro.map((r) => (
          <YearsInBooksRow
            key={r.year}
            year={r.year}
            count={r.books}
            max={max}
            expanded={expandedYear === r.year}
            onToggle={() => setExpandedYear((y) => y === r.year ? null : r.year)}
            books={booksByYear.get(r.year) || []}
            pages={r.pages}
            days={r.days}
          />
        ))}
      </ul>
    </div>
  );
}

function YearsInBooksRow({
  year, count, max, expanded, onToggle, books, pages, days,
}: {
  year: number;
  count: number;
  max: number;
  expanded: boolean;
  onToggle: () => void;
  books: BookRead[];
  pages: number;
  days: number;
}) {
  const pct = (count / max) * 100;
  const hasBooks = books.length > 0;

  // Group books by rating, descending. Unrated (0) goes last.
  const grouped = useMemo(() => {
    const buckets = new Map<number, BookRead[]>();
    for (const b of books) {
      const k = b.rating || 0;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(b);
    }
    const keys = Array.from(buckets.keys()).sort((a, b) => b - a);
    return keys.map((k) => ({ rating: k, books: buckets.get(k)! }));
  }, [books]);

  // Longest / shortest by page count (only books with known pages).
  const withPages = useMemo(() => books.filter((b) => b.pages > 0), [books]);
  const longest = withPages.length > 0
    ? withPages.reduce((a, b) => a.pages >= b.pages ? a : b)
    : null;
  const shortest = withPages.length > 0
    ? withPages.reduce((a, b) => a.pages <= b.pages ? a : b)
    : null;

  return (
    <li className={`yib-row${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="yib-toggle"
        onClick={onToggle}
        disabled={!hasBooks}
        aria-expanded={expanded}
      >
        <span className="yib-year">{year}</span>
        <div className="yib-bar-track">
          <div className="yib-bar" style={{ width: `${pct}%` }}>
            {count > 0 && <span className="yib-bar-label">{count}</span>}
          </div>
        </div>
        <span className="yib-chevron" aria-hidden="true">
          {hasBooks ? (expanded ? '▾' : '▸') : '·'}
        </span>
      </button>

      {expanded && hasBooks && (
        <div className="yib-detail">
          <div className="yib-detail-main">
            {grouped.map((g) => (
              <div key={g.rating} className="yib-rating-row">
                <div className="yib-rating-label" title={`${g.rating || 0}/5`}>
                  {g.rating > 0
                    ? <>{'★'.repeat(g.rating)}<span className="dim">{'☆'.repeat(5 - g.rating)}</span></>
                    : <span className="dim">unrated</span>}
                </div>
                <div className="yib-books-row">
                  {g.books.map((b) => (
                    <span key={b.id} className="yib-book-chip" title={b.author || 'Unknown author'}>
                      <em>{b.title}</em>
                      {b.author && <> · <span className="dim">{b.author.split(' ').pop()}</span></>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="yib-detail-stats">
              <span><span className="lbl">Books</span><strong>{books.length}</strong></span>
              <span><span className="lbl">Pages</span><strong>{pages.toLocaleString()}</strong></span>
              <span><span className="lbl">Days</span><strong>{days.toLocaleString()}</strong></span>
              {longest && (
                <span className="yib-stat-superlative">
                  <span className="lbl">Longest</span>
                  <em>{longest.title}</em> · {longest.pages}pp
                </span>
              )}
              {shortest && shortest !== longest && (
                <span className="yib-stat-superlative">
                  <span className="lbl">Shortest</span>
                  <em>{shortest.title}</em> · {shortest.pages}pp
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Years-in-Scripture retrospective ─────────────────────────────────
//
// Parallel to YearsInBooks but for scripture reads. Bar shows
// chapter-read count per year. Expanded rows show top-N Bible books
// for that year (mirrors the Top Books panel above, but year-scoped).

function YearsInScripture({
  scriptureReads, activeYear,
}: {
  scriptureReads: ScriptureRead[];
  activeYear: number;
}) {
  const [expandedYear, setExpandedYear] = useState<number | null>(activeYear);
  useEffect(() => { setExpandedYear(activeYear); }, [activeYear]);

  // Year-by-year totals. Reuse `yearsInBooksRetro` since it covers
  // scripture columns too — we just read the chapters/verses fields.
  const retro = useMemo(
    () => yearsInBooksRetro({
      scriptureReads, bookReads: [], dailyPages: [],
      versesFor: (r) => versesInRead(r),
    }),
    [scriptureReads],
  );

  if (retro.length === 0) {
    return (
      <div className="panel stats-panel">
        <div className="panel-head">
          <div>
            <h3 className="stats-h3">Years in Scripture</h3>
            <div className="sub">a long view of your reading life</div>
          </div>
        </div>
        <div className="reads-empty"><em>No Scripture reads logged yet.</em></div>
      </div>
    );
  }

  const max = Math.max(1, ...retro.map((r) => r.chapters));

  return (
    <div className="panel stats-panel years-in-books">
      <div className="panel-head">
        <div>
          <h3 className="stats-h3">Years in Scripture</h3>
          <div className="sub">click a year to see what you read</div>
        </div>
      </div>
      <ul className="yib-list">
        {retro.map((r) => (
          <YearsInScriptureRow
            key={r.year}
            year={r.year}
            count={r.chapters}
            verses={r.verses}
            days={r.days}
            max={max}
            expanded={expandedYear === r.year}
            onToggle={() => setExpandedYear((y) => y === r.year ? null : r.year)}
            scriptureReads={scriptureReads}
          />
        ))}
      </ul>
    </div>
  );
}

function YearsInScriptureRow({
  year, count, verses, days, max, expanded, onToggle, scriptureReads,
}: {
  year: number;
  count: number;
  verses: number;
  days: number;
  max: number;
  expanded: boolean;
  onToggle: () => void;
  scriptureReads: ScriptureRead[];
}) {
  const pct = (count / max) * 100;
  const hasReads = count > 0;

  // Top books for this specific year — only computed when expanded.
  const topThisYear = useMemo(
    () => expanded
      ? topBooksByVerses({ year, n: 10, reads: scriptureReads, versesFor: (r) => versesInRead(r) })
      : [],
    [expanded, year, scriptureReads],
  );

  return (
    <li className={`yib-row${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="yib-toggle"
        onClick={onToggle}
        disabled={!hasReads}
        aria-expanded={expanded}
      >
        <span className="yib-year">{year}</span>
        <div className="yib-bar-track">
          <div className="yib-bar" style={{ width: `${pct}%` }}>
            {count > 0 && <span className="yib-bar-label">{count}</span>}
          </div>
        </div>
        <span className="yib-chevron" aria-hidden="true">
          {hasReads ? (expanded ? '▾' : '▸') : '·'}
        </span>
      </button>

      {expanded && hasReads && (
        <div className="yib-detail">
          <div className="yib-detail-main">
            {topThisYear.length > 0 && <TopBooksBar rows={topThisYear} />}
            <div className="yib-detail-stats">
              <span><span className="lbl">Verses</span><strong>{verses.toLocaleString()}</strong></span>
              <span><span className="lbl">Chapter reads</span><strong>{count.toLocaleString()}</strong></span>
              <span><span className="lbl">Days</span><strong>{days.toLocaleString()}</strong></span>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Plans view ────────────────────────────────────────────────────────

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Translate a `PaceStatus` into the user-facing pill text. `verbose=true`
 * adds the word "session(s)" for the detail view; the card view just
 * shows "ahead by 2" so the pills stay compact in the list grid.
 *
 * The leading glyph (↑ / ↓ / →) is what makes the state legible without
 * relying on color alone — a colorblind user reads "↑ ahead by 2" the
 * same way a sighted user does.
 */
function paceInfo(pace: import('../lib/dataAggregation').PaceStatus, verbose: boolean) {
  const delta = Math.abs(Math.round(pace.sessionDelta));
  const unit = verbose ? ` session${delta === 1 ? '' : 's'}` : '';
  if (pace.state === 1) {
    return { glyph: '↑', label: `ahead by ${delta}${unit}`, cls: 'ahead' };
  }
  if (pace.state === -1) {
    return { glyph: '↓', label: `behind by ${delta}${unit}`, cls: 'behind' };
  }
  return { glyph: '→', label: 'on pace', cls: 'on' };
}

function PacePill({
  pace, verbose = false,
}: {
  pace: import('../lib/dataAggregation').PaceStatus;
  verbose?: boolean;
}) {
  const { glyph, label, cls } = paceInfo(pace, verbose);
  return (
    <span className={`plan-pace ${cls}`} aria-label={`${label} (${cls === 'ahead' ? 'ahead of pace' : cls === 'behind' ? 'behind pace' : 'on pace'})`}>
      <span className="pace-glyph" aria-hidden="true">{glyph}</span>{' '}{label}
    </span>
  );
}

type PlanPreset = {
  key: string;
  name: string;
  description: string;
  build: (today: Date) => {
    name: string;
    books: string[];
    start_date: string;
    end_date: string;
    days_of_week: number[];
    per_session: number;
  };
};

function dayOffset(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

const PLAN_PRESETS: PlanPreset[] = [
  {
    key: 'bible-in-a-year',
    name: 'Bible in a Year',
    description: 'All 66 books, ~3-4 chapters/day, finishing Dec 31.',
    build: (today) => {
      const startKey = `${today.getFullYear()}-01-01`;
      const endKey = `${today.getFullYear()}-12-31`;
      return {
        name: 'Bible in a Year',
        books: [...BIBLE_BOOKS],
        start_date: startKey,
        end_date: endKey,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        per_session: 4,
      };
    },
  },
  {
    key: 'nt-in-90',
    name: 'New Testament in 90 Days',
    description: 'Matthew through Revelation, ~3 chapters/day for 90 days.',
    build: (today) => ({
      name: 'New Testament in 90 Days',
      books: [...NEW_TESTAMENT],
      start_date: formatLocalDate(today),
      end_date: formatLocalDate(dayOffset(today, 89)),
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      per_session: 3,
    }),
  },
  {
    key: 'gospels-30',
    name: 'Gospels in 30 Days',
    description: 'Matthew, Mark, Luke, John — 89 chapters across 30 days.',
    build: (today) => ({
      name: 'Gospels in 30 Days',
      books: ['Matthew', 'Mark', 'Luke', 'John'],
      start_date: formatLocalDate(today),
      end_date: formatLocalDate(dayOffset(today, 29)),
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      per_session: 3,
    }),
  },
  {
    key: 'psalms-30',
    name: 'Psalms in a Month',
    description: 'Psalms 1–150, five per day for 30 days.',
    build: (today) => ({
      name: 'Psalms in a Month',
      books: ['Psalms'],
      start_date: formatLocalDate(today),
      end_date: formatLocalDate(dayOffset(today, 29)),
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      per_session: 5,
    }),
  },
];

function PlansView({
  plans,
  completions,
  onChanged,
}: {
  plans: ReadingPlan[];
  completions: PlanCompletion[];
  onChanged: () => Promise<void> | void;
}) {
  const today = useMemo(() => new Date(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Group completions by plan_id for fast lookup.
  const completionsByPlan = useMemo(() => {
    const out = new Map<string, PlanCompletion[]>();
    for (const c of completions) {
      if (!out.has(c.plan_id)) out.set(c.plan_id, []);
      out.get(c.plan_id)!.push(c);
    }
    return out;
  }, [completions]);

  const selectedPlan = selectedId ? plans.find((p) => p.id === selectedId) : null;

  if (selectedPlan) {
    return (
      <PlanDetail
        plan={selectedPlan}
        completions={completionsByPlan.get(selectedPlan.id) || []}
        today={today}
        onBack={() => setSelectedId(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="dt-plans-wrap">
      <div className="plans-head">
        <div>
          <h2 className="plans-title">Reading Plans</h2>
          <div className="plans-sub">
            {plans.length === 0
              ? 'No saved plans yet. Pick a preset or build your own.'
              : `${plans.length} saved plan${plans.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button className="btn-quiet" onClick={() => setCreating(true)}>+ New plan</button>
      </div>

      {plans.length === 0 ? (
        <div className="presets-grid">
          {PLAN_PRESETS.map((preset) => (
            <button
              key={preset.key}
              className="preset-card"
              onClick={() => setCreating(true)}
              title={`Start a ${preset.name} plan`}
            >
              <div className="preset-name">{preset.name}</div>
              <div className="preset-desc">{preset.description}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="plans-grid">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              completions={completionsByPlan.get(p.id) || []}
              today={today}
              onClick={() => setSelectedId(p.id)}
            />
          ))}
        </div>
      )}

      {creating && (
        <PlanCreateModal
          today={today}
          onClose={() => setCreating(false)}
          onSaved={async (newId) => {
            setCreating(false);
            await onChanged();
            setSelectedId(newId);
          }}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan, completions, today, onClick,
}: {
  plan: ReadingPlan;
  completions: PlanCompletion[];
  today: Date;
  onClick: () => void;
}) {
  const pace = useMemo(
    () => planPaceStatus({
      plan,
      completionsCount: completions.length,
      today,
      chapterCountFor: chapterCount,
    }),
    [plan, completions.length, today],
  );

  return (
    <button className="plan-card" onClick={onClick}>
      <div className="plan-card-head">
        <h3 className="plan-name">{plan.name}</h3>
        <PacePill pace={pace} />
      </div>
      <div className="plan-card-meta">
        {plan.start_date} → {plan.end_date} · {plan.books.length} book{plan.books.length === 1 ? '' : 's'} · {pace.total} chapters
      </div>
      <div className="plan-progress-track">
        <div className="plan-progress-fill" style={{ width: `${(pace.pctComplete * 100).toFixed(1)}%` }} />
      </div>
      <div className="plan-card-foot">
        <span>{pace.completed} / {pace.total} chapters</span>
        <span className="muted">{Math.round(pace.pctComplete * 100)}%</span>
      </div>
    </button>
  );
}

function PlanDetail({
  plan, completions, today, onBack, onChanged,
}: {
  plan: ReadingPlan;
  completions: PlanCompletion[];
  today: Date;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const pace = useMemo(
    () => planPaceStatus({
      plan,
      completionsCount: completions.length,
      today,
      chapterCountFor: chapterCount,
    }),
    [plan, completions.length, today],
  );

  const sequence = useMemo(
    () => planChapterSequence({ books: plan.books }, chapterCount),
    [plan.books],
  );

  const completionSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of completions) s.add(`${c.book}|${c.chapter}`);
    return s;
  }, [completions]);

  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(book: string, chapter: number) {
    const key = `${book}|${chapter}`;
    if (busy) return;
    setBusy(key);
    try {
      await togglePlanCompletion(plan.id, book, chapter);
      await onChanged();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete "${plan.name}"? This removes its completion history too.`)) return;
    try {
      await deleteReadingPlan(plan.id);
      onBack();
      await onChanged();
    } catch (err) {
      console.error(err);
    }
  }

  // Group sequence by book for the per-book matrix rendering.
  const bookGroups = useMemo(() => {
    const out: Array<{ book: string; chapters: number[] }> = [];
    let current: { book: string; chapters: number[] } | null = null;
    for (const cell of sequence) {
      if (!current || current.book !== cell.book) {
        current = { book: cell.book, chapters: [] };
        out.push(current);
      }
      current.chapters.push(cell.chapter);
    }
    return out;
  }, [sequence]);

  return (
    <div className="dt-plan-detail">
      <div className="plan-detail-head">
        <button className="back-btn" onClick={onBack}>← all plans</button>
        <button className="btn-quiet danger" onClick={onDelete}>Delete plan</button>
      </div>

      <div className="panel">
        <div className="plan-detail-title-row">
          <h2 className="plan-name large">{plan.name}</h2>
          <PacePill pace={pace} verbose />
        </div>
        <div className="plan-detail-meta">
          {plan.start_date} → {plan.end_date} · {plan.books.length} book{plan.books.length === 1 ? '' : 's'} ·
          {' '}{plan.per_session} {plan.unit}/session ·
          {' '}{plan.days_of_week.map((d) => DAY_NAMES_SHORT[d]).join(' ')}
        </div>

        <div className="plan-progress-track lg">
          <div className="plan-progress-fill" style={{ width: `${(pace.pctComplete * 100).toFixed(1)}%` }} />
        </div>
        <div className="plan-detail-totals">
          <span><strong>{pace.completed}</strong> of {pace.total} chapters complete</span>
          <span className="muted">expected by today: {pace.expected}</span>
          <span className="muted">{Math.round(pace.pctComplete * 100)}% done</span>
        </div>
      </div>

      <div className="panel">
        <h3 className="stats-h3">Chapters</h3>
        <p className="dt-form-hint" style={{ marginTop: 4 }}>
          Click a chapter to mark it complete. Click again to undo.
        </p>
        <div className="plan-books-list">
          {bookGroups.map((g) => {
            const total = g.chapters.length;
            const done = g.chapters.filter((c) => completionSet.has(`${g.book}|${c}`)).length;
            return (
              <div key={g.book} className="plan-book-row">
                <div className="plan-book-name">
                  <span className="bn">{g.book}</span>
                  <span className="bc">{done}/{total}</span>
                </div>
                <div className="plan-chapter-grid">
                  {g.chapters.map((c) => {
                    const key = `${g.book}|${c}`;
                    const done = completionSet.has(key);
                    const isBusy = busy === key;
                    return (
                      <button
                        key={c}
                        className={`plan-chap${done ? ' done' : ''}${isBusy ? ' busy' : ''}`}
                        onClick={() => toggle(g.book, c)}
                        disabled={isBusy}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── + Plan modal ──────────────────────────────────────────────────────

function PlanCreateModal({
  today,
  onClose,
  onSaved,
}: {
  today: Date;
  onClose: () => void;
  onSaved: (newId: string) => void;
}) {
  // Default to the Bible-in-a-Year preset's shape.
  const initial = PLAN_PRESETS[0].build(today);
  const [name, setName] = useState(initial.name);
  const [books, setBooks] = useState<Set<string>>(new Set(initial.books));
  const [startDate, setStartDate] = useState(initial.start_date);
  const [endDate, setEndDate] = useState(initial.end_date);
  const [daysOfWeek, setDaysOfWeek] = useState<Set<number>>(new Set(initial.days_of_week));
  const [perSession, setPerSession] = useState(initial.per_session);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function applyPreset(p: PlanPreset) {
    const built = p.build(today);
    setName(built.name);
    setBooks(new Set(built.books));
    setStartDate(built.start_date);
    setEndDate(built.end_date);
    setDaysOfWeek(new Set(built.days_of_week));
    setPerSession(built.per_session);
  }

  function toggleBook(book: string) {
    setBooks((prev) => {
      const next = new Set(prev);
      if (next.has(book)) next.delete(book);
      else next.add(book);
      return next;
    });
  }

  function toggleDow(dow: number) {
    setDaysOfWeek((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow);
      else next.add(dow);
      return next;
    });
  }

  // Total chapters preview.
  const totalChapters = useMemo(() => {
    let t = 0;
    for (const b of books) t += chapterCount(b);
    return t;
  }, [books]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);
    if (!name.trim()) { setErr('Name required.'); return; }
    if (books.size === 0) { setErr('Pick at least one book.'); return; }
    if (daysOfWeek.size === 0) { setErr('Pick at least one day of the week.'); return; }
    if (endDate < startDate) { setErr('End date must be on or after start date.'); return; }
    setSaving(true);
    try {
      const created = await createReadingPlan({
        name: name.trim(),
        books: BIBLE_BOOKS.filter((b) => books.has(b)), // canonical order
        start_date: startDate,
        end_date: endDate,
        days_of_week: Array.from(daysOfWeek).sort((a, b) => a - b),
        unit: 'chapters',
        per_session: perSession,
      });
      onSaved(created.id);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Modal title="+ Reading plan" onClose={onClose}>
      <form className="dt-form" onSubmit={onSubmit}>
        <div className="preset-strip">
          {PLAN_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="preset-chip"
              onClick={() => applyPreset(p)}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="row">
          <label>
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
        </div>

        <label>
          Days of the week
          <div className="dow-row">
            {DAY_NAMES_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`dow-btn${daysOfWeek.has(i) ? ' active' : ''}`}
                onClick={() => toggleDow(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </label>

        <label>
          Chapters per session
          <input
            type="number"
            min={1}
            max={200}
            value={perSession}
            onChange={(e) => setPerSession(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            required
          />
        </label>

        <label>
          Books
          <div className="books-picker-toolbar">
            <button type="button" onClick={() => setBooks(new Set(OLD_TESTAMENT))}>OT only</button>
            <button type="button" onClick={() => setBooks(new Set(NEW_TESTAMENT))}>NT only</button>
            <button type="button" onClick={() => setBooks(new Set(BIBLE_BOOKS))}>All 66</button>
            <button type="button" onClick={() => setBooks(new Set())}>Clear</button>
            <span className="picker-meta">
              {books.size} book{books.size === 1 ? '' : 's'} · {totalChapters} chapter{totalChapters === 1 ? '' : 's'}
            </span>
          </div>
          <div className="books-picker">
            <div className="picker-col">
              <div className="picker-head">Old Testament</div>
              {OLD_TESTAMENT.map((b) => (
                <label key={b} className="picker-item">
                  <input type="checkbox" checked={books.has(b)} onChange={() => toggleBook(b)} />
                  {b}
                </label>
              ))}
            </div>
            <div className="picker-col">
              <div className="picker-head">New Testament</div>
              {NEW_TESTAMENT.map((b) => (
                <label key={b} className="picker-item">
                  <input type="checkbox" checked={books.has(b)} onChange={() => toggleBook(b)} />
                  {b}
                </label>
              ))}
            </div>
          </div>
        </label>

        {err && <div className="dt-form-err">{err}</div>}
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
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

// ── + Book / Edit Book modal ─────────────────────────────────────────
// Single component handles both: create when `existing` is null, edit
// otherwise. Title and other fields pre-fill from `existing`. The
// "bulk import" footer link is only shown in create mode (it'd be
// confusing in an edit context).

function BookFormModal({
  existing,
  onClose,
  onSaved,
  onWantImport,
}: {
  existing?: BookRead | null;
  onClose: () => void;
  onSaved: () => void;
  onWantImport?: () => void;
}) {
  const [date, setDate] = useState(existing?.finished_on || localToday());
  const [pages, setPages] = useState(existing?.pages || 0);
  const [title, setTitle] = useState(existing?.title || '');
  const [author, setAuthor] = useState(existing?.author || '');
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(existing?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState(existing?.review || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEdit = !!existing;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!title.trim()) { setErr('Title required.'); return; }
    setSaving(true); setErr(null);
    try {
      if (existing) {
        await updateBookRead(existing.id, {
          finished_on: date,
          title: title.trim(),
          author: author.trim(),
          pages,
          rating,
          review: review.trim() || null,
        });
      } else {
        await createBookRead({
          finished_on: date,
          title: title.trim(),
          author: author.trim(),
          pages,
          rating,
          review: review.trim() || null,
        });
      }
      onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit book' : '+ Book'} onClose={onClose}>
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
        {!isEdit && onWantImport && (
          <div className="modal-footer-link">
            Have a Goodreads library? <button type="button" className="text-link" onClick={onWantImport}>
              Bulk import from CSV
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Goodreads import modal ───────────────────────────────────────────
// Two phases: pick a file → preview the candidates and stats → confirm
// → bulk insert. Idempotent: dedupes against existing book reads on
// (title, finished_on), so re-running is safe.

function GoodreadsImportModal({
  existingBooks,
  onClose,
  onSaved,
}: {
  existingBooks: BookRead[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<GoodreadsImportPreview | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [toInsert, setToInsert] = useState<GoodreadsBookCandidate[]>([]);
  const [phase, setPhase] = useState<'pick' | 'preview' | 'inserting' | 'done'>('pick');
  const [err, setErr] = useState<string | null>(null);
  const [insertedCount, setInsertedCount] = useState(0);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setErr('That CSV looks empty or unrecognised.');
        return;
      }
      const previewData = buildImportPreview(rows);
      const dedup = dedupAgainstExisting(
        previewData.candidates,
        existingBooks.map((b) => ({ title: b.title, finished_on: b.finished_on })),
      );
      setPreview(previewData);
      setToInsert(dedup.toInsert);
      setDuplicateCount(dedup.duplicateCount);
      setPhase('preview');
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not read that file.');
    }
  }

  async function onConfirm() {
    if (toInsert.length === 0 || phase === 'inserting') return;
    setPhase('inserting');
    setErr(null);
    try {
      const inserted = await bulkCreateBookReads(toInsert.map((c) => ({
        finished_on: c.finished_on,
        title: c.title,
        author: c.author,
        pages: c.pages,
        rating: c.rating,
        review: c.review,
      })));
      setInsertedCount(inserted);
      setPhase('done');
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Something went wrong while saving.');
      setPhase('preview');
    }
  }

  return (
    <Modal title="Import from Goodreads" onClose={onClose}>
      {phase === 'pick' && (
        <div className="dt-form import-pick">
          <p className="dt-form-hint" style={{ marginTop: 0 }}>
            Export your library from <em>Goodreads → My Books → Import and export → Export Library</em>.
            That gives you a CSV you can drop here. We'll only import books on your <em>Read</em> shelf;
            to-read and currently-reading lists are ignored.
          </p>
          <label className="file-pick">
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            <span className="file-pick-button">Choose CSV file…</span>
            {fileName && <span className="file-pick-name">{fileName}</span>}
          </label>
          {err && <div className="dt-form-err">{err}</div>}
          <div className="dt-modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'preview' && preview && (
        <div className="dt-form import-preview">
          <div className="import-summary">
            <div className="import-headline">
              <strong>{toInsert.length}</strong> book{toInsert.length === 1 ? '' : 's'} ready to import
              {duplicateCount > 0 && <> · <span className="muted">{duplicateCount} skipped as duplicates</span></>}
            </div>
            <ul className="import-detail">
              {preview.skippedNonRead > 0 && (
                <li>
                  <span className="muted">Skipped {preview.skippedNonRead}</span> on other shelves
                  ({Object.entries(preview.shelfBreakdown).map(([s, n]) => `${n} ${s}`).join(', ')})
                </li>
              )}
              {preview.dateFallbackCount > 0 && (
                <li>
                  <strong>{preview.dateFallbackCount}</strong> book{preview.dateFallbackCount === 1 ? '' : 's'} had no <em>Date Read</em> —
                  using <em>Date Added</em> as a stand-in.
                </li>
              )}
              {preview.missingPagesCount > 0 && (
                <li>
                  <strong>{preview.missingPagesCount}</strong> book{preview.missingPagesCount === 1 ? '' : 's'} had no page count —
                  pages set to 0; you can edit them after import (click <em>edit</em> on any book card).
                </li>
              )}
              {preview.reReadCount > 0 && (
                <li>
                  <strong>{preview.reReadCount}</strong> re-read{preview.reReadCount === 1 ? '' : 's'} —
                  Goodreads only stored one date per book; each will be imported once with the most recent date,
                  and you can add the earlier reads via <em>+ Book</em>.
                </li>
              )}
            </ul>
          </div>

          {toInsert.length > 0 && (
            <div className="import-list-wrap">
              <div className="import-list-head">First few to import:</div>
              <ul className="import-list">
                {toInsert.slice(0, 8).map((c, i) => (
                  <li key={i}>
                    <span className="ip-date">{c.finished_on}</span>
                    <span className="ip-title">{c.title}</span>
                    {c.author && <span className="ip-author">{c.author}</span>}
                    {c.pages > 0 && <span className="ip-pages">{c.pages}p</span>}
                    {c.rating > 0 && <span className="ip-rating">{'★'.repeat(c.rating)}</span>}
                    {c.dateFallback && <span className="ip-warn">date est.</span>}
                    {c.readCount > 1 && <span className="ip-warn">re-read</span>}
                  </li>
                ))}
                {toInsert.length > 8 && (
                  <li className="ip-more">…and {toInsert.length - 8} more.</li>
                )}
              </ul>
            </div>
          )}

          {err && <div className="dt-form-err">{err}</div>}
          <div className="dt-modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="primary"
              onClick={onConfirm}
              disabled={toInsert.length === 0}
            >
              Import {toInsert.length} book{toInsert.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {phase === 'inserting' && (
        <div className="import-progress">
          <div className="dt-loading">Importing {toInsert.length} books… this may take a moment.</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="import-done">
          <p>Imported <strong>{insertedCount}</strong> book{insertedCount === 1 ? '' : 's'}.</p>
          {preview && preview.missingPagesCount > 0 && (
            <p className="dt-form-hint">
              Don't forget — <strong>{preview.missingPagesCount}</strong> book{preview.missingPagesCount === 1 ? '' : 's'} need page counts.
              Open <em>Book × Chapter → Books</em> and click <em>add pages</em> on each.
            </p>
          )}
          <div className="dt-modal-actions">
            <button type="button" className="primary" onClick={onSaved}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── + Daily pages modal ──────────────────────────────────────────────

function AddDailyPagesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(localToday());
  const [pages, setPages] = useState(1);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (pages <= 0) { setErr('Pages must be at least 1.'); return; }
    setSaving(true); setErr(null);
    try {
      await createDailyPageRead({
        read_date: date,
        pages,
        title: title.trim() || null,
        author: author.trim() || null,
      });
      onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <Modal title="+ Daily pages" onClose={onClose}>
      <form className="dt-form" onSubmit={onSubmit}>
        <div className="row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Pages
            <input
              type="number"
              min={1}
              value={pages}
              onChange={(e) => setPages(Math.max(1, Number(e.target.value) || 1))}
              required
            />
          </label>
        </div>
        <p className="dt-form-hint">
          For days you read but didn't finish a book. These light up the heatmap and calendar
          alongside completions.
        </p>
        <label>
          Title (optional)
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Author (optional)
          <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
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
