import { describe, it, expect } from 'vitest';
import {
  domainOf,
  embedUrlFor,
  isBlockedHost,
  isProbablyUrl,
  parseLinkMetadata,
} from '../src/lib/notesLinkMeta';

describe('parseLinkMetadata', () => {
  const base = 'https://example.com/articles/1';

  it('prefers OpenGraph, decodes entities, resolves relative urls', () => {
    const html = `
      <html><head>
        <title>Fallback &amp; Title</title>
        <meta property="og:title" content="OG &quot;Title&quot;" />
        <meta property="og:description" content="A story about &#39;things&#39;." />
        <meta property="og:image" content="/img/cover.jpg" />
        <meta property="og:site_name" content="Example News" />
        <link rel="icon" href="/icons/fav.png" />
      </head></html>`;
    const meta = parseLinkMetadata(html, base);
    expect(meta.title).toBe('OG "Title"');
    expect(meta.description).toBe("A story about 'things'.");
    expect(meta.image).toBe('https://example.com/img/cover.jpg');
    expect(meta.favicon).toBe('https://example.com/icons/fav.png');
    expect(meta.siteName).toBe('Example News');
  });

  it('falls back to <title> and default favicon', () => {
    const meta = parseLinkMetadata('<title>Just a Page</title>', base);
    expect(meta.title).toBe('Just a Page');
    expect(meta.favicon).toBe('https://example.com/favicon.ico');
    expect(meta.image).toBeUndefined();
  });

  it('tolerates reversed attribute order and single quotes', () => {
    const html = `<meta content='Reversed' property='og:title'>`;
    expect(parseLinkMetadata(html, base).title).toBe('Reversed');
  });

  it('returns favicon-only partials for empty html', () => {
    const meta = parseLinkMetadata('', base);
    expect(meta.title).toBeUndefined();
    expect(meta.favicon).toBe('https://example.com/favicon.ico');
  });
});

describe('isProbablyUrl', () => {
  it('accepts single bare http(s) urls', () => {
    expect(isProbablyUrl('https://example.com/a?b=c')).toBe(true);
    expect(isProbablyUrl('  http://x.dev  ')).toBe(true);
  });
  it('rejects prose, multi-line text, and other schemes', () => {
    expect(isProbablyUrl('see https://example.com')).toBe(false);
    expect(isProbablyUrl('https://a.com\nhttps://b.com')).toBe(false);
    expect(isProbablyUrl('ftp://example.com')).toBe(false);
    expect(isProbablyUrl('example.com')).toBe(false);
    expect(isProbablyUrl('')).toBe(false);
  });
});

describe('domainOf', () => {
  it('strips www and returns the hostname', () => {
    expect(domainOf('https://www.github.com/user/repo')).toBe('github.com');
    expect(domainOf('not a url')).toBe('');
  });
});

describe('isBlockedHost', () => {
  it('blocks internal targets', () => {
    for (const h of ['localhost', 'foo.localhost', '127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.0.9', '169.254.169.254', '0.0.0.0', '::1', 'router.local']) {
      expect(isBlockedHost(h), h).toBe(true);
    }
  });
  it('allows public hosts', () => {
    for (const h of ['example.com', 'github.com', '8.8.8.8', '172.15.0.1', '172.32.0.1']) {
      expect(isBlockedHost(h), h).toBe(false);
    }
  });
});

describe('embedUrlFor', () => {
  it('whitelists YouTube variants', () => {
    expect(embedUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedUrlFor('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(embedUrlFor('https://www.youtube.com/shorts/abc123xyz')).toBe('https://www.youtube-nocookie.com/embed/abc123xyz');
  });
  it('whitelists Vimeo ids', () => {
    expect(embedUrlFor('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
  });
  it('rejects everything else (no general embed system)', () => {
    expect(embedUrlFor('https://example.com/watch?v=abc')).toBeNull();
    expect(embedUrlFor('https://dailymotion.com/video/x1')).toBeNull();
    expect(embedUrlFor('https://vimeo.com/about')).toBeNull();
    expect(embedUrlFor('nonsense')).toBeNull();
  });
});
