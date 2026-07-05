// Export logic for boards (Sprint 19): content bounding box for the PNG
// pipeline, filename hygiene, and the HTML→Markdown structural digest.
// Uses DOMParser (available in the browser and in the jsdom test env) but
// no Supabase — unit-testable.

import type { Card } from './notes';

// ── Geometry / names ────────────────────────────────────────────────────

export type BBox = { x: number; y: number; w: number; h: number };

export function contentBBox(
  rects: Array<{ x: number; y: number; w?: number | null; h?: number | null }>,
  pad = 60,
): BBox | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    const w = r.w ?? 200;
    const h = r.h ?? 100;
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + w > maxX) maxX = r.x + w;
    if (r.y + h > maxY) maxY = r.y + h;
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'board';
}

// ── HTML → Markdown ─────────────────────────────────────────────────────

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const inner = () => [...el.childNodes].map(inlineMd).join('');
  switch (el.tagName.toLowerCase()) {
    case 'strong':
    case 'b':      return `**${inner()}**`;
    case 'em':
    case 'i':      return `*${inner()}*`;
    case 's':
    case 'strike':
    case 'del':    return `~~${inner()}~~`;
    case 'code':   return `\`${inner()}\``;
    case 'mark':   return `==${inner()}==`;
    case 'a': {
      const href = el.getAttribute('href');
      return href ? `[${inner()}](${href})` : inner();
    }
    case 'br':     return '\n';
    default:       return inner();
  }
}

function blockMd(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const inner = () => [...el.childNodes].map(inlineMd).join('').trim();
  switch (tag) {
    case 'h1': return `# ${inner()}\n\n`;
    case 'h2': return `## ${inner()}\n\n`;
    case 'h3': return `### ${inner()}\n\n`;
    case 'p':  return inner() ? `${inner()}\n\n` : '';
    case 'blockquote':
      return [...el.children].map(blockMd).join('').trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'pre':
      return '```\n' + (el.textContent ?? '').replace(/\n$/, '') + '\n```\n\n';
    case 'ul':
    case 'ol': {
      const isTask = el.getAttribute('data-type') === 'taskList';
      const lines = [...el.children]
        .filter((li) => li.tagName.toLowerCase() === 'li')
        .map((li, i) => {
          const text = [...li.childNodes].map(inlineMd).join('').replace(/\s+/g, ' ').trim();
          if (isTask || li.getAttribute('data-type') === 'taskItem') {
            const checked = li.getAttribute('data-checked') === 'true';
            return `- [${checked ? 'x' : ' '}] ${text}`;
          }
          return tag === 'ol' ? `${i + 1}. ${text}` : `- ${text}`;
        });
      return lines.join('\n') + '\n\n';
    }
    default:
      return inner() ? `${inner()}\n\n` : '';
  }
}

/** Convert stored card HTML to a readable Markdown fragment. */
export function htmlToMarkdown(html: string): string {
  if (!html?.trim()) return '';
  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__root');
  if (!root) return '';
  let out = '';
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) out += blockMd(node as Element);
    else if (node.textContent?.trim()) out += `${node.textContent.trim()}\n\n`;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Board digest ────────────────────────────────────────────────────────

function cardToMarkdown(c: Card): string {
  const p = c.payload as Record<string, any>;
  switch (c.type) {
    case 'note':     return htmlToMarkdown(p.body ?? '');
    case 'heading':  return p.body ? `### ${p.body}` : '';
    case 'document': {
      const body = htmlToMarkdown(p.body ?? '');
      return [`### ${p.title || 'Untitled document'}`, body].filter(Boolean).join('\n\n');
    }
    case 'todo': {
      const items = ((p.items ?? []) as Array<{ text: string; done: boolean }>)
        .map((it) => `- [${it.done ? 'x' : ' '}] ${it.text}`);
      return [p.title && p.title !== 'To-do' ? `### ${p.title}` : '', ...items].filter(Boolean).join('\n');
    }
    case 'link':     return `[${p.title || p.url || 'link'}](${p.url ?? ''})`;
    case 'image': {
      const file = typeof p.storagePath === 'string' ? p.storagePath.split('/').pop() : 'image';
      return `![${p.caption ?? ''}](${file})`;
    }
    case 'file':     return `📎 ${p.filename ?? 'file'}`;
    case 'swatch':   return `- \`${p.hex ?? ''}\`${p.label ? ` — ${p.label}` : ''}`;
    case 'comment':  return p.body ? `> 💬 ${p.body}` : '';
    case 'board':    return `📁 ${p.name ?? 'board'}`;
    default:         return '';
  }
}

/**
 * Structural Markdown digest of a board: title, columns as ## sections
 * with their members nested (in order), then the remaining free cards in
 * reading order (top-left → bottom-right).
 */
export function boardToMarkdown(
  boardName: string,
  freeCards: Card[],
  membersOf: (columnId: string) => Card[],
): string {
  const parts: string[] = [`# ${boardName}`];
  const reading = (a: Card, b: Card) => a.y - b.y || a.x - b.x;
  const columns = freeCards.filter((c) => c.type === 'column').sort(reading);
  const loose = freeCards.filter((c) => c.type !== 'column').sort(reading);
  for (const col of columns) {
    const title = ((col.payload as Record<string, any>).title as string) || 'Column';
    parts.push(`## ${title}`);
    for (const m of membersOf(col.id)) {
      const md = cardToMarkdown(m);
      if (md) parts.push(md);
    }
  }
  if (loose.length > 0) {
    if (columns.length > 0) parts.push('## Cards');
    for (const c of loose) {
      const md = cardToMarkdown(c);
      if (md) parts.push(md);
    }
  }
  return parts.join('\n\n') + '\n';
}
