// Vercel Edge Function — authenticated link-metadata fetcher for the Notes
// room's rich link cards. Fetches the target URL server-side (browsers
// can't — CORS) and parses OpenGraph/Twitter/<title> tags.
//
// Auth-required (Supabase JWT in the Authorization header) so this is not
// an open proxy. Targets are limited to public http(s) hosts (see
// isBlockedHost), responses are size-capped, and failures return partial
// metadata rather than errors — a dead link degrades to a plain card.

import { isBlockedHost, parseLinkMetadata } from '../src/lib/notesLinkMeta';

export const config = { runtime: 'edge' };

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 400_000;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return json({ error: 'method not allowed' }, 405);
  }

  // ── Verify the caller's Supabase JWT ──────────────────────────────────
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'supabase env not configured on the server' }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: auth },
  });
  if (!userRes.ok) {
    return json({ error: 'unauthorized' }, 401);
  }

  // ── Validate the target ────────────────────────────────────────────────
  const raw = new URL(req.url).searchParams.get('url');
  if (!raw) return json({ error: 'missing query param: url' }, 400);
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return json({ error: 'only http(s) urls are supported' }, 400);
  }
  if (isBlockedHost(target.hostname)) {
    return json({ error: 'host not allowed' }, 400);
  }

  // ── Fetch + parse (partials on any failure) ────────────────────────────
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; WardrobeNotes/1.0; +link-preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    const finalUrl = res.url || target.toString();
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('html')) {
      // Non-HTML (or error) target: return just the favicon guess.
      return json(parseLinkMetadata('', finalUrl), 200, cacheHeaders());
    }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return json(parseLinkMetadata(html, finalUrl), 200, cacheHeaders());
  } catch {
    // Timeout / network failure → empty partials, still 200.
    return json(parseLinkMetadata('', target.toString()), 200, cacheHeaders());
  }
}

function cacheHeaders(): Record<string, string> {
  return { 'cache-control': 'private, max-age=3600' };
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
