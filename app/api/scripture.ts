// Vercel Edge Function — proxy to api.esv.org.
// The ESV token never touches the browser. Set ESV_API_TOKEN in
// Vercel → Settings → Environment Variables (and locally in app/.env.local).
//
// Public-domain translations don't need this proxy — the client calls
// bible-api.com directly. This route only handles ESV (and any future
// licensed translation).

import { parseEsvPassage } from '../src/lib/esvParse';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }

  const token = process.env.ESV_API_TOKEN;
  if (!token) {
    return json({ error: 'ESV_API_TOKEN not configured on the server' }, 503);
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get('ref');
  const translation = url.searchParams.get('translation') || 'esv';
  if (!ref) {
    return json({ error: 'missing query param: ref' }, 400);
  }
  if (translation !== 'esv') {
    return json({ error: `translation ${translation} not handled by this route` }, 400);
  }

  // ESV passage-text endpoint. Returns plain text we can parse into verses.
  // Docs: https://api.esv.org/docs/passage-text/
  const params = new URLSearchParams({
    q: ref,
    'include-headings': 'false',
    'include-footnotes': 'false',
    'include-verse-numbers': 'true',
    'include-short-copyright': 'false',
    'include-passage-references': 'false',
    'include-first-verse-numbers': 'true',
    'indent-poetry': 'false',
    'indent-paragraphs': '0',
  });
  const esvRes = await fetch(`https://api.esv.org/v3/passage/text/?${params}`, {
    headers: { Authorization: `Token ${token}` },
  });

  if (!esvRes.ok) {
    const detail = await esvRes.text().catch(() => '');
    return json({ error: 'ESV API error', status: esvRes.status, detail }, 502);
  }

  const data = await esvRes.json();
  const reference = (data.canonical as string) || ref;
  const passages: string[] = data.passages || [];
  const passage = passages[0] || '';
  const verses = parseEsvPassage(passage, reference);

  return json(
    {
      reference,
      translation: 'esv',
      verses,
      source: 'api.esv.org · ESV® Bible (Crossway)',
    },
    200,
    {
      // ESV permits client caching; verses don't change.
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  );
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
