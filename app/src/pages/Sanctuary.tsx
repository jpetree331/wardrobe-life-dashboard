import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  bulkInsertSanctuary,
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
import {
  parseMetadata,
  parseSanctuaryFile,
  type ParsedSanctuaryEntry,
} from '../lib/sanctuaryImport';
import {
  buildBinderTree,
  expansionKeysForEntry,
  monthKey,
  yearKey,
  type SortOrder,
} from '../lib/binderTree';
import { liturgicalLabel } from '../lib/liturgicalCalendar';
import { useFavicon } from '../hooks/useFavicon';
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
  useFavicon('/icons/jcross2.png', 'Sanctuary · Wardrobe');
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

  const [sel, setSel] = useState<{
    top: number;
    left: number;
    inHighlight: boolean;
  } | null>(null);
  const scriptureBodyRef = useRef<HTMLDivElement | null>(null);

  // Verses are rendered as an HTML string instead of JSX so that
  // user-applied highlights (DOM-mutated <span class="sa-sc-highlight">)
  // can be cached and restored when the user navigates away and back to
  // the same passage. Without the cache, switching Luke 24 → Luke 23 →
  // Luke 24 would re-fetch fresh verses and the highlights would be lost.
  const [versesHtml, setVersesHtml] = useState<string>('');
  const versesCache = useRef<Map<string, string>>(new Map());
  const currentVersesKey = useRef<string>('');
  const versesHtmlRef = useRef<string>('');
  useEffect(() => {
    versesHtmlRef.current = versesHtml;
  }, [versesHtml]);

  // Resizable binder column. Persisted to localStorage so the width
  // survives reloads. Clamped to [180, 600] in the drag handler.
  const [binderWidth, setBinderWidth] = useState<number>(() => {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem('sa-binder-width') : null;
    const n = saved ? Number(saved) : NaN;
    return Number.isFinite(n) && n >= 180 && n <= 600 ? n : 280;
  });

  // Year / month folder expansion in the binder. Set of keys ("2024" or
  // "2024-04"). Persisted to localStorage; auto-includes the active entry's
  // year and month on first load so the user lands on something visible.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = window.localStorage.getItem('sa-binder-expanded');
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      /* ignore corrupt JSON */
    }
    return new Set();
  });

  // Display order toggle — newest-first ('desc') by default, oldest-first
  // ('asc') for chronological reading. Persists per-user/browser.
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === 'undefined') return 'desc';
    const saved = window.localStorage.getItem('sa-sort-order');
    return saved === 'asc' ? 'asc' : 'desc';
  });

  const pageRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const titleHydrationKey = useRef<string | null>(null);
  const bodyHydrationKey = useRef<string | null>(null);

  const [timelineLine, setTimelineLine] = useState<TimelineRow | null>(null);

  // Folder-import state
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    entries: ParsedSanctuaryEntry[];
    skipped: Array<{ filename: string; reason: string }>;
    folderName: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);

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

  // Persist binder width
  useEffect(() => {
    window.localStorage.setItem('sa-binder-width', String(binderWidth));
  }, [binderWidth]);

  // Persist expanded folders
  useEffect(() => {
    window.localStorage.setItem('sa-binder-expanded', JSON.stringify([...expanded]));
  }, [expanded]);

  // Persist sort order
  useEffect(() => {
    window.localStorage.setItem('sa-sort-order', sortOrder);
  }, [sortOrder]);

  // Auto-expand the active entry's year + month on first activation, so the
  // user lands on a visible row instead of staring at a fully-collapsed tree.
  // Does not collapse anything the user has already opened.
  const lastAutoExpandedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    if (lastAutoExpandedFor.current === active.id) return;
    lastAutoExpandedFor.current = active.id;
    const keys = expansionKeysForEntry(active);
    if (keys.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) if (!next.has(k)) { next.add(k); changed = true; }
      return changed ? next : prev;
    });
  }, [active]);

  function toggleFolder(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Splitter drag handler. Listens on the document so the drag continues
  // even if the cursor leaves the splitter element.
  function startBinderResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = binderWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(180, Math.min(600, startW + (ev.clientX - startX)));
      setBinderWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

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

  // ── Folder import (Scrivener "File → Export → Files…" output) ──────────
  async function handleImportFolder(files: FileList | null) {
    if (!files || files.length === 0) return;
    setStatusMsg(`Reading ${files.length} files…`);

    // Group by base name to pair each .md with its sibling " MetaData.txt"
    const fileList = Array.from(files);
    const mdFiles = fileList.filter((f) => /\.md$/i.test(f.name));
    const metaByPath = new Map<string, File>();
    for (const f of fileList) {
      if (/ MetaData\.txt$/i.test(f.name)) {
        const path = (f as any).webkitRelativePath || f.name;
        metaByPath.set(path, f);
      }
    }

    const folderName = (fileList[0] as any).webkitRelativePath?.split('/')[0] || 'folder';

    const entries: ParsedSanctuaryEntry[] = [];
    const skipped: Array<{ filename: string; reason: string }> = [];

    for (const md of mdFiles) {
      const mdPath = (md as any).webkitRelativePath || md.name;
      const metaPath = mdPath.replace(/\.md$/i, ' MetaData.txt');
      let metadata = null;
      const metaFile = metaByPath.get(metaPath);
      if (metaFile) {
        try {
          metadata = parseMetadata(await metaFile.text());
        } catch {
          metadata = null;
        }
      }
      let body: string;
      try {
        body = await md.text();
      } catch {
        skipped.push({ filename: md.name, reason: 'could not read file' });
        continue;
      }
      const parsed = parseSanctuaryFile(md.name, body, metadata);
      if (!parsed) {
        skipped.push({ filename: md.name, reason: 'no date in filename or metadata' });
        continue;
      }
      entries.push(parsed);
    }

    setImportPreview({ entries, skipped, folderName });
    setStatusMsg(`Read ${entries.length} entries from ${folderName}.`);
  }

  async function performImport() {
    if (!importPreview) return;
    setImporting(true);
    const plan = importPreview;
    setStatusMsg(`Importing ${plan.entries.length} entries…`);
    try {
      const payload = plan.entries.map((e) => ({
        entry_date: e.date,
        title: e.title,
        body: e.body_html,
        entry_type: 'journal' as EntryType,
        tags: e.tags,
        scripture_refs: e.scripture_refs,
      }));
      const result = await bulkInsertSanctuary(payload, (done, total) => {
        setStatusMsg(`Importing ${done} of ${total}…`);
      });
      const parts: string[] = [`Imported ${result.inserted}`];
      if (result.skipped) {
        parts.push(`skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}`);
      }
      if (result.failed) {
        parts.push(
          `${result.failed} failed — re-run import to retry (already-inserted rows will skip)`,
        );
      }
      setStatusMsg(`${parts.join(' · ')} from ${plan.folderName}.`);
      setImportPreview(null);
      const data = await listSanctuary();
      setEntries(data);
    } catch (err) {
      console.error(err);
      setStatusMsg('Import failed. Some rows may have been added.');
    } finally {
      setImporting(false);
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
  // Manage the verses cache. When scResult changes:
  //   1. Save the OUTGOING passage's current versesHtml to the cache
  //      (preserves any highlights the user just applied).
  //   2. Look up the INCOMING passage in the cache. If found, restore that
  //      HTML (including saved highlights). If not, render fresh from
  //      `scResult.verses`.
  // No save happens when switching to/from a null result (loading, error).
  useEffect(() => {
    if (!scResult) return;
    const newKey = `${scResult.reference}::${scResult.translation}`;
    if (currentVersesKey.current === newKey) return;

    if (currentVersesKey.current && versesHtmlRef.current) {
      versesCache.current.set(currentVersesKey.current, versesHtmlRef.current);
    }
    currentVersesKey.current = newKey;

    const cached = versesCache.current.get(newKey);
    setVersesHtml(cached ?? renderVersesHtml(scResult.verses));
  }, [scResult]);

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
      setSel({
        top: r.top - 38,
        left: r.left + r.width / 2 - 70,
        inHighlight: ancestorMatches(range.commonAncestorContainer, 'sa-sc-highlight'),
      });
    }
    document.addEventListener('selectionchange', update);
    document.addEventListener('mouseup', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('mouseup', update);
    };
  }, []);

  function handleScriptureSelAction(action: 'highlight' | 'copy' | 'unhighlight') {
    const s = window.getSelection();
    if (!s || s.isCollapsed) return;
    if (action === 'copy') {
      navigator.clipboard?.writeText(s.toString());
    } else if (action === 'highlight') {
      const range = s.getRangeAt(0);
      const span = document.createElement('span');
      span.className = 'sa-sc-highlight';
      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch {
        /* ignore */
      }
      syncVersesHtmlFromDom();
    } else if (action === 'unhighlight') {
      // Walk up from the selection to find the .sa-sc-highlight ancestor;
      // unwrap that ONE span (replace it with its children). Other highlights
      // elsewhere in the passage are untouched.
      const range = s.getRangeAt(0);
      const host = findAncestor(range.commonAncestorContainer, 'sa-sc-highlight');
      if (host && host.parentNode) {
        while (host.firstChild) host.parentNode.insertBefore(host.firstChild, host);
        host.parentNode.removeChild(host);
      }
      syncVersesHtmlFromDom();
    }
    s.removeAllRanges();
    setSel(null);
  }

  // After any DOM mutation inside the scripture body (add/remove highlight),
  // mirror the resulting HTML back into React state. Without this, navigating
  // away and back via the cache would lose the change — the cache reads
  // versesHtmlRef, which only updates when versesHtml state updates.
  function syncVersesHtmlFromDom() {
    const verses = scriptureBodyRef.current?.querySelector('.sa-verses');
    if (verses) setVersesHtml(verses.innerHTML);
  }

  // Click-to-select. The selection toolbar only appears on a non-collapsed
  // selection, so a plain click on a highlight wouldn't surface the "Remove
  // highlight" affordance. This handler programmatically selects the text
  // contents of any highlight the user clicks, which trips the existing
  // selectionchange path and shows the toolbar with the Remove button.
  function handleScriptureClick(e: React.MouseEvent) {
    const highlight = findAncestor(e.target as Node, 'sa-sc-highlight');
    if (!highlight) return;
    const range = document.createRange();
    range.selectNodeContents(highlight);
    const s = window.getSelection();
    if (!s) return;
    s.removeAllRanges();
    s.addRange(range);
  }

  // ── Filtering / search ─────────────────────────────────────────────────
  // `entries` is fetched newest-first from the DB. We re-sort here so the
  // sort toggle drives ALL views (tree + search-flat list) without a refetch.
  const orderedEntries = useMemo(() => {
    const dir = sortOrder === 'asc' ? 1 : -1;
    return entries.slice().sort((a, b) => {
      const d = a.entry_date.localeCompare(b.entry_date) * dir;
      if (d !== 0) return d;
      return (a.created_at || '').localeCompare(b.created_at || '') * dir;
    });
  }, [entries, sortOrder]);

  const visibleEntries = useMemo(() => {
    if (!search.trim()) return orderedEntries;
    const q = search.toLowerCase();
    return orderedEntries.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.body || '').toLowerCase().includes(q) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        e.entry_date.includes(q),
    );
  }, [orderedEntries, search]);

  // Tree view of the binder. Only built when no search is active — when the
  // user is searching, we collapse to a flat hit list (matches across years
  // shouldn't be hidden behind closed folders).
  const tree = useMemo(
    () => (search.trim() ? null : buildBinderTree(visibleEntries, sortOrder)),
    [visibleEntries, search, sortOrder],
  );

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
    const input = window.prompt('Tag (comma-separated for multiple)');
    if (!input) return;
    // Accept "presence, bread, recognition" → three tags. Empty pieces and
    // duplicates against the existing list are dropped.
    const incoming = input
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (incoming.length === 0) return;
    const tags = Array.from(new Set([...(active.tags || []), ...incoming]));
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
            {(() => {
              const label = liturgicalLabel(new Date());
              return label ? (
                <>
                  <span>{label}</span>
                  <span className="dot">✦</span>
                </>
              ) : null;
            })()}
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

      <div
        className={`sa-grid${mode === 'dual' ? ' dual' : ''}`}
        style={{ ['--sa-binder-width' as any]: `${binderWidth}px` }}
      >
        {/* Binder */}
        <aside className="sa-panel sa-binder-panel" aria-label="Binder">
          <div className="sa-panel-head">
            <h2>Binder</h2>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <input
                ref={importInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                // webkitdirectory enables folder picking in Chromium/WebKit;
                // not in TS's HTMLInputElement type — cast attribute through.
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                onChange={(e) => {
                  handleImportFolder(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                className="tool"
                onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
                title={
                  sortOrder === 'desc'
                    ? 'Currently newest first — click to flip to oldest first'
                    : 'Currently oldest first — click to flip to newest first'
                }
              >
                {sortOrder === 'desc' ? 'newest ↓' : 'oldest ↑'}
              </button>
              <button className="tool" onClick={() => importInputRef.current?.click()}>
                import…
              </button>
              <button className="tool" onClick={newEntry}>
                + new
              </button>
            </div>
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
            ) : tree ? (
              // Tree view (no search): year folders → month folders → entries.
              <div className="sa-binder-tree">
                {tree.map((yg) => {
                  const yKey = yearKey(yg.year);
                  const yOpen = expanded.has(yKey);
                  return (
                    <div key={yg.year} className="sa-binder-year">
                      <button
                        className="sa-binder-folder"
                        aria-expanded={yOpen}
                        onClick={() => toggleFolder(yKey)}
                      >
                        <span className="chev">{yOpen ? '▾' : '▸'}</span>
                        <span className="label">{yg.year}</span>
                        <span className="count">{yg.count}</span>
                      </button>
                      {yOpen &&
                        yg.months.map((mg) => {
                          const mKey = monthKey(yg.year, mg.month);
                          const mOpen = expanded.has(mKey);
                          return (
                            <div key={mg.month} className="sa-binder-month">
                              <button
                                className="sa-binder-folder month"
                                aria-expanded={mOpen}
                                onClick={() => toggleFolder(mKey)}
                              >
                                <span className="chev">{mOpen ? '▾' : '▸'}</span>
                                <span className="label">{mg.monthLabel}</span>
                                <span className="count">{mg.count}</span>
                              </button>
                              {mOpen && (
                                <ul className="sa-entries">
                                  {mg.entries.map((e) => (
                                    <li
                                      key={e.id}
                                      className={e.id === activeId ? 'active' : ''}
                                      onClick={() => setActiveId(e.id)}
                                    >
                                      <span className="date">{e.entry_date}.</span>
                                      {e.title || (
                                        <em style={{ color: 'var(--ink-faint)' }}>untitled</em>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Search mode: flatten so cross-folder hits aren't hidden.
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
        <div
          className="sa-binder-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize binder"
          onMouseDown={startBinderResize}
          onDoubleClick={() => setBinderWidth(280)}
          title="Drag to resize · double-click to reset"
        />


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
                  <span className="pip">✦</span>
                  <span>{dayOfWeekFor(active.entry_date)}</span>
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
              <div
                className="sa-scripture-body"
                ref={scriptureBodyRef}
                onClick={handleScriptureClick}
              >
                {scLoading && <div className="sa-sc-loading">Fetching…</div>}
                {scError && <div className="sa-sc-error">{scError}</div>}
                {scResult && (
                  <>
                    <h2>{scResult.reference}</h2>
                    {/* Verses are rendered as HTML so user-applied highlight
                        spans survive across passage navigation via the
                        per-(reference, translation) cache. The HTML source
                        is either freshly built from `scResult.verses` or
                        restored from cache (with prior highlights baked in). */}
                    <p
                      className="sa-verses"
                      dangerouslySetInnerHTML={{ __html: versesHtml }}
                    />
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
          {sel.inHighlight ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleScriptureSelAction('unhighlight')}
            >
              Remove highlight
            </button>
          ) : (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleScriptureSelAction('highlight')}
            >
              Highlight
            </button>
          )}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleScriptureSelAction('copy')}
          >
            Copy
          </button>
        </div>
      )}

      {importPreview && (
        <ImportPreviewDialog
          preview={importPreview}
          importing={importing}
          onCancel={() => setImportPreview(null)}
          onConfirm={performImport}
        />
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

// ── Import preview dialog ───────────────────────────────────────────────

function ImportPreviewDialog({
  preview,
  importing,
  onCancel,
  onConfirm,
}: {
  preview: {
    entries: ParsedSanctuaryEntry[];
    skipped: Array<{ filename: string; reason: string }>;
    folderName: string;
  };
  importing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const byYear = new Map<string, number>();
  for (const e of preview.entries) {
    const y = e.date.slice(0, 4);
    byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const years = [...byYear.entries()].sort();
  const titlelessCount = preview.entries.filter((e) => !e.title).length;
  const fromMetadataCount = preview.entries.filter((e) => e.dateSource === 'metadata').length;

  return (
    <div className="sa-import-modal-bg" onClick={importing ? undefined : onCancel}>
      <div className="sa-import-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Import {preview.folderName}</h2>
        <p>
          Found <strong>{preview.entries.length}</strong> prayer-journal entries
          {preview.skipped.length > 0 && (
            <> · <span style={{ color: 'var(--ink-faint)' }}>{preview.skipped.length} files couldn't be parsed</span></>
          )}.
        </p>

        <div className="sa-import-stats">
          {years.map(([y, n]) => (
            <span key={y} className="sa-import-year">
              {y} <em>{n}</em>
            </span>
          ))}
        </div>

        <p style={{ color: 'var(--ink-faint)', fontStyle: 'italic', fontSize: 13 }}>
          {fromMetadataCount > 0 && (
            <>
              {fromMetadataCount} entr{fromMetadataCount === 1 ? 'y has' : 'ies have'} no
              date in the filename — falling back to the Scrivener "Created"
              timestamp.{' '}
            </>
          )}
          {titlelessCount > 0 && (
            <>
              {titlelessCount} entr{titlelessCount === 1 ? 'y has' : 'ies have'} no
              title in filename or body — the binder will show those as italic
              "untitled" with the date.{' '}
            </>
          )}
          Existing entries with the same date and body will be skipped.
          You can re-run the import safely; nothing imports twice.
        </p>

        {preview.skipped.length > 0 && (
          <details className="sa-import-skipped">
            <summary>{preview.skipped.length} files skipped (no usable date)</summary>
            <ul>
              {preview.skipped.slice(0, 30).map((s) => (
                <li key={s.filename}>
                  {s.filename}
                  <span style={{ color: 'var(--ink-faint)' }}> — {s.reason}</span>
                </li>
              ))}
              {preview.skipped.length > 30 && <li>… and {preview.skipped.length - 30} more</li>}
            </ul>
          </details>
        )}

        <div className="sa-import-actions">
          <button onClick={onCancel} disabled={importing}>
            Cancel
          </button>
          <button className="primary" onClick={onConfirm} disabled={importing}>
            {importing ? 'Importing…' : `Import ${preview.entries.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Render a fresh verses HTML string from the API result. Used when the
 * user navigates to a passage we haven't cached yet. The structure mirrors
 * what the previous JSX render produced — outer wrapping span per verse,
 * inner `.sa-vnum` superscript, then the verse text — so the CSS
 * selectors continue to match.
 *
 * Verse text is HTML-escaped so any odd characters in the API response
 * can't inject markup.
 */
export function renderVersesHtml(
  verses: Array<{ verse: number; text: string }>,
): string {
  return verses
    .map(
      (v) =>
        `<span><span class="sa-vnum">${v.verse}</span>${escapeHtmlForVerses(v.text || '')} </span>`,
    )
    .join('');
}

function escapeHtmlForVerses(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Walk parent chain from a node looking for an Element with the given class. */
function findAncestor(node: Node | null, className: string): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.classList.contains(className)) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function ancestorMatches(node: Node | null, className: string): boolean {
  return findAncestor(node, className) !== null;
}

function entryTypeLabel(t: EntryType): string {
  if (!t) return 'Journal';
  return ENTRY_TYPES.find((x) => x.value === t)?.label || 'Journal';
}

/**
 * Day of the week ("Thursday") for a 'YYYY-MM-DD' string. Constructs the
 * Date from year/month/day in local time so a string like "2026-04-30"
 * doesn't slip back to Wednesday in a US timezone (which `new Date(string)`
 * would do — it parses ISO dates as UTC midnight). Returns '' for any
 * malformed input so the meta-line gracefully omits the segment.
 */
function dayOfWeekFor(entryDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(entryDate || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
}

function todayLine(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} · A·D ${d.getFullYear()}`;
}
