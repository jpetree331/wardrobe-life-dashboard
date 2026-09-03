import { describe, it, expect } from 'vitest';
import { AI_MARK_CLASS, MY_MARK_CLASS, splitByMarkedSpans } from '../src/lib/aiAttribution';
import { aiWordsInEntry, wordsInEntry, writingSummary } from '../src/lib/sanctuaryStats';

const AI = (inner: string) => `<span class="${AI_MARK_CLASS}">${inner}</span>`;
const MINE = (inner: string) => `<span class="${MY_MARK_CLASS}">${inner}</span>`;

describe('splitByMarkedSpans', () => {
  it('splits marked from unmarked text', () => {
    const html = `<p>my own words ${AI('robot words here')} and mine again</p>`;
    const { marked, rest } = splitByMarkedSpans(html, AI_MARK_CLASS);
    expect(marked).toBe('robot words here');
    expect(rest).toBe('<p>my own words  and mine again</p>');
  });

  it('handles nested spans inside a marked region (highlight in AI text)', () => {
    const html = `<p>${AI('before <span style="background:#ff0">glow</span> after')}</p>`;
    const { marked, rest } = splitByMarkedSpans(html, AI_MARK_CLASS);
    expect(marked).toBe('before <span style="background:#ff0">glow</span> after');
    expect(rest).toBe('<p></p>');
  });

  it('handles multiple marked regions and block tags crossing them', () => {
    const html = `<p>${AI('one')}</p><p>mine</p><p>${AI('two')}</p>`;
    const { marked, rest } = splitByMarkedSpans(html, AI_MARK_CLASS);
    expect(marked).toBe('onetwo');
    expect(rest).toBe('<p></p><p>mine</p><p></p>');
  });

  it('no marks → everything is rest, marked empty', () => {
    const { marked, rest } = splitByMarkedSpans('<p>plain words</p>', AI_MARK_CLASS);
    expect(marked).toBe('');
    expect(rest).toBe('<p>plain words</p>');
  });

  it('plain spans without the marker class stay in rest', () => {
    const html = '<p><span class="sa-verse-num">1</span> in the beginning</p>';
    const { marked, rest } = splitByMarkedSpans(html, AI_MARK_CLASS);
    expect(marked).toBe('');
    expect(rest).toBe(html);
  });
});

describe('attributed word counts', () => {
  const entry = (body: string, ai_dialogue?: string) => ({
    id: 'e1', entry_date: '2026-08-27', title: 't', body, ai_dialogue,
  });

  it('body: AI-marked words move from mine to AI', () => {
    const e = entry(`<p>alpha beta ${AI('gamma delta epsilon')}</p>`);
    expect(wordsInEntry(e)).toBe(2);
    expect(aiWordsInEntry(e)).toBe(3);
  });

  it('pane: AI by default, my-marked words count as mine', () => {
    const e = entry('<p>one two</p>', `<p>${MINE('why is that')} long model answer here</p>`);
    expect(wordsInEntry(e)).toBe(2 + 3);
    expect(aiWordsInEntry(e)).toBe(4);
  });

  it('unmarked entry with no pane counts exactly as before', () => {
    const e = entry('<p>five words in this body</p>');
    expect(wordsInEntry(e)).toBe(5);
    expect(aiWordsInEntry(e)).toBe(0);
  });

  it('writingSummary carries AI totals split by year', () => {
    const s = writingSummary([
      entry(`<p>mine mine ${AI('bot bot bot')}</p>`),
      { id: 'e2', entry_date: '2025-01-01', title: null, body: '<p>old</p>', ai_dialogue: '<p>ai text</p>' },
    ], 2026);
    expect(s.totalWords).toBe(2 + 1);          // AI words not in mine
    expect(s.totalAiWords).toBe(3 + 2);
    expect(s.thisYearAiWords).toBe(3);
  });
});
