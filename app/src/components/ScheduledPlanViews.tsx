// Card + detail views for SCHEDULED reading plans (fixed day-by-day
// schedules such as the four-track One-Year Bible plan). Classic plans —
// "a list of books read once" — keep their own views in pages/Data.tsx.
//
// Completion is keyed by (day, book, chapter): scheduled plans repeat
// chapters, so Psalm 2 on day 2 and on day 364 are separate checkmarks.

import { useEffect, useMemo, useState } from 'react';
import {
  clearPlanDay,
  deleteReadingPlan,
  markPlanDayReadings,
  togglePlanDayCompletion,
  type PlanDayCompletion,
  type ReadingPlan,
} from '../lib/data';
import { localToday } from '../lib/dates';
import {
  TRACK_LABELS,
  dateForDay,
  readingKey,
  scheduledPace,
  totalReadings,
  trackOf,
  type ScheduledPace,
  type ScheduledPlanDef,
  type ScheduledReading,
} from '../lib/scheduledPlans';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DOW_SHORT[dow]}, ${MONTHS_SHORT[m - 1]} ${d}`;
}

function keysOf(completions: PlanDayCompletion[]): Set<string> {
  const s = new Set<string>();
  for (const c of completions) s.add(readingKey(c.day_number, c.book, c.chapter));
  return s;
}

function ScheduledPacePill({ pace, verbose = false }: { pace: ScheduledPace; verbose?: boolean }) {
  const n = Math.abs(pace.delta);
  const unit = verbose ? ` reading${n === 1 ? '' : 's'}` : '';
  let glyph = '→', label = 'on pace', cls = 'on';
  if (pace.status === 'finished') { glyph = '✓'; label = 'finished'; cls = 'ahead'; }
  else if (pace.status === 'not-started') { glyph = '·'; label = 'not started'; }
  else if (pace.status === 'ahead') { glyph = '↑'; label = `ahead by ${n}${unit}`; cls = 'ahead'; }
  else if (pace.status === 'behind') { glyph = '↓'; label = `behind by ${n}${unit}`; cls = 'behind'; }
  return (
    <span className={`plan-pace ${cls}`} aria-label={label}>
      <span className="pace-glyph" aria-hidden="true">{glyph}</span>{' '}{label}
    </span>
  );
}

// ── Card (plans grid) ────────────────────────────────────────────────

export function ScheduledPlanCard({
  plan, def, completions, today, onClick,
}: {
  plan: ReadingPlan;
  def: ScheduledPlanDef;
  completions: PlanDayCompletion[];
  today: Date;
  onClick: () => void;
}) {
  const pace = useMemo(
    () => scheduledPace({
      def, startDate: plan.start_date, today: localToday(today), completedKeys: keysOf(completions),
    }),
    [def, plan.start_date, today, completions],
  );
  return (
    <button className="plan-card" onClick={onClick}>
      <div className="plan-card-head">
        <h3 className="plan-name">{plan.name}</h3>
        <ScheduledPacePill pace={pace} />
      </div>
      <div className="plan-card-meta">
        {plan.start_date} → {plan.end_date} · {def.days.length} days · {pace.total.toLocaleString()} readings
      </div>
      <div className="plan-progress-track">
        <div className="plan-progress-fill" style={{ width: `${(pace.pctComplete * 100).toFixed(1)}%` }} />
      </div>
      <div className="plan-card-foot">
        <span>{pace.daysComplete} / {def.days.length} days</span>
        <span className="muted">{Math.round(pace.pctComplete * 100)}%</span>
      </div>
    </button>
  );
}

// ── Detail ───────────────────────────────────────────────────────────

export function ScheduledPlanDetail({
  plan, def, completions, today, onBack, onChanged,
}: {
  plan: ReadingPlan;
  def: ScheduledPlanDef;
  completions: PlanDayCompletion[];
  today: Date;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const todayIso = localToday(today);

  // Optimistic overlay: a click flips the chip instantly; the server write
  // and the page-wide refresh follow. The overlay clears whenever fresh
  // completions arrive from the parent.
  const serverKeys = useMemo(() => keysOf(completions), [completions]);
  const [overlay, setOverlay] = useState<Map<string, boolean>>(new Map());
  useEffect(() => { setOverlay(new Map()); }, [completions]);
  const doneKeys = useMemo(() => {
    const s = new Set(serverKeys);
    for (const [k, v] of overlay) { if (v) s.add(k); else s.delete(k); }
    return s;
  }, [serverKeys, overlay]);

  const pace = useMemo(
    () => scheduledPace({ def, startDate: plan.start_date, today: todayIso, completedKeys: doneKeys }),
    [def, plan.start_date, todayIso, doneKeys],
  );
  const totalDays = def.days.length;
  const todayNumber = pace.todayNumber;
  const inRange = todayNumber >= 1 && todayNumber <= totalDays;

  const [err, setErr] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  function fail(e: unknown) {
    console.error(e);
    const msg = (e as { message?: string })?.message || 'Could not save.';
    setErr(/data_plan_day_completions|preset_key/.test(msg)
      ? 'Could not save — has migration 0018 been run in Supabase?'
      : msg);
    setOverlay(new Map());
  }

  async function toggleReading(dayNumber: number, r: ScheduledReading) {
    const key = readingKey(dayNumber, r.book, r.chapter);
    const next = !doneKeys.has(key);
    setErr(null);
    setOverlay((m) => new Map(m).set(key, next));
    try {
      await togglePlanDayCompletion(plan.id, dayNumber, r.book, r.chapter);
      await onChanged();
    } catch (e) { fail(e); }
  }

  /** Click a day's label: check the whole day, or clear it if already full. */
  async function toggleDay(dayNumber: number) {
    const readings = def.days[dayNumber - 1];
    const allDone = readings.every((r) => doneKeys.has(readingKey(dayNumber, r.book, r.chapter)));
    setErr(null);
    setOverlay((m) => {
      const n = new Map(m);
      for (const r of readings) n.set(readingKey(dayNumber, r.book, r.chapter), !allDone);
      return n;
    });
    try {
      if (allDone) await clearPlanDay(plan.id, dayNumber);
      else {
        await markPlanDayReadings(
          plan.id,
          readings.map((r) => ({ day_number: dayNumber, book: r.book, chapter: r.chapter })),
        );
      }
      await onChanged();
    } catch (e) { fail(e); }
  }

  // Joining mid-stream (e.g. following a Jan 1 class schedule from
  // September): one action to mark everything before today as read.
  const unreadBeforeToday = useMemo(() => {
    const out: Array<{ day_number: number; book: string; chapter: number }> = [];
    const upTo = Math.min(todayNumber - 1, totalDays);
    for (let n = 1; n <= upTo; n++) {
      for (const r of def.days[n - 1]) {
        if (!doneKeys.has(readingKey(n, r.book, r.chapter))) {
          out.push({ day_number: n, book: r.book, chapter: r.chapter });
        }
      }
    }
    return out;
  }, [def, doneKeys, todayNumber, totalDays]);

  async function catchUp() {
    const upTo = Math.min(todayNumber - 1, totalDays);
    if (!confirm(`Mark days 1–${upTo} as read (${unreadBeforeToday.length.toLocaleString()} readings)? Use this if you're joining the plan partway through.`)) return;
    setBulkBusy(true); setErr(null);
    try {
      await markPlanDayReadings(plan.id, unreadBeforeToday);
      await onChanged();
    } catch (e) { fail(e); }
    finally { setBulkBusy(false); }
  }

  async function onDelete() {
    if (!confirm(`Delete "${plan.name}"? This removes its completion history too.`)) return;
    try {
      await deleteReadingPlan(plan.id);
      onBack();
      await onChanged();
    } catch (e) { fail(e); }
  }

  // Days grouped by the calendar month they land in.
  const months = useMemo(() => {
    const out: Array<{ key: string; label: string; days: number[] }> = [];
    for (let n = 1; n <= totalDays; n++) {
      const iso = dateForDay(plan.start_date, n);
      const key = iso.slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`, days: [] };
        out.push(g);
      }
      g.days.push(n);
    }
    return out;
  }, [plan.start_date, totalDays]);

  // Open the month containing today (or the first month) by default.
  const defaultOpen = useMemo(() => {
    const anchor = inRange ? todayNumber : todayNumber < 1 ? 1 : totalDays;
    return dateForDay(plan.start_date, anchor).slice(0, 7);
  }, [inRange, todayNumber, totalDays, plan.start_date]);
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([defaultOpen]));
  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // A render helper, not a component: an inner component would get a new
  // identity every render and remount (dropping focus) on each click.
  function chips(dayNumber: number) {
    return (
      <div className="sp-chips">
        {def.days[dayNumber - 1].map((r) => {
          const done = doneKeys.has(readingKey(dayNumber, r.book, r.chapter));
          return (
            <button
              key={`${r.book}|${r.chapter}`}
              className={`sp-chip track-${trackOf(r.book)}${done ? ' done' : ''}`}
              onClick={() => toggleReading(dayNumber, r)}
              title={`${TRACK_LABELS[trackOf(r.book)]} — click to ${done ? 'uncheck' : 'mark read'}`}
              aria-pressed={done}
            >
              {r.book} {r.chapter}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="dt-plan-detail">
      <div className="plan-detail-head">
        <button className="back-btn" onClick={onBack}>← all plans</button>
        <button className="btn-quiet danger" onClick={onDelete}>Delete plan</button>
      </div>

      <div className="panel">
        <div className="plan-detail-title-row">
          <h2 className="plan-name large">{plan.name}</h2>
          <ScheduledPacePill pace={pace} verbose />
        </div>
        <div className="plan-detail-meta">
          {plan.start_date} → {plan.end_date} · {totalDays} days · {totalReadings(def).toLocaleString()} readings ·
          {' '}four tracks a day
        </div>
        <div className="plan-progress-track lg">
          <div className="plan-progress-fill" style={{ width: `${(pace.pctComplete * 100).toFixed(1)}%` }} />
        </div>
        <div className="plan-detail-totals">
          <span><strong>{pace.daysComplete}</strong> of {totalDays} days complete</span>
          <span className="muted">{pace.completed.toLocaleString()} / {pace.total.toLocaleString()} readings</span>
          <span className="muted">expected by today: {pace.expected.toLocaleString()}</span>
        </div>
        {unreadBeforeToday.length > 0 && todayNumber > 1 && (
          <p className="dt-form-hint sp-catchup">
            Joining partway through?{' '}
            <button className="sp-link" onClick={catchUp} disabled={bulkBusy}>
              {bulkBusy ? 'Marking…' : `Mark days 1–${Math.min(todayNumber - 1, totalDays)} as read`}
            </button>
          </p>
        )}
        {err && <div className="dt-form-err">{err}</div>}
      </div>

      <div className="panel sp-today">
        {inRange ? (
          <>
            <h3 className="stats-h3">
              Today · Day {todayNumber} <span className="sp-today-date">{prettyDate(todayIso)}</span>
            </h3>
            {chips(todayNumber)}
          </>
        ) : todayNumber < 1 ? (
          <h3 className="stats-h3">Begins {prettyDate(plan.start_date)} — Day 1 is waiting.</h3>
        ) : (
          <h3 className="stats-h3">The calendar year of this plan has ended — finish at your own pace.</h3>
        )}
      </div>

      <div className="panel">
        <h3 className="stats-h3">Day by day</h3>
        <p className="dt-form-hint" style={{ marginTop: 4 }}>
          Click a reading to mark it read; click a day's label to mark the whole day. Click again to undo.
        </p>
        <div className="sp-months">
          {months.map((g) => {
            const open = openMonths.has(g.key);
            const doneDays = g.days.filter((n) =>
              def.days[n - 1].every((r) => doneKeys.has(readingKey(n, r.book, r.chapter)))).length;
            return (
              <section key={g.key} className="sp-month">
                <button className="sp-month-head" onClick={() => toggleMonth(g.key)} aria-expanded={open}>
                  <span className="sp-arrow">{open ? '▾' : '▸'}</span>
                  <span className="sp-month-name">{g.label}</span>
                  <span className="sp-month-count">{doneDays}/{g.days.length} days</span>
                </button>
                {open && (
                  <div className="sp-days">
                    {g.days.map((n) => {
                      const iso = dateForDay(plan.start_date, n);
                      const full = def.days[n - 1].every((r) => doneKeys.has(readingKey(n, r.book, r.chapter)));
                      return (
                        <div key={n} className={`sp-day${n === todayNumber ? ' today' : ''}${full ? ' full' : ''}`}>
                          <button
                            className="sp-day-label"
                            onClick={() => toggleDay(n)}
                            title={full ? 'Clear this day' : 'Mark the whole day read'}
                          >
                            <span className="sp-day-num">Day {n}</span>
                            <span className="sp-day-date">{prettyDate(iso)}</span>
                          </button>
                          {chips(n)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
