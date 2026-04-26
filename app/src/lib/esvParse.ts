// Parse the ESV API's plain-text passage response into discrete verses.
// The ESV API returns text shaped like "  [13] Verse text. [14] Next verse…"
// and we don't get book/chapter per verse; we fan them out from the
// canonical reference (e.g. "Luke 24:13–35").
//
// Lives outside `api/` so the Edge function and the unit tests both import it.

export type ParsedVerse = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export function parseEsvPassage(text: string, reference: string): ParsedVerse[] {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  const refMatch = reference.match(/^(.+?)\s+(\d+):/);
  const book = refMatch ? refMatch[1].trim() : '';
  const chapter = refMatch ? Number(refMatch[2]) : 0;

  const parts = cleaned.split(/\[(\d+)\]\s*/);
  const out: ParsedVerse[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const verse = Number(parts[i]);
    const t = (parts[i + 1] || '').trim();
    if (!t) continue;
    out.push({ book, chapter, verse, text: t });
  }
  if (out.length === 0 && cleaned) {
    out.push({ book, chapter, verse: 0, text: cleaned });
  }
  return out;
}
