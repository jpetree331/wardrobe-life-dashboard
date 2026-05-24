// TreasuryVerseModal — the + Keep verse / edit modal, extracted so both
// the Treasury room and Sanctuary's ✦ keep button can use the same UI.
//
// Three modes:
//   - new (no `initial`, no `prefill`):  blank form, default ESV, today's date
//   - prefilled (no `initial`, with `prefill`):  blank kind, but date/ref/
//       translation/source_entry_id pre-populated. Use `autoFetch` to
//       trigger an immediate verse-text fetch on mount.
//   - edit (`initial` set):  populated from the existing TreasuryVerse,
//       Delete button shown.
//
// Imports its own CSS so any consumer (Treasury, Sanctuary, future) gets
// styled correctly without needing to import a room's stylesheet.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createTreasuryVerse,
  formatReference,
  updateTreasuryVerse,
  type TreasuryKind,
  type TreasuryVerse,
} from '../lib/treasury';
import { parseBibleRef } from '../lib/bibleRef';
import {
  fetchScripture,
  TRANSLATIONS,
  type Translation,
} from '../lib/scripture';
import { localToday } from '../lib/dates';
import './TreasuryVerseModal.css';

export type TreasuryVerseModalPrefill = {
  marked_on?: string;
  reference?: string;
  translation?: Translation;
  source_entry_id?: string;
  kind?: TreasuryKind;
};

export function TreasuryVerseModal({
  initial,
  prefill,
  autoFetch = false,
  onClose,
  onSaved,
  onDelete,
}: {
  initial?: TreasuryVerse;
  prefill?: TreasuryVerseModalPrefill;
  /** If true and a reference is pre-filled, fetch the verse text on mount. */
  autoFetch?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const isEdit = !!initial;

  const [date, setDate] = useState(
    initial?.marked_on ?? prefill?.marked_on ?? localToday(),
  );
  const [reference, setReference] = useState(
    initial ? formatReference(initial) : (prefill?.reference ?? ''),
  );
  const [translation, setTranslation] = useState<Translation>(
    (initial?.translation as Translation)
      ?? prefill?.translation
      ?? 'esv',
  );
  const [kind, setKind] = useState<TreasuryKind>(
    initial?.kind ?? prefill?.kind ?? 'standout',
  );
  const [verseText, setVerseText] = useState(initial?.verse_text ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sourceEntryId =
    initial?.source_entry_id ?? prefill?.source_entry_id ?? null;

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Auto-fetch the verse text on mount if requested AND a reference is
  // pre-filled AND we don't already have verse_text (i.e. not in edit
  // mode where the user's previously-saved text wins).
  const didAutoFetch = useRef(false);
  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!autoFetch) return;
    if (!reference.trim()) return;
    if (verseText.trim()) return;
    didAutoFetch.current = true;
    void onFetchVerse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFetchVerse() {
    if (fetching) return;
    const ref = reference.trim();
    if (!ref) {
      setErr('Enter a reference first (e.g. "John 3:16").');
      return;
    }
    const parsed = parseBibleRef(ref);
    if (!parsed) {
      setErr(`Could not parse "${ref}".`);
      return;
    }
    setFetching(true);
    setErr(null);
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Scripture lookup failed.');
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
    if (!parsed) {
      setErr(`Could not parse "${refTrim}". Try "John 3:16" or "John 3:16-17".`);
      return;
    }
    if (!verseText.trim()) {
      setErr('Verse text is empty — fetch or paste it before saving.');
      return;
    }

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
        await createTreasuryVerse({ ...payload, source_entry_id: sourceEntryId });
      }
      onSaved();
    } catch (e: unknown) {
      console.error(e);
      setErr(e instanceof Error ? e.message : 'Could not save.');
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
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Translation
              <select
                value={translation}
                onChange={(e) => setTranslation(e.target.value as Translation)}
              >
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
              autoFocus={!isEdit && !prefill?.reference}
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
                placeholder={
                  fetching
                    ? 'Fetching…'
                    : "The verse, in your chosen translation. Click 'Fetch' to populate from the reference."
                }
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
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Keep'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
