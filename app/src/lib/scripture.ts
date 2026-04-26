// Scripture lookup. Public-domain translations come straight from
// bible-api.com. Licensed translations (ESV) route through our Vercel
// edge function so the API token stays server-side.

export type Translation =
  | 'kjv' | 'web' | 'asv' | 'bbe' | 'darby' | 'ylt'
  | 'esv';

export const TRANSLATIONS: Array<{
  value: Translation;
  label: string;
  tier: 'public' | 'licensed';
}> = [
  { value: 'kjv',   label: 'KJV (public domain)',         tier: 'public' },
  { value: 'web',   label: 'WEB (public domain)',         tier: 'public' },
  { value: 'asv',   label: 'ASV (public domain)',         tier: 'public' },
  { value: 'bbe',   label: 'BBE (public domain)',         tier: 'public' },
  { value: 'darby', label: 'Darby (public domain)',       tier: 'public' },
  { value: 'ylt',   label: "Young's Literal (public domain)", tier: 'public' },
  { value: 'esv',   label: 'ESV (licensed)',              tier: 'licensed' },
];

export type Verse = { book: string; chapter: number; verse: number; text: string };

export type ScriptureResult = {
  reference: string;
  translation: Translation;
  translationName: string;
  verses: Verse[];
  source: string;
};

export async function fetchScripture(
  reference: string,
  translation: Translation,
): Promise<ScriptureResult> {
  if (translation === 'esv') return fetchEsv(reference);
  return fetchPublic(reference, translation);
}

async function fetchPublic(reference: string, translation: Translation): Promise<ScriptureResult> {
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=${translation}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible-api.com lookup failed (${res.status})`);
  const data = await res.json();
  return {
    reference: data.reference || reference,
    translation,
    translationName: data.translation_name || translation.toUpperCase(),
    verses: (data.verses || []).map((v: any) => ({
      book: v.book_name,
      chapter: v.chapter,
      verse: v.verse,
      text: String(v.text || '').trim(),
    })),
    source: 'bible-api.com · unmodified public-domain text',
  };
}

async function fetchEsv(reference: string): Promise<ScriptureResult> {
  const res = await fetch(`/api/scripture?ref=${encodeURIComponent(reference)}&translation=esv`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `ESV lookup failed (${res.status})`);
  }
  const data = await res.json();
  return {
    reference: data.reference,
    translation: 'esv',
    translationName: 'ESV',
    verses: data.verses || [],
    source: data.source || 'api.esv.org · ESV® Bible',
  };
}
