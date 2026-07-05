import { describe, it, expect } from 'vitest';
import { extOf, fileGroup, humanSize, truncateMiddle } from '../src/lib/notesFiles';

describe('extOf', () => {
  it('extracts lowercased extensions', () => {
    expect(extOf('Report.PDF')).toBe('pdf');
    expect(extOf('archive.tar.gz')).toBe('gz');
  });
  it('handles missing / degenerate extensions', () => {
    expect(extOf('README')).toBe('');
    expect(extOf('.gitignore')).toBe('');
    expect(extOf('weird.')).toBe('');
  });
});

describe('fileGroup', () => {
  it('routes the common groups by MIME', () => {
    expect(fileGroup('application/pdf')).toBe('pdf');
    expect(fileGroup('audio/mpeg')).toBe('audio');
    expect(fileGroup('video/mp4')).toBe('video');
    expect(fileGroup('application/zip')).toBe('archive');
    expect(fileGroup('text/plain')).toBe('doc');
    expect(fileGroup('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('doc');
    expect(fileGroup('application/octet-stream')).toBe('generic');
  });
  it('falls back to the extension when the MIME is generic', () => {
    expect(fileGroup('application/octet-stream', 'notes.pdf')).toBe('pdf');
    expect(fileGroup('', 'backup.7z')).toBe('archive');
    expect(fileGroup('', 'essay.docx')).toBe('doc');
    expect(fileGroup('', 'mystery.xyz')).toBe('generic');
  });
});

describe('humanSize', () => {
  it('formats each magnitude', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(412)).toBe('412 B');
    expect(humanSize(1536)).toBe('1.5 KB');
    expect(humanSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
    expect(humanSize(1.1 * 1024 ** 3)).toBe('1.1 GB');
  });
  it('drops the trailing .0 and rounds three-digit values', () => {
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(250 * 1024)).toBe('250 KB');
  });
  it('returns empty for invalid input', () => {
    expect(humanSize(-5)).toBe('');
    expect(humanSize(NaN)).toBe('');
  });
});

describe('truncateMiddle', () => {
  it('leaves short names alone', () => {
    expect(truncateMiddle('short.pdf')).toBe('short.pdf');
  });
  it('keeps the start and the extension visible', () => {
    const out = truncateMiddle('a-very-long-quarterly-report-final-v7.pdf', 28);
    expect(out.length).toBeLessThanOrEqual(28);
    expect(out).toContain('…');
    expect(out.startsWith('a-very')).toBe(true);
    expect(out.endsWith('.pdf')).toBe(true);
  });
});
