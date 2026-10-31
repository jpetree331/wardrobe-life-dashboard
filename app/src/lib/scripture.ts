// Scripture lookup. Public-domain translations come straight from
// bible-api.com. Licensed translations (ESV) route through our Vercel
// edge function so the API token stays server-side.

import { splitForLookup } from './bibleRef';

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

// bible-api.com allows 15 requests per 30 seconds, and each chapter is one
// request, so a long passage has to stop short of that.
const MAX_PUBLIC_LOOKUPS = 12;

async function fetchPublic(reference: string, translation: Translation): Promise<ScriptureResult> {
  const lookups = splitForLookup(reference);
  if (lookups.length > MAX_PUBLIC_LOOKUPS) {
    throw new Error(
      `"${reference}" is ${lookups.length} chapters. The public-domain Bible service can open ${MAX_PUBLIC_LOOKUPS} at a time.`,
    );
  }
  const parts = await Promise.all(
    (lookups.length > 0 ? lookups : [reference]).map((lookup) => fetchOneLookup(lookup, translation)),
  );
  const [first] = parts;
  return {
    reference: parts.length === 1 ? first.reference || reference : reference,
    translation,
    translationName: first.translation_name || translation.toUpperCase(),
    verses: parts.flatMap((part) =>
      (part.verses || []).map((v: any) => ({
        book: v.book_name,
        chapter: v.chapter,
        verse: v.verse,
        text: String(v.text || '').trim(),
      })),
    ),
    source: 'bible-api.com · unmodified public-domain text',
  };
}

async function fetchOneLookup(lookup: string, translation: Translation) {
  const url = `https://bible-api.com/${encodeURIComponent(lookup)}?translation=${translation}`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error(
      `bible-api.com lookup failed: "${lookup}" isn't in ${translation.toUpperCase()}. Check the reference or try another translation.`,
    );
  }
  if (res.status === 429) {
    throw new Error('bible-api.com lookup failed: too many requests. Wait 30 seconds and try again.');
  }
  if (!res.ok) throw new Error(`bible-api.com lookup failed (${res.status})`);
  return res.json();
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
