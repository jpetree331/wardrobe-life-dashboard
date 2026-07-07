// Treasury — the room for verses kept from Scripture reading.
//
// Two kinds: 'promise' (a verse held as a promise from God, highlighted
// faint yellow) and 'standout' (a verse that arrested attention in
// reading, unhighlighted but present). Chronological default, sort-by-
// book option, type filter, search.
//
// Schema: app/supabase/migrations/0006_treasury.sql
// CRUD: src/lib/treasury.ts

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deleteTreasuryVerse,
  formatReference,
  listTreasuryVerses,
  type TreasuryVerse,
} from '../lib/treasury';
import { BIBLE_BOOKS } from '../lib/bibleVerseCounts';
import { TreasuryVerseModal } from '../components/TreasuryVerseModal';
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

  // Verse text size (px) — the −/+ control in the toolbar. Generous upper
  // bound so the list reads clearly on a stream/projector (OBS); persisted.
  const [zoom, setZoom] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(window.localStorage.getItem('tr-verse-zoom')) : NaN;
    return Number.isFinite(saved) && saved >= 12 && saved <= 44 ? saved : 16;
  });
  useEffect(() => {
    window.localStorage.setItem('tr-verse-zoom', String(zoom));
  }, [zoom]);

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
    <div
      className="treasury-page"
      style={{ ['--tr-verse-size' as never]: `${zoom}px` }}
    >
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

        <div className="tr-zoom" role="group" aria-label="Verse text size" title="Verse text size — enlarge for display, shrink for yourself">
          <button
            onClick={() => setZoom((z) => Math.max(12, z - 1))}
            disabled={zoom <= 12}
            aria-label="Smaller verse text"
          >
            −
          </button>
          <span className="tr-zoom-val">{zoom}</span>
          <button
            onClick={() => setZoom((z) => Math.min(44, z + 1))}
            disabled={zoom >= 44}
            aria-label="Larger verse text"
          >
            +
          </button>
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
        <TreasuryVerseModal
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await refresh(); }}
        />
      )}
      {modal?.mode === 'edit' && (
        <TreasuryVerseModal
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
        {verse.source_entry_id && (
          <Link
            className="vc-source"
            to={`/sanctuary?id=${verse.source_entry_id}`}
            title="Open the Sanctuary entry this was kept from"
            onClick={(e) => e.stopPropagation()}
          >
            from Sanctuary
          </Link>
        )}
        <button className="vc-edit" onClick={() => onEdit(verse)} aria-label="Edit">edit</button>
      </header>
      <p className="vc-text">{verse.verse_text}</p>
      {verse.note && <p className="vc-note">{verse.note}</p>}
    </article>
  );
}

