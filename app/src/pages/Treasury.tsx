// Treasury — the room for verses kept from Scripture reading.
//
// Two kinds: 'promise' (a verse held as a promise from God, highlighted
// faint yellow) and 'standout' (a verse that arrested attention in
// reading, unhighlighted but present). Chronological default, sort-by-
// book option, type filter, search.
//
// Schema: app/supabase/migrations/0006_treasury.sql
// CRUD: src/lib/treasury.ts

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createTreasuryVerse,
  deleteTreasuryVerse,
  formatReference,
  listTreasuryVerses,
  updateTreasuryVerse,
  type TreasuryKind,
  type TreasuryVerse,
} from '../lib/treasury';
import { BIBLE_BOOKS } from '../lib/bibleVerseCounts';
import { parseBibleRef } from '../lib/bibleRef';
import {
  fetchScripture,
  TRANSLATIONS,
  type Translation,
} from '../lib/scripture';
import { localToday } from '../lib/dates';
import { useFavicon } from '../hooks/useFavicon';
import './Treasury.css';

type KindFilter = 'all' | 'promise' | 'standout';
type SortMode = 'chronological' | 'by-book';

// Canonical-order index, used for the by-book sort.
const BOOK_ORDER: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  BIBLE_BOOKS.forEach((b, i) => { out[b] = i; });
  return out;
})();

export default function Treasury() {
  useFavicon('/icons/wardrobe1.png', 'Treasury · Wardrobe');

  const [verses, setVerses] = useState<TreasuryVerse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Loading…');

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('chronological');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; verse: TreasuryVerse } | null>(null);

  const refresh = async () => {
    try {
      const data = await listTreasuryVerses();
      setVerses(data);
      setLoaded(true);
      setStatusMsg(
        data.length === 0
          ? 'Empty so far. Click + Keep verse to begin.'
          : `${data.length} verse${data.length === 1 ? '' : 's'} kept`,
      );
    } catch (err) {
      console.error(err);
      setStatusMsg('Could not load. Have you run migration 0006?');
      setLoaded(true);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Apply filter + search + sort to the loaded list.
  const visible = useMemo(() => {
    let out = verses;

    if (kindFilter !== 'all') {
      out = out.filter((v) => v.kind === kindFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((v) => {
        const haystack = [
          v.verse_text,
          v.note || '',
          formatReference(v),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    if (sortMode === 'by-book') {
      out = [...out].sort((a, b) => {
        const ai = BOOK_ORDER[a.book] ?? 999;
        const bi = BOOK_ORDER[b.book] ?? 999;
        if (ai !== bi) return ai - bi;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;
        return a.verse_from - b.verse_from;
      });
    }
    // Chronological mode: already sorted newest-first by listTreasuryVerses.

    return out;
  }, [verses, kindFilter, search, sortMode]);

  return (
    <div className="treasury-page">
      <header className="tr-ribbon">
        <div className="left">
          <Link className="back" to="/">← hallway</Link>
          <div className="place">Treasury</div>
          <Link className="sister" to="/sanctuary" title="Open Sanctuary">↔ sanctuary</Link>
        </div>
        <div className="right">
          <button className="btn-quiet primary" onClick={() => setModal({ mode: 'add' })}>
            + Keep verse
          </button>
        </div>
      </header>

      <div className="tr-controls">
        <div className="tr-pillbar" role="radiogroup" aria-label="Filter by kind">
          {(['all', 'promise', 'standout'] as KindFilter[]).map((k) => (
            <button
              key={k}
              className={kindFilter === k ? 'active' : ''}
              onClick={() => setKindFilter(k)}
              aria-pressed={kindFilter === k}
            >
              {k === 'all' ? 'All' : k === 'promise' ? 'Promises' : 'Stand-outs'}
            </button>
          ))}
        </div>

        <div className="tr-sort">
          <label>
            Sort
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="chronological">Chronological</option>
              <option value="by-book">By book (Gen → Rev)</option>
            </select>
          </label>
        </div>

        <input
          className="tr-search"
          type="search"
          placeholder="Search verse text or note…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <main className="tr-main">
        {!loaded ? (
          <div className="tr-loading">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="tr-empty">
            {verses.length === 0 ? (
              <>
                <em>The Treasury is empty.</em>
                <span>Click <strong>+ Keep verse</strong> to keep your first one — a verse that stood out, or a promise from Scripture.</span>
              </>
            ) : (
              <em>No verses match the current filter.</em>
            )}
          </div>
        ) : sortMode === 'by-book' ? (
          <ByBookList
            verses={visible}
            onEdit={(v) => setModal({ mode: 'edit', verse: v })}
          />
        ) : (
          <ChronologicalList
            verses={visible}
            onEdit={(v) => setModal({ mode: 'edit', verse: v })}
          />
        )}
      </main>

      <footer className="tr-status">{statusMsg}</footer>

      {modal?.mode === 'add' && (
        <VerseModal
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await refresh(); }}
        />
      )}
      {modal?.mode === 'edit' && (
        <VerseModal
          initial={modal.verse}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await refresh(); }}
          onDelete={async () => {
            if (!confirm('Remove this verse from the Treasury?')) return;
            try {
              await deleteTreasuryVerse(modal.verse.id);
              setModal(null);
              await refresh();
            } catch (err) {
              console.error(err);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Chronological list (default) ─────────────────────────────────────

function ChronologicalList({
  verses, onEdit,
}: {
  verses: TreasuryVerse[];
  onEdit: (v: TreasuryVerse) => void;
}) {
  // Group by year for soft year dividers in the scroll.
  const byYear = useMemo(() => {
    const out: Array<{ year: number; verses: TreasuryVerse[] }> = [];
    let current: { year: number; verses: TreasuryVerse[] } | null = null;
    for (const v of verses) {
      const year = parseInt(v.marked_on.slice(0, 4), 10);
      if (!current || current.year !== year) {
        current = { year, verses: [] };
        out.push(current);
      }
      current.verses.push(v);
    }
    return out;
  }, [verses]);

  return (
    <div className="tr-list">
      {byYear.map((group) => (
        <section key={group.year} className="tr-year-group">
          <div className="tr-year-divider">
            <span className="tr-year">{group.year}</span>
            <span className="tr-year-count">
              {group.verses.length} verse{group.verses.length === 1 ? '' : 's'}
            </span>
          </div>
          {group.verses.map((v) => <VerseCard key={v.id} verse={v} onEdit={onEdit} />)}
        </section>
      ))}
    </div>
  );
}

// ── By-book list ─────────────────────────────────────────────────────

function ByBookList({
  verses, onEdit,
}: {
  verses: TreasuryVerse[];
  onEdit: (v: TreasuryVerse) => void;
}) {
  const byBook = useMemo(() => {
    const out: Array<{ book: string; verses: TreasuryVerse[] }> = [];
    let current: { book: string; verses: TreasuryVerse[] } | null = null;
    for (const v of verses) {
      if (!current || current.book !== v.book) {
        current = { book: v.book, verses: [] };
        out.push(current);
      }
      current.verses.push(v);
    }
    return out;
  }, [verses]);

  return (
    <div className="tr-list">
      {byBook.map((group) => (
        <section key={group.book} className="tr-year-group">
          <div className="tr-year-divider">
            <span className="tr-year">{group.book}</span>
            <span className="tr-year-count">
              {group.verses.length} verse{group.verses.length === 1 ? '' : 's'}
            </span>
          </div>
          {group.verses.map((v) => <VerseCard key={v.id} verse={v} onEdit={onEdit} />)}
        </section>
      ))}
    </div>
  );
}

// ── Verse card ───────────────────────────────────────────────────────

function VerseCard({
  verse, onEdit,
}: {
  verse: TreasuryVerse;
  onEdit: (v: TreasuryVerse) => void;
}) {
  return (
    <article
      className={`verse-card ${verse.kind}`}
      onDoubleClick={() => onEdit(verse)}
      title="Double-click to edit"
    >
      <header className="vc-head">
        <span className="vc-date">{verse.marked_on}</span>
        <span className="vc-ref">{formatReference(verse)}</span>
        <span className="vc-translation">{verse.translation}</span>
        {verse.kind === 'promise' && <span className="vc-kind-tag promise">promise</span>}
        <button className="vc-edit" onClick={() => onEdit(verse)} aria-label="Edit">edit</button>
      </header>
      <p className="vc-text">{verse.verse_text}</p>
      {verse.note && <p className="vc-note">{verse.note}</p>}
    </article>
  );
}

// ── + Keep verse / Edit modal ────────────────────────────────────────

function VerseModal({
  initial, onClose, onSaved, onDelete,
}: {
  initial?: TreasuryVerse;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const isEdit = !!initial;

  const [date, setDate] = useState(initial?.marked_on ?? localToday());
  const [reference, setReference] = useState(initial ? formatReference(initial) : '');
  const [translation, setTranslation] = useState<Translation>(
    (initial?.translation as Translation) ?? 'esv',
  );
  const [kind, setKind] = useState<TreasuryKind>(initial?.kind ?? 'standout');
  const [verseText, setVerseText] = useState(initial?.verse_text ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onFetchVerse() {
    if (fetching) return;
    const ref = reference.trim();
    if (!ref) { setErr('Enter a reference first (e.g. "John 3:16").'); return; }
    const parsed = parseBibleRef(ref);
    if (!parsed) { setErr(`Could not parse "${ref}".`); return; }
    setFetching(true); setErr(null);
    try {
      const result = await fetchScripture(ref, translation);
      const text = result.verses
        .map((v) => v.text.trim())
        .filter(Boolean)
        .join(' ');
      if (!text) {
        setErr('Got an empty response — try a different reference?');
      } else {
        setVerseText(text);
      }
    } catch (e: any) {
      setErr(e?.message || 'Scripture lookup failed.');
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setErr(null);

    const refTrim = reference.trim();
    const parsed = parseBibleRef(refTrim);
    if (!parsed) { setErr(`Could not parse "${refTrim}". Try "John 3:16" or "John 3:16-17".`); return; }
    if (!verseText.trim()) { setErr('Verse text is empty — fetch or paste it before saving.'); return; }

    setSaving(true);
    const payload = {
      marked_on: date,
      book: parsed.book,
      chapter: parsed.chapter,
      verse_from: parsed.verseFrom ?? 1,
      verse_to: parsed.verseTo ?? null,
      verse_text: verseText.trim(),
      translation: translation.toUpperCase(),
      kind,
      note: note.trim() || null,
    };
    try {
      if (isEdit && initial) {
        await updateTreasuryVerse(initial.id, payload);
      } else {
        await createTreasuryVerse(payload);
      }
      onSaved();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <div className="tr-modal-bg" onClick={onClose}>
      <div className="tr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tr-modal-head">
          <h2>{isEdit ? 'Edit verse' : '+ Keep verse'}</h2>
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="tr-form" onSubmit={onSubmit}>
          <div className="row">
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Translation
              <select value={translation} onChange={(e) => setTranslation(e.target.value as Translation)}>
                {TRANSLATIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Reference
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder='e.g. "John 3:16" or "Romans 8:38-39"'
              required
              autoFocus={!isEdit}
            />
          </label>

          <fieldset className="tr-kind">
            <legend>Type</legend>
            <label className="tr-kind-option">
              <input
                type="radio"
                name="kind"
                value="standout"
                checked={kind === 'standout'}
                onChange={() => setKind('standout')}
              />
              <span>Stand-out</span>
              <em className="hint">a verse that arrested you</em>
            </label>
            <label className="tr-kind-option promise">
              <input
                type="radio"
                name="kind"
                value="promise"
                checked={kind === 'promise'}
                onChange={() => setKind('promise')}
              />
              <span>Promise</span>
              <em className="hint">held in faint yellow</em>
            </label>
          </fieldset>

          <label>
            Verse text
            <div className="tr-text-row">
              <textarea
                value={verseText}
                onChange={(e) => setVerseText(e.target.value)}
                rows={4}
                placeholder="The verse, in your chosen translation. Click 'Fetch' to populate from the reference."
              />
              <button
                type="button"
                className="btn-quiet"
                onClick={onFetchVerse}
                disabled={fetching}
                title="Look up the verse text from the chosen translation"
              >
                {fetching ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
          </label>

          <label>
            Note (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Why it landed, what context, anything you want to remember about it."
            />
          </label>

          {err && <div className="tr-form-err">{err}</div>}

          <div className="tr-modal-actions">
            {isEdit && onDelete && (
              <button type="button" className="danger" onClick={onDelete} disabled={saving}>
                Delete
              </button>
            )}
            <div className="spacer" />
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Keep')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
