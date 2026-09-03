// AI-attribution splitting — PURE. The Sanctuary editor marks pasted AI
// text with <span class="sa-ai-text"> in the journal body, and the AI
// dialogue pane marks the user's own interjections with
// <span class="sa-my-text"> (the pane's default polarity is AI). These
// helpers split an HTML string into the marked and unmarked halves so
// the Writing stats can attribute words honestly: yours counted as
// yours, AI counted as AI, nothing dropped from the ledger.
//
// Regex-tokenizer based (same rationale as stripHtmlToText): the editor
// emits a narrow, self-produced subset of HTML, not arbitrary input.

/** Class the journal-body editor puts on AI-marked spans. */
export const AI_MARK_CLASS = 'sa-ai-text';
/** Class the AI-pane editor puts on "my words" spans. */
export const MY_MARK_CLASS = 'sa-my-text';

/**
 * Split `html` into the part inside spans carrying `markerClass` and the
 * part outside them. Nested spans (e.g. a highlight inside a marked run)
 * are tracked by depth so the region closes at the right </span>. The
 * boundary span tags themselves are dropped; all other tags travel with
 * their text so downstream stripping still sees block boundaries.
 */
export function splitByMarkedSpans(
  html: string,
  markerClass: string,
): { marked: string; rest: string } {
  if (!html) return { marked: '', rest: '' };
  const tokens = html.split(/(<[^>]+>)/g);
  let marked = '';
  let rest = '';
  let depth = 0; // 0 = outside a marked region
  for (const tok of tokens) {
    if (!tok) continue;
    const isTag = tok.startsWith('<');
    if (isTag) {
      const isOpenSpan = /^<span[\s>]/i.test(tok);
      const isCloseSpan = /^<\/span\s*>$/i.test(tok);
      if (depth === 0) {
        if (isOpenSpan && tok.includes(markerClass)) {
          depth = 1; // boundary tag: dropped
        } else {
          rest += tok;
        }
      } else {
        if (isOpenSpan) {
          depth += 1;
          marked += tok;
        } else if (isCloseSpan) {
          depth -= 1;
          if (depth > 0) marked += tok; // inner close travels; boundary dropped
        } else {
          marked += tok;
        }
      }
    } else {
      if (depth > 0) marked += tok;
      else rest += tok;
    }
  }
  return { marked, rest };
}
