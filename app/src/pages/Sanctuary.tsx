import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createSanctuaryEntry,
  deleteEntry,
  listSanctuary,
  timelineForDate,
  updateSanctuaryEntry,
  type Entry,
  type EntryType,
  type TimelineRow,
} from '../lib/entries';
import {
  fetchScripture,
  TRANSLATIONS,
  type ScriptureResult,
  type Translation,
} from '../lib/scripture';
import './Sanctuary.css';

type Mode = 'single' | 'dual';
type PaneTab = 'scripture' | 'inspector';

const ENTRY_TYPES: Array<{ value: EntryType; label: string }> = [
  { value: null,        label: '—' },
  { value: 'lectio',    label: 'Lectio Divina' },
  { value: 'examen',    label: 'Examen' },
  { value: 'prayer',    label: 'Prayer' },
  { value: 'scripture', label: 'Scripture' },
  { value: 'journal',   label: 'Journal' },
];

export default function Sanctuary() {
  const [searchParams] = useSearchParams();
  const deepLinkDate = searchParams.get('date');
  const deepLinkId = searchParams.get('id');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Entry | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [paneTab, setPaneTab] = useState<PaneTab>('scripture');
  const [search, setSearch] = useState('');
  const [savedAt, setSavedAt] = useState<string>('saved');
  const [statusMsg, setStatusMsg] = useState('Loading…');
  const [loaded, setLoaded] = useState(false);

  const [fontFamily, setFontFamily] = useState("'EB Garamond', Georgia, serif");
  const [fontSize, setFontSize] = useState(17);

  const [scRef, setScRef] = useState('');
  const [scTranslation, setScTranslation] = useState<Translation>('kjv');
  const [scResult, setScResult] = useState<ScriptureResult | null>(null);
  const [scLoading, setScLoading] = useState(false);
  const [scError, setScError] = useState<string | null>(null);

  const [sel, setSel] = useState<{ top: number; left: number } | null>(null);
  const scriptureBodyRef = useRef<HTMLDivElement | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const titleHydrationKey = useRef<string | null>(null);
  const bodyHydrationKey = useRef<string | null>(null);

  const [timelineLine, setTimelineLine] = useState<TimelineRow | null>(null);

  // ── Load list ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const data = await listSanctuary();
      setEntries(data);
      setLoaded(true);
      let pickId: string | null = null;
      if (deepLinkId && data.find((e) => e.id === deepLinkId)) {
        pickId = deepLinkId;
      } else if (deepLinkDate) {
        const match = data.find((e) => e.entry_date === deepLinkDate);
        if (match) pickId = match.id;
      }
      if (!pickId) pickId = data[0]?.id || null;
      setActiveId(pickId);
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load entries.');
      setLoaded(true);
    }
  }, [deepLinkDate, deepLinkId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sync `active` when activeId changes
  useEffect(() => {
    const e = entries.find((x) => x.id === activeId) || null;
    setActive(e);
    setStatusMsg(
      e
        ? `Sanctuary · ${entryTypeLabel(e.entry_type)} · ${e.entry_date}. ${e.title || 'untitled'}`
        : 'Sanctuary · no entry selected',
    );
  }, [entries, activeId]);

  // Auto-fill the scripture pane's reference ONLY when the user switches to a
  // different entry — not on every save round-trip. Otherwise typing into the
  // ref input gets blown away the next time the editor saves.
  const scRefForActive = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId) return;
    if (scRefForActive.current === activeId) return;
    scRefForActive.current = activeId;
    const e = entries.find((x) => x.id === activeId);
    if (e && e.scripture_refs && e.scripture_refs.length > 0) {
      setScRef(e.scripture_refs[0]);
    }
  }, [activeId, entries]);

  // Hydrate contentEditable DOM when active entry changes
  useEffect(() => {
    if (!active) return;
    if (titleRef.current && titleHydrationKey.current !== active.id) {
      titleRef.current.textContent = active.title || '';
      titleHydrationKey.current = active.id;
    }
    if (pageRef.current && bodyHydrationKey.current !== active.id) {
      pageRef.current.innerHTML = active.body || '';
      bodyHydrationKey.current = active.id;
    }
  }, [active]);

  // Pull the day's timeline sentence
  useEffect(() => {
    let alive = true;
    if (!active) {
      setTimelineLine(null);
      return;
    }
    timelineForDate(active.entry_date)
      .then((row) => {
        if (alive) setTimelineLine(row);
      })
      .catch(() => {
        if (alive) setTimelineLine(null);
      });
    return () => {
      alive = false;
    };
  }, [active]);

  // Deep-link composer: if ?date= has no matching entry, create a draft
  const composedDate = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !deepLinkDate) return;
    if (entries.find((e) => e.entry_date === deepLinkDate)) return;
    if (composedDate.current === deepLinkDate) return;
    composedDate.current = deepLinkDate;
    (async () => {
      try {
        const created = await createSanctuaryEntry({
          entry_date: deepLinkDate,
          title: '',
          body: '',
          entry_type: 'journal',
          tags: [],
          scripture_refs: [],
        });
        const data = await listSanctuary();
        setEntries(data);
        setActiveId(created.id);
        titleHydrationKey.current = null;
        bodyHydrationKey.current = null;
      } catch (err) {
        console.error(err);
      }
    })();
  }, [loaded, deepLinkDate, entries]);

  // ── Save (debounced) ───────────────────────────────────────────────────
  // Optimistically applies `patch` to local state immediately so controlled
  // inputs (date picker, type select, tag list) reflect the new value
  // without waiting for the 600ms debounce + network round-trip. The
  // schedule is keyed to `targetId` captured at call time, so saves still
  // commit to the right entry even if the user switches active mid-debounce.
  //
  // Sequence guard: clearTimeout almost always keeps a single save in flight,
  // but two can overlap if a save fires *just after* the previous one's
  // network call already started. Each fire bumps `saveSeq`; only the latest
  // fired save is allowed to write its server response back into local
  // state. Without this, an older response arriving late would overwrite the
  // newer (already-displayed) state.
  const saveTimer = useRef<number | null>(null);
  const saveSeq = useRef(0);
  const lastAppliedSeq = useRef(0);
  const scheduleSave = useCallback(
    (
      patch: Partial<
        Pick<Entry, 'title' | 'body' | 'entry_type' | 'tags' | 'scripture_refs' | 'entry_date'>
      >,
    ) => {
      if (!active) return;
      const targetId = active.id;
      // Optimistic local update so controlled inputs never appear "stuck"
      // on the previous value while the debounce timer is still ticking.
      setEntries((es) => es.map((e) => (e.id === targetId ? { ...e, ...patch } : e)));
      setSavedAt('saving…');
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const mySeq = ++saveSeq.current;
        try {
          const updated = await updateSanctuaryEntry(targetId, patch);
          if (mySeq < lastAppliedSeq.current) return; // a newer save has already won
          lastAppliedSeq.current = mySeq;
          setEntries((es) => es.map((e) => (e.id === updated.id ? updated : e)));
          setSavedAt('saved');
          if (patch.entry_date) {
            // entry_date affects sort order — refetch to put the row in
            // its new place in the binder.
            const data = await listSanctuary();
            if (mySeq < lastAppliedSeq.current) return;
            setEntries(data);
          }
        } catch (err) {
          console.error(err);
          if (mySeq < lastAppliedSeq.current) return;
          setSavedAt('save failed');
          // Roll the optimistic update back so we don't silently keep a
          // change the server rejected.
          try {
            const data = await listSanctuary();
            if (mySeq < lastAppliedSeq.current) return;
            setEntries(data);
          } catch {
            /* refetch failed too — leave the user's local state alone */
          }
        }
      }, 600);
    },
    [active],
  );

  // ── New / delete ───────────────────────────────────────────────────────
  async function newEntry() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const created = await createSanctuaryEntry({
        entry_date: today,
        title: '',
        body: '',
        entry_type: 'journal',
        tags: [],
        scripture_refs: [],
      });
      const data = await listSanctuary();
      setEntries(data);
      setActiveId(created.id);
      titleHydrationKey.current = null;
      bodyHydrationKey.current = null;
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not create entry.');
    }
  }

  async function deleteActive() {
    if (!active) return;
    if (!window.confirm(`Delete "${active.title || 'untitled'}"?`)) return;
    try {
      await deleteEntry(active.id);
      titleHydrationKey.current = null;
      bodyHydrationKey.current = null;
      const data = await listSanctuary();
      setEntries(data);
      setActiveId(data[0]?.id || null);
    } catch (err) {
      console.error(err);
      setStatusMsg('Delete failed.');
    }
  }

  // ── Toolbar formatting (legacy execCommand — same as the design) ───────
  function exec(cmd: string, value?: string) {
    if (!pageRef.current) return;
    pageRef.current.focus();
    document.execCommand(cmd, false, value);
    handleEditorInput();
  }

  function wrapSelection(tag: string, className?: string) {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) return;
    if (!pageRef.current?.contains(s.anchorNode)) return;
    const range = s.getRangeAt(0);
    const span = document.createElement(tag);
    if (className) span.className = className;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    s.removeAllRanges();
    handleEditorInput();
  }

  function insertNode(node: Node) {
    const s = window.getSelection();
    if (!s || !pageRef.current) return;
    if (s.rangeCount === 0 || !pageRef.current.contains(s.anchorNode)) {
      pageRef.current.appendChild(node);
    } else {
      const range = s.getRangeAt(0);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      s.removeAllRanges();
      s.addRange(range);
    }
    handleEditorInput();
  }

  function toggleDropcap() {
    const s = window.getSelection();
    let p: HTMLParagraphElement | null = null;
    if (s && s.anchorNode && pageRef.current?.contains(s.anchorNode)) {
      const el = (s.anchorNode as Element).nodeType === Node.ELEMENT_NODE
        ? (s.anchorNode as Element)
        : s.anchorNode.parentElement;
      p = el?.closest('p') || null;
    }
    if (!p) p = pageRef.current?.querySelector('p') || null;
    if (p) {
      p.classList.toggle('dropcap');
      handleEditorInput();
    }
  }

  function insertVerseNum() {
    const n = window.prompt('Verse number', '1');
    if (!n) return;
    const span = document.createElement('span');
    span.className = 'verse-num';
    span.textContent = n;
    insertNode(span);
  }

  function handleTitleInput() {
    if (!titleRef.current || !active) return;
    scheduleSave({ title: titleRef.current.textContent || '' });
  }
  function handleEditorInput() {
    if (!pageRef.current || !active) return;
    scheduleSave({ body: pageRef.current.innerHTML });
  }

  // ── Scripture ──────────────────────────────────────────────────────────
  const lookupScripture = useCallback(async () => {
    if (!scRef.trim()) return;
    setScLoading(true);
    setScError(null);
    try {
      const result = await fetchScripture(scRef.trim(), scTranslation);
      setScResult(result);
    } catch (err: any) {
      setScError(err?.message || 'Could not fetch scripture.');
      setScResult(null);
    } finally {
      setScLoading(false);
    }
  }, [scRef, scTranslation]);

  // Auto-lookup when entering dual mode for the first time; also re-fetch
  // when the user picks a different translation while a result is already
  // displayed (matches the original design's behavior — switching KJV → WEB
  // shouldn't require a second click on Open).
  useEffect(() => {
    if (mode !== 'dual' || !scRef || scLoading) return;
    if (!scResult || scResult.translation !== scTranslation) {
      lookupScripture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scRef, scTranslation]);

  // Floating selection toolbar over scripture
  useEffect(() => {
    function update() {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.rangeCount === 0 || !scriptureBodyRef.current) {
        setSel(null);
        return;
      }
      const range = s.getRangeAt(0);
      if (!scriptureBodyRef.current.contains(range.commonAncestorContainer)) {
        setSel(null);
        return;
      }
      const r = range.getBoundingClientRect();
      setSel({ top: r.top - 38, left: r.left + r.width / 2 - 70 });
    }
    document.addEventListener('selectionchange', update);
    document.addEventListener('mouseup', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mouseup', update);
    };
  }, []);

  function handleScriptureSelAction(action: 'highlight' | 'copy') {
    const s = window.getSelection();
    if (!s || s.isCollapsed) return;
    if (action === 'copy') {
      navigator.clipboard?.writeText(s.toString());
    } else {
      const range = s.getRangeAt(0);
      const span = document.createElement('span');
      span.className = 'sa-sc-highlight';
      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch {
        /* ignore */
      }
    }
    s.removeAllRanges();
    setSel(null);
  }

  // ── Filtering / search ─────────────────────────────────────────────────
  const visibleEntries = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.body || '').toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        e.entry_date.includes(q),
    );
  }, [entries, search]);

  const wordCount = useMemo(() => {
    if (!active?.body) return 0;
    const text = active.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
  }, [active?.body]);

  // ── Tag / scripture-ref editing ────────────────────────────────────────
  // scheduleSave applies the patch optimistically and rolls back on failure,
  // so these handlers don't need their own setEntries call.
  function addTag() {
    if (!active) return;
    const t = window.prompt('Tag');
    if (!t) return;
    const trimmed = t.trim();
    if (!trimmed) return;
    const tags = Array.from(new Set([...(active.tags || []), trimmed]));
    scheduleSave({ tags });
  }
  function removeTag(tag: string) {
    if (!active) return;
    const tags = (active.tags || []).filter((t) => t !== tag);
    scheduleSave({ tags });
  }
  function addScriptureRef() {
    if (!active) return;
    const r = window.prompt('Reference (e.g. Luke 24:13–35)');
    if (!r) return;
    const trimmed = r.trim();
    if (!trimmed) return;
    const refs = Array.from(new Set([...(active.scripture_refs || []), trimmed]));
    scheduleSave({ scripture_refs: refs });
  }
  function removeScriptureRef(ref: string) {
    if (!active) return;
    const refs = (active.scripture_refs || []).filter((r) => r !== ref);
    scheduleSave({ scripture_refs: refs });
  }

  return (
    <div className="sanctuary-page">
      <header className="sa-ribbon">
        <div className="left">
          <Link className="back" to="/">
            ← hallway
          </Link>
          <div className="place">Sanctuary</div>
          <div className="season">
            <span>{todayBlessing()}</span>
            <span className="dot">✦</span>
            <span>{todayLine()}</span>
          </div>
        </div>
        <div className="right">
          <div className="sa-mode-toggle" role="group" aria-label="Layout mode">
            <button aria-pressed={mode === 'single'} onClick={() => setMode('single')}>
              Single
            </button>
            <button aria-pressed={mode === 'dual'} onClick={() => setMode('dual')}>
              Scripture + Prayer
            </button>
          </div>
        </div>
      </header>

      <div className={`sa-grid${mode === 'dual' ? ' dual' : ''}`}>
        {/* Binder */}
        <aside className="sa-panel" aria-label="Binder">
          <div className="sa-panel-head">
            <h2>Binder</h2>
            <button className="tool" onClick={newEntry}>
              + new
            </button>
          </div>
          <nav className="sa-binder">
            {visibleEntries.length === 0 ? (
              <div className="sa-entries">
                <div className="empty">
                  {entries.length === 0
                    ? 'No entries yet. Click + new to begin.'
                    : 'No matches for that search.'}
                </div>
              </div>
            ) : (
              <ul className="sa-entries">
                {visibleEntries.map((e) => (
                  <li
                    key={e.id}
                    className={e.id === activeId ? 'active' : ''}
                    onClick={() => setActiveId(e.id)}
                  >
                    <span className="date">{e.entry_date}.</span>
                    {e.title || <em style={{ color: 'var(--ink-faint)' }}>untitled</em>}
                  </li>
                ))}
              </ul>
            )}
          </nav>
          <div className="sa-binder-foot">
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </aside>

        {/* Editor */}
        <section className="sa-editor-wrap">
          <div className="sa-toolbar" role="toolbar" aria-label="Formatting">
            <div className="sa-toolbar-group">
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                aria-label="Font"
              >
                <option value="'EB Garamond', Georgia, serif">EB Garamond</option>
                <option value="'Cormorant Garamond', serif">Cormorant</option>
                <option value="'Sorts Mill Goudy', serif">Sorts Mill Goudy</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Iowan Old Style', 'Palatino Linotype', serif">Iowan / Palatino</option>
              </select>
              <div className="sa-size-control">
                <button className="btn" onClick={() => setFontSize((s) => Math.max(12, s - 1))} aria-label="Smaller">
                  −
                </button>
                <input
                  type="number"
                  value={fontSize}
                  min={12}
                  max={36}
                  onChange={(e) =>
                    setFontSize(Math.min(36, Math.max(12, Number(e.target.value) || 17)))
                  }
                />
                <button className="btn" onClick={() => setFontSize((s) => Math.min(36, s + 1))} aria-label="Larger">
                  +
                </button>
              </div>
            </div>

            <div className="sa-toolbar-group">
              <button className="btn b" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} title="Bold">
                B
              </button>
              <button className="btn i" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} title="Italic">
                <em>I</em>
              </button>
              <button className="btn u" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} title="Underline">
                U
              </button>
              <button className="btn s" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')} title="Strikethrough">
                S̶
              </button>
              <button
                className="btn hl"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('hiliteColor', 'rgba(218, 181, 86, 0.35)')}
                title="Highlight"
              >
                H
              </button>
              <button
                className="btn red"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapSelection('span', 'red-letter')}
                title="Red-letter"
              >
                ✝
              </button>
            </div>

            <div className="sa-toolbar-group">
              <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'h2')} title="Heading">
                H
              </button>
              <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'blockquote')} title="Quote">
                ❝
              </button>
              <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={toggleDropcap} title="Drop cap">
                Ɒ
              </button>
              <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={insertVerseNum} title="Verse number">
                1
              </button>
              <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('span', 'rubric')} title="Rubric">
                R
              </button>
            </div>

            <div className="spacer" />
            <span className="muted">{savedAt}</span>
          </div>

          <div
            className="sa-editor-pane"
            style={{
              ['--sa-font-body' as any]: fontFamily,
              ['--sa-font-size' as any]: `${fontSize}px`,
            }}
          >
            {active ? (
              <article className="sa-page" key={active.id}>
                <h1
                  ref={titleRef}
                  className="title"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  onInput={handleTitleInput}
                  data-placeholder="Title…"
                />
                <div className="meta-line">
                  <span className="pip">✦</span>
                  <span>{entryTypeLabel(active.entry_type)}</span>
                  <span className="pip">✦</span>
                  <span>{active.entry_date}</span>
                  {(active.scripture_refs || []).slice(0, 1).map((r) => (
                    <span key={r} style={{ display: 'contents' }}>
                      <span className="pip">✦</span>
                      <span>{r}</span>
                    </span>
                  ))}
                </div>
                <div
                  ref={pageRef}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  onInput={handleEditorInput}
                  data-placeholder="Begin here…"
                  style={{ outline: 'none', minHeight: '40vh' }}
                />
              </article>
            ) : (
              <article className="sa-page">
                <h1 className="title placeholder">No entry selected</h1>
                <div className="meta-line">
                  <span style={{ fontStyle: 'italic' }}>Click + new in the binder to begin.</span>
                </div>
              </article>
            )}
          </div>
        </section>

        {/* Scripture pane (dual mode) */}
        {mode === 'dual' && (
          <section className="sa-scripture-pane" aria-label="Scripture">
            <div className="sa-scripture-head">
              <div className="sa-pane-tabs" role="tablist">
                <button
                  className="sa-pane-tab"
                  aria-pressed={paneTab === 'scripture'}
                  onClick={() => setPaneTab('scripture')}
                >
                  Scripture
                </button>
                <button
                  className="sa-pane-tab"
                  aria-pressed={paneTab === 'inspector'}
                  onClick={() => setPaneTab('inspector')}
                >
                  Inspector
                </button>
              </div>
              {paneTab === 'scripture' && (
                <div className="sa-sc-controls">
                  <select
                    value={scTranslation}
                    onChange={(e) => setScTranslation(e.target.value as Translation)}
                    title="Translation"
                  >
                    {TRANSLATIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={scRef}
                    onChange={(e) => setScRef(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') lookupScripture();
                    }}
                    placeholder="Luke 24:13-35"
                  />
                  <button
                    onClick={lookupScripture}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--ink-soft)',
                      fontStyle: 'italic',
                      cursor: 'pointer',
                      fontFamily: "'EB Garamond', serif",
                      fontSize: 13,
                    }}
                  >
                    Open
                  </button>
                </div>
              )}
            </div>
            {paneTab === 'scripture' ? (
              <div className="sa-scripture-body" ref={scriptureBodyRef}>
                {scLoading && <div className="sa-sc-loading">Fetching…</div>}
                {scError && <div className="sa-sc-error">{scError}</div>}
                {scResult && (
                  <>
                    <h2>{scResult.reference}</h2>
                    <p>
                      {scResult.verses.map((v, i) => (
                        <span key={`${v.chapter}-${v.verse}-${i}`}>
                          <span className="sa-vnum">{v.verse}</span>
                          {v.text}{' '}
                        </span>
                      ))}
                    </p>
                    <div className="sa-sc-source">Source: {scResult.source}</div>
                  </>
                )}
                {!scResult && !scLoading && !scError && (
                  <div style={{ fontStyle: 'italic', color: 'var(--ink-faint)' }}>
                    Enter a reference and press Open.
                  </div>
                )}
              </div>
            ) : (
              <div
                className="sa-scripture-body"
                style={{ fontFamily: "'EB Garamond', serif", fontSize: 14, lineHeight: 1.5 }}
              >
                <Inspector
                  active={active}
                  wordCount={wordCount}
                  timelineLine={timelineLine}
                  onChangeDate={(d) => scheduleSave({ entry_date: d })}
                  onChangeType={(t) => scheduleSave({ entry_type: t })}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  onAddScriptureRef={addScriptureRef}
                  onRemoveScriptureRef={removeScriptureRef}
                  onDelete={deleteActive}
                />
              </div>
            )}
          </section>
        )}

        {/* Inspector (single mode) */}
        {mode === 'single' && (
          <aside className="sa-panel sa-inspector" aria-label="Inspector">
            <div className="sa-panel-head">
              <h2>Inspector</h2>
            </div>
            <div className="sa-insp-body">
              <Inspector
                active={active}
                wordCount={wordCount}
                timelineLine={timelineLine}
                onChangeDate={(d) => scheduleSave({ entry_date: d })}
                onChangeType={(t) => scheduleSave({ entry_type: t })}
                onAddTag={addTag}
                onRemoveTag={removeTag}
                onAddScriptureRef={addScriptureRef}
                onRemoveScriptureRef={removeScriptureRef}
                onDelete={deleteActive}
              />
            </div>
          </aside>
        )}
      </div>

      {sel && (
        <div className="sa-sel-toolbar" style={{ top: sel.top, left: sel.left }}>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => handleScriptureSelAction('highlight')}>
            Highlight
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => handleScriptureSelAction('copy')}>
            Copy
          </button>
        </div>
      )}

      <footer className="sa-status">
        <div>{statusMsg}</div>
        <div className="right">
          <span>
            {wordCount} word{wordCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>{savedAt}</span>
        </div>
      </footer>
    </div>
  );
}

// ── Inspector ───────────────────────────────────────────────────────────

function Inspector({
  active,
  wordCount,
  timelineLine,
  onChangeDate,
  onChangeType,
  onAddTag,
  onRemoveTag,
  onAddScriptureRef,
  onRemoveScriptureRef,
  onDelete,
}: {
  active: Entry | null;
  wordCount: number;
  timelineLine: TimelineRow | null;
  onChangeDate: (d: string) => void;
  onChangeType: (t: EntryType) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAddScriptureRef: () => void;
  onRemoveScriptureRef: (ref: string) => void;
  onDelete: () => void;
}) {
  if (!active) {
    return (
      <div style={{ fontStyle: 'italic', color: 'var(--ink-faint)' }}>No entry selected.</div>
    );
  }
  return (
    <>
      <div className="sa-insp-section">
        <h3>Entry</h3>
        <div className="sa-insp-row">
          <span className="k">Date</span>
          <input type="date" value={active.entry_date} onChange={(e) => onChangeDate(e.target.value)} />
        </div>
        <div className="sa-insp-row">
          <span className="k">Type</span>
          <select
            value={active.entry_type ?? ''}
            onChange={(e) => onChangeType((e.target.value || null) as EntryType)}
          >
            {ENTRY_TYPES.map((t) => (
              <option key={t.label} value={t.value ?? ''}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sa-insp-row">
          <span className="k">Words</span>
          <span className="v">{wordCount}</span>
        </div>
      </div>

      <div className="sa-insp-section">
        <h3>Tags</h3>
        <div>
          {(active.tags || []).map((t) => (
            <span key={t} className="sa-tag" onClick={() => onRemoveTag(t)} title="Click to remove">
              {t}
            </span>
          ))}
          <span className="sa-tag add" onClick={onAddTag}>
            + add
          </span>
        </div>
      </div>

      <div className="sa-insp-section">
        <h3>Scripture References</h3>
        {active.scripture_refs && active.scripture_refs.length > 0 ? (
          <ul className="sa-refs">
            {active.scripture_refs.map((r) => (
              <li key={r}>
                <span>{r}</span>
                <button onClick={() => onRemoveScriptureRef(r)}>remove</button>
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ fontStyle: 'italic', color: 'var(--ink-faint)', fontSize: 13 }}>None yet.</div>
        )}
        <span className="sa-tag add" onClick={onAddScriptureRef} style={{ marginTop: 8 }}>
          + add reference
        </span>
      </div>

      {timelineLine?.summary && (
        <div className="sa-insp-section">
          <h3>Timeline · {timelineLine.entry_date}</h3>
          <div className="timeline-back">"{timelineLine.summary}"</div>
        </div>
      )}

      <div className="sa-insp-section">
        <button
          onClick={onDelete}
          style={{
            background: 'transparent',
            border: '1px solid var(--line-strong)',
            color: 'var(--red)',
            fontFamily: "'EB Garamond', serif",
            fontSize: 13,
            padding: '6px 12px',
            cursor: 'pointer',
            borderRadius: 2,
            fontStyle: 'italic',
          }}
        >
          Delete entry
        </button>
      </div>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function entryTypeLabel(t: EntryType): string {
  if (!t) return 'Journal';
  return ENTRY_TYPES.find((x) => x.value === t)?.label || 'Journal';
}

function todayBlessing(): string {
  // Gentle liturgical hint; not authoritative.
  const m = new Date().getMonth();
  if (m === 11 || m === 0) return 'Christmastide';
  if (m === 1 || m === 2) return 'Lent';
  if (m === 3) return 'Eastertide';
  if (m === 4 || m === 5) return 'Pentecost';
  return 'Ordinary Time';
}

function todayLine(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} · A·D ${d.getFullYear()}`;
}
