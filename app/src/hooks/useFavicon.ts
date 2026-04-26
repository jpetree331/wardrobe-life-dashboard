import { useEffect } from 'react';

/**
 * Swap the page's favicon (and optionally the document title) when a route
 * mounts. Each room sets its own icon so the browser-tab decoration tells
 * you which room you're in even when several Wardrobe tabs are open at
 * once. Restores the default on the way out so a no-route page (e.g. an
 * intermediate redirect) doesn't keep a stale icon.
 *
 * Pass a path that resolves under `/icons/...` — these are static assets
 * served directly from `app/public/`.
 */
const DEFAULT_FAVICON = '/icons/wardrobe1.png';
const DEFAULT_TITLE = 'Wardrobe';

export function useFavicon(href: string, title?: string) {
  useEffect(() => {
    const link = ensureIconLink();
    const prevHref = link.href;
    const prevTitle = document.title;

    link.href = href;
    if (title) document.title = title;

    return () => {
      // On unmount, restore — guards against an edge-case where a
      // component unmounts without another room mounting (e.g. logout
      // flow). The next room's mount will set its own icon and title
      // before the user notices this restoration.
      link.href = prevHref || DEFAULT_FAVICON;
      document.title = prevTitle || DEFAULT_TITLE;
    };
  }, [href, title]);
}

function ensureIconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (link) return link;
  link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  document.head.appendChild(link);
  return link;
}
