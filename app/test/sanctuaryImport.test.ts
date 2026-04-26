import { describe, it, expect } from 'vitest';
import {
  chooseTitleAndBody,
  markdownToHtml,
  parseFilenameDate,
  parseMetadata,
  parseSanctuaryFile,
} from '../src/lib/sanctuaryImport';

describe('parseFilenameDate', () => {
  it('strips the leading sort-index prefix Scrivener prepends on export', () => {
    expect(parseFilenameDate('26 Apr 2, 2023; Su.md').date).toBe('2023-04-02');
    expect(parseFilenameDate('1 2026-04-19 Emmaus Road.md').date).toBe('2026-04-19');
  });

  it('parses "Mon D, YYYY; DOW" — the 2022/2023 convention', () => {
    const r = parseFilenameDate('26 Apr 2, 2023; Su.md');
    expect(r.date).toBe('2023-04-02');
    expect(r.title).toBe('');
  });

  it('parses "Month D, YYYY; DOW" with full month name (the 2024 form)', () => {
    const r = parseFilenameDate('47 April 9, 2024; Tu.md');
    expect(r.date).toBe('2024-04-09');
  });

  it('parses "Mon D, YYYY" without the day-of-week suffix (early 2025)', () => {
    const r = parseFilenameDate('3 Jan 1, 2025.md');
    expect(r.date).toBe('2025-01-01');
  });

  it('parses "M.D.YY" (mid 2025 convention) with two-digit year', () => {
    expect(parseFilenameDate('18 3.1.25.md').date).toBe('2025-03-01');
    expect(parseFilenameDate('22 3.10.25.md').date).toBe('2025-03-10');
  });

  it('parses "M-D-YY" hyphen variant', () => {
    expect(parseFilenameDate('5 4-19-26.md').date).toBe('2026-04-19');
  });

  it('parses "YYYY-MM-DD title" (current convention)', () => {
    const r = parseFilenameDate('5 2026-04-19 Emmaus Road, early morning.md');
    expect(r.date).toBe('2026-04-19');
    expect(r.title).toBe('Emmaus Road, early morning');
  });

  it('parses "YYYY.MM.DD title" with periods', () => {
    const r = parseFilenameDate('5 2026.04.19 Emmaus.md');
    expect(r.date).toBe('2026-04-19');
    expect(r.title).toBe('Emmaus');
  });

  it('preserves the title remainder for new-style filenames', () => {
    const r = parseFilenameDate('99 2026-04-19 — On silence in the morning.md');
    expect(r.date).toBe('2026-04-19');
    expect(r.title).toBe('On silence in the morning');
  });

  it('returns date=null when no date pattern matches', () => {
    const r = parseFilenameDate('1 Export1.md');
    expect(r.date).toBeNull();
    expect(r.title).toBe('Export1');
  });

  it('returns date=null for non-md files (still strips ext if known)', () => {
    expect(parseFilenameDate('1 Whatever.markdown').date).toBeNull();
  });

  it('treats "Sept" as September (full+abbreviated names supported)', () => {
    expect(parseFilenameDate('1 Sept 1, 2024.md').date).toBe('2024-09-01');
  });

  it('rejects nonsense in the M-D-YY slot', () => {
    expect(parseFilenameDate('1 13.45.25.md').date).toBeNull(); // month=13 invalid
  });

  it('two-digit year < 70 maps to 2000s', () => {
    expect(parseFilenameDate('1 1.1.25.md').date).toBe('2025-01-01');
  });

  it('two-digit year >= 70 maps to 1900s (just in case)', () => {
    expect(parseFilenameDate('1 1.1.85.md').date).toBe('1985-01-01');
  });
});

describe('parseMetadata', () => {
  it('reads Created/Modified/Keywords/Synopsis', () => {
    const text = [
      'Created: Wednesday, January 1, 2025 4:39:46 PM',
      'Modified: Sunday, April 26, 2026 1:15:03 PM',
      'Status: No Status',
      'Label: No Label',
      'Keywords: presence, bread, recognition',
      'Synopsis: Summary: Jesus is with me.',
    ].join('\n');
    const md = parseMetadata(text);
    expect(md.created?.getFullYear()).toBe(2025);
    expect(md.created?.getMonth()).toBe(0); // Jan
    expect(md.created?.getDate()).toBe(1);
    expect(md.keywords).toEqual(['presence', 'bread', 'recognition']);
    expect(md.synopsis).toBe('Summary: Jesus is with me.');
  });

  it('handles missing fields gracefully', () => {
    const md = parseMetadata('Created: Saturday, January 28, 2023 3:52:12 AM');
    expect(md.modified).toBeNull();
    expect(md.keywords).toEqual([]);
    expect(md.synopsis).toBe('');
  });

  it('handles a multi-line synopsis (text wraps after the Synopsis: line)', () => {
    const md = parseMetadata(
      [
        'Created: Friday, April 24, 2026 6:46:12 PM',
        'Synopsis: line one',
        'line two',
        'line three',
      ].join('\n'),
    );
    expect(md.synopsis).toContain('line one');
    expect(md.synopsis).toContain('line two');
    expect(md.synopsis).toContain('line three');
  });

  it('handles empty Keywords field', () => {
    const md = parseMetadata('Keywords: \nSynopsis: ');
    expect(md.keywords).toEqual([]);
  });
});

describe('markdownToHtml', () => {
  it('wraps plain text in <p>', () => {
    expect(markdownToHtml('hello there')).toBe('<p>hello there</p>');
  });

  it('splits paragraphs on blank lines', () => {
    const out = markdownToHtml('one\n\ntwo');
    expect(out).toBe('<p>one</p>\n<p>two</p>');
  });

  it('converts **bold** and __bold__', () => {
    expect(markdownToHtml('**hi**')).toBe('<p><strong>hi</strong></p>');
    expect(markdownToHtml('__hi__')).toBe('<p><strong>hi</strong></p>');
  });

  it('converts *italic* and _italic_ but not inside a word', () => {
    expect(markdownToHtml('this is *important* now')).toContain('<em>important</em>');
    expect(markdownToHtml('snake_case_var')).toContain('snake_case_var');
  });

  it('renders headings', () => {
    expect(markdownToHtml('# Heading')).toBe('<h1>Heading</h1>');
    expect(markdownToHtml('## Sub')).toBe('<h2>Sub</h2>');
  });

  it('renders blockquotes (whole-block prefixed with >)', () => {
    expect(markdownToHtml('> a quoted line')).toBe('<blockquote>a quoted line</blockquote>');
  });

  it('renders horizontal rules', () => {
    expect(markdownToHtml('---')).toBe('<hr/>');
    expect(markdownToHtml('***')).toBe('<hr/>');
  });

  it('escapes HTML special chars in user text', () => {
    expect(markdownToHtml('<script>')).toBe('<p>&lt;script&gt;</p>');
    expect(markdownToHtml('a < b & c > d')).toBe('<p>a &lt; b &amp; c &gt; d</p>');
  });

  it('handles empty input', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('\n\n\n')).toBe('');
  });

  it('preserves bold + italic in same paragraph', () => {
    const out = markdownToHtml('**bold** and *italic*');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });
});

describe('chooseTitleAndBody', () => {
  it('uses filename title when present', () => {
    const r = chooseTitleAndBody('Emmaus Road', 'body text', 'synopsis');
    expect(r.title).toBe('Emmaus Road');
    expect(r.body).toBe('body text');
  });

  it('lifts a leading **bold** line as title when filename has none', () => {
    const r = chooseTitleAndBody('', "**Today: God's first miracle**\n\nbody text", '');
    expect(r.title).toBe("Today: God's first miracle");
    expect(r.body).toBe('body text');
  });

  it('lifts a leading # heading line as title', () => {
    const r = chooseTitleAndBody('', '# Some Heading\n\nbody', '');
    expect(r.title).toBe('Some Heading');
    expect(r.body).toBe('body');
  });

  it('falls back to synopsis (truncated) when filename empty and no leading bold', () => {
    const r = chooseTitleAndBody('', 'just a paragraph', 'a synopsis line');
    expect(r.title).toBe('a synopsis line');
  });

  it('falls back to empty string when nothing is available (binder shows "untitled" placeholder)', () => {
    const r = chooseTitleAndBody('', 'just a paragraph', '');
    expect(r.title).toBe('');
  });

  it('lifts a multi-line bold preamble and picks the non-date, non-verse line', () => {
    const body = [
      '**April 2, 2023; 10:17 am; Sunday',
      '',
      'Day 8 - Become offenseless',
      '',
      '"Blessed are those..." Matthew 5:10**',
      '',
      'Now the body proper begins.',
    ].join('\n');
    const r = chooseTitleAndBody('', body, '');
    expect(r.title).toBe('Day 8 - Become offenseless');
    expect(r.body).toBe('Now the body proper begins.');
  });

  it('multi-line bold preamble without a clean title line falls back to first line capped', () => {
    const body = [
      '**Saturday morning notes',
      '',
      'a really long quote that wraps and wraps',
      '',
      '"Some verse." Matthew 1:1**',
      '',
      'body',
    ].join('\n');
    const r = chooseTitleAndBody('', body, '');
    // First non-empty line wins as fallback (no rule excludes it on its own).
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.body).toBe('body');
  });

  it('does not lift body bold if filename already has a title', () => {
    const r = chooseTitleAndBody('Filename Title', '**Body Bold**\n\nrest', '');
    expect(r.title).toBe('Filename Title');
    expect(r.body).toContain('**Body Bold**');
  });
});

describe('parseSanctuaryFile (end-to-end)', () => {
  it('happy path with date in filename + body + metadata', () => {
    const meta = parseMetadata([
      'Created: Wednesday, January 1, 2025 4:39:46 PM',
      'Keywords: presence, bread',
    ].join('\n'));
    const result = parseSanctuaryFile(
      '3 Jan 1, 2025.md',
      "**Today: God's first miracle**\n\nA quiet morning.",
      meta,
    );
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2025-01-01');
    expect(result!.dateSource).toBe('filename');
    expect(result!.title).toBe("Today: God's first miracle");
    expect(result!.body_html).toContain('<p>A quiet morning.</p>');
    expect(result!.tags).toEqual(['presence', 'bread']);
    expect(result!.warnings).toEqual([]);
  });

  it('falls back to metadata Created when filename has no date', () => {
    const meta = parseMetadata('Created: Friday, April 24, 2026 6:46:12 PM');
    const result = parseSanctuaryFile('1 Export1.md', 'body', meta);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-04-24');
    expect(result!.dateSource).toBe('metadata');
    expect(result!.warnings.length).toBe(1);
    expect(result!.warnings[0]).toMatch(/metadata Created/);
  });

  it('returns null when neither filename nor metadata has a date', () => {
    const meta = parseMetadata('Status: No Status');
    expect(parseSanctuaryFile('1 Export1.md', 'body', meta)).toBeNull();
  });

  it('handles 2022 "Mon D, YYYY; DOW" with no usable filename title', () => {
    const meta = parseMetadata([
      'Created: Saturday, January 28, 2023 3:52:12 AM',
      'Synopsis: Summary: Jesus says He is with me.',
    ].join('\n'));
    const result = parseSanctuaryFile(
      '10 Jun 10, 2022; F.md',
      '**Listening Prayer**\n\nthe body',
      meta,
    );
    expect(result!.date).toBe('2022-06-10'); // filename, not metadata
    expect(result!.dateSource).toBe('filename');
    expect(result!.title).toBe('Listening Prayer'); // lifted from body bold
  });

  it('M.D.YY 2-digit year expands correctly', () => {
    const result = parseSanctuaryFile(
      '18 3.1.25.md',
      'plain body',
      parseMetadata('Synopsis: short note'),
    );
    expect(result!.date).toBe('2025-03-01');
    expect(result!.title).toBe('short note');
  });

  it('warns when no title can be resolved from filename or body', () => {
    const meta = parseMetadata('Created: Friday, April 24, 2026 6:46:12 PM');
    // Filename "1 .md" has no title remainder once the sort prefix is gone.
    const result = parseSanctuaryFile('1 .md', 'plain body', meta);
    expect(result!.title).toBe('');
    expect(result!.warnings.some((w) => /untitled/i.test(w))).toBe(true);
  });
});
