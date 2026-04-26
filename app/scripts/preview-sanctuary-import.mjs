#!/usr/bin/env node
// Dry-run preview for the Sanctuary Scrivener-export import.
// Walks a folder of .md + MetaData.txt pairs, runs the same parser the UI
// will use, and prints what would be imported and what would be flagged.
// No database writes.
//
// Usage:  node scripts/preview-sanctuary-import.mjs <folder>
// Default: ../docs

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import {
  parseMetadata,
  parseSanctuaryFile,
} from '../src/lib/sanctuaryImport.ts';

const root = resolve(process.argv[2] || '../docs');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const files = [];
for await (const f of walk(root)) files.push(f);

const mdFiles = files.filter((f) => /\.md$/i.test(f));
const accepted = [];
const skippedNoDate = [];
const warnings = [];

for (const path of mdFiles) {
  const meta = path.replace(/\.md$/i, ' MetaData.txt');
  let metadata = null;
  try {
    const t = await readFile(meta, 'utf8');
    metadata = parseMetadata(t);
  } catch {
    metadata = null;
  }
  let body;
  try {
    body = await readFile(path, 'utf8');
  } catch (err) {
    skippedNoDate.push({ path, reason: 'could not read .md' });
    continue;
  }
  const filename = path.split(/[/\\]/).pop();
  const parsed = parseSanctuaryFile(filename, body, metadata);
  if (!parsed) {
    skippedNoDate.push({ path, reason: 'no date in filename or metadata' });
    continue;
  }
  accepted.push({ path, ...parsed });
  if (parsed.warnings.length > 0) {
    warnings.push({ path, warnings: parsed.warnings });
  }
}

console.log(`\n📖  Sanctuary import dry-run`);
console.log(`    root: ${root}`);
console.log(`    .md files found: ${mdFiles.length}\n`);

const byYear = new Map();
for (const r of accepted) {
  const y = r.date.slice(0, 4);
  byYear.set(y, (byYear.get(y) || 0) + 1);
}
console.log(`✅  ACCEPTED — ${accepted.length} entries`);
for (const [y, n] of [...byYear.entries()].sort()) {
  console.log(`    ${y}: ${n}`);
}

console.log(`\n   sample (one per era):`);
const yearsSorted = [...byYear.keys()].sort();
const seenYears = new Set();
for (const r of accepted) {
  const y = r.date.slice(0, 4);
  if (seenYears.has(y)) continue;
  seenYears.add(y);
  if (seenYears.size > 6) break;
  const t = r.title.length > 50 ? r.title.slice(0, 47) + '...' : r.title;
  const b = r.bodyPreview.length > 60 ? r.bodyPreview.slice(0, 57) + '...' : r.bodyPreview;
  console.log(`    ${r.date}  [${r.tags.length || '-'}t]  "${t}" — ${b}`);
}

if (warnings.length > 0) {
  console.log(`\n⚠️   WARNINGS — ${warnings.length} entries with notes`);
  for (const w of warnings.slice(0, 12)) {
    const rel = w.path.replace(root + sep, '').replace(/\\/g, '/');
    console.log(`    ${rel}`);
    for (const msg of w.warnings) console.log(`      • ${msg}`);
  }
  if (warnings.length > 12) console.log(`    ... +${warnings.length - 12} more`);
}

if (skippedNoDate.length > 0) {
  console.log(`\n⚠️   SKIPPED — ${skippedNoDate.length} files (no usable date)`);
  for (const r of skippedNoDate.slice(0, 10)) {
    const rel = r.path.replace(root + sep, '').replace(/\\/g, '/');
    console.log(`    ${rel}  // ${r.reason}`);
  }
  if (skippedNoDate.length > 10) console.log(`    ... +${skippedNoDate.length - 10} more`);
}

// Same-day duplicates (multiple Scrivener docs on the same date — fine for
// Sanctuary, since the table allows >1 entry per day; just FYI for review)
const dateMap = new Map();
for (const r of accepted) {
  if (!dateMap.has(r.date)) dateMap.set(r.date, []);
  dateMap.get(r.date).push(r);
}
const dupes = [...dateMap.entries()].filter(([, rs]) => rs.length > 1);
console.log(
  `\n📊  ${accepted.length} entries · ${byYear.size} years · ${dupes.length} dates with multiple entries\n`,
);

// Title source breakdown
const titleStats = { fromFilename: 0, fromBodyBold: 0, fromSynopsis: 0, untitled: 0 };
for (const r of accepted) {
  if (r.title === 'Untitled') titleStats.untitled++;
  // Heuristic: if the bodyPreview started with what we ended up using as
  // title, assume it came from the body bold.
  // Otherwise can't tell from outside; not worth more bookkeeping.
}
if (titleStats.untitled > 0) {
  console.log(`    ${titleStats.untitled} entries defaulted to title="Untitled" — review.\n`);
}
