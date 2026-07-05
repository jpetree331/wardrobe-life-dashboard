// Pure link-metadata helpers shared by the /api/link-meta edge function
// and the Notes client: OpenGraph/Twitter/title parsing (regex-based — the
// edge runtime has no DOM), URL classification, embed whitelisting, and
// the SSRF host guard. No Supabase/DOM imports; fully unit-tested.

export type LinkMeta = {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
};

// ── HTML parsing ────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Find a <meta> content value where property= or name= equals `key`,
 * tolerating either attribute order and either quote style.
 */
function metaContent(html: string, key: string): string | undefined {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // property/name first, then content
  let m = html.match(
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
  );
  if (!m) {
    // content first, then property/name
    m = html.match(
      new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${k}["']`, 'i'),
    );
  }
  const v = m?.[1]?.trim();
  return v ? decodeEntities(v) : undefined;
}

function resolveMaybe(href: string | undefined, baseUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/** Parse OpenGraph / Twitter-card / <title> metadata out of an HTML page. */
export function parseLinkMetadata(html: string, baseUrl: string): LinkMeta {
  const title =
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title') ??
    (() => {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const t = m?.[1]?.replace(/\s+/g, ' ').trim();
      return t ? decodeEntities(t) : undefined;
    })();

  const description =
    metaContent(html, 'og:description') ??
    metaContent(html, 'description') ??
    metaContent(html, 'twitter:description');

  const image = resolveMaybe(
    metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'),
    baseUrl,
  );

  // <link rel="icon" …> in any attribute order; fallback /favicon.ico.
  let favicon: string | undefined;
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    const rel = tag.match(/rel\s*=\s*["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? '';
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
    favicon = resolveMaybe(href, baseUrl);
    if (favicon) break;
  }
  if (!favicon) {
    try {
      favicon = new URL('/favicon.ico', baseUrl).toString();
    } catch { /* unparseable base */ }
  }

  const siteName = metaContent(html, 'og:site_name');

  const truncate = (s: string | undefined, n: number) =>
    s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

  return {
    title: truncate(title, 300),
    description: truncate(description, 500),
    image,
    favicon,
    siteName: truncate(siteName, 120),
  };
}

// ── URL classification ──────────────────────────────────────────────────

/** Is this pasted text a single bare http(s) URL (and nothing else)? */
export function isProbablyUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

/** Display domain for a URL: hostname without the www. prefix. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * SSRF guard for the metadata proxy: refuse obviously-internal targets.
 * (Coarse by design — hostname-literal checks only; the proxy is also
 * auth-gated and read-only.)
 */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '0.0.0.0' || h === '::') return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
  }
  if (/^(fe80|fc|fd)/i.test(h.replace(/:/g, '').slice(0, 4)) && h.includes(':')) return true;
  return false;
}

// ── Embed whitelist (YouTube + Vimeo only, deliberately) ───────────────

/** Player-embed URL for whitelisted video hosts; null for everything else. */
export function embedUrlFor(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (u.pathname === '/watch' && v) return `https://www.youtube-nocookie.com/embed/${v}`;
    const shorts = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
    if (shorts) return `https://www.youtube-nocookie.com/embed/${shorts[1]}`;
    const embed = u.pathname.match(/^\/embed\/([\w-]{6,})/);
    if (embed) return `https://www.youtube-nocookie.com/embed/${embed[1]}`;
    return null;
  }
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).match(/^[\w-]{6,}/)?.[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.match(/^\/(\d{6,})/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}
