#!/usr/bin/env node
// Dry-run preview for the Timeline xlsx import.
// Reads the file, runs the same parser the UI uses, and prints what would be
// imported and what would be skipped — *without* writing to Supabase.
//
// Usage:  node scripts/preview-timeline-import.mjs <path-to-xlsx>
// Default path: ../docs/Reckoning of Years.xlsx

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as XLSX from '@e965/xlsx';
import {
  parseSheet,
  parseLooseDate,
  normalizeArrayRow,
} from '../src/lib/timelineImport.ts';

const arg = process.argv[2] || '../docs/Reckoning of Years.xlsx';
const path = resolve(arg);

const buf = await readFile(path);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });

console.log(`\n📖  ${path}`);
console.log(`    sheets: ${wb.SheetNames.length} (${wb.SheetNames.join(', ')})\n`);

const allParsed = [];
const allSkipped = [];

for (const sn of wb.SheetNames) {
  const sh = wb.Sheets[sn];
  const fallbackYear = /^\d{4}$/.test(sn) ? sn : undefined;

  // Use the same entry point the UI uses
  const parsed = parseSheet(sh, sn);

  // Also collect "skipped" candidates so Jess can sanity-check
  const cellsList = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
  const skipped = [];
  for (const cells of cellsList) {
    if (!Array.isArray(cells)) continue;
    const accepted = normalizeArrayRow(cells, fallbackYear);
    if (accepted) continue;
    // Was there a date-shaped cell that we could parse? If yes, this is a
    // row that LOOKS like data but had no usable summary — worth flagging.
    let foundDate = null;
    for (const c of cells) {
      const s = String(c ?? '').trim();
      if (!s) continue;
      const d = parseLooseDate(s, fallbackYear);
      if (d) { foundDate = d.date; break; }
    }
    if (foundDate) skipped.push({ sheet: sn, cells, reason: 'no summary ≥ 10 chars' });
  }

  console.log(`  📄  ${sn}: ${parsed.length} accepted, ${skipped.length} flagged-skip`);
  for (const row of parsed) allParsed.push({ sheet: sn, ...row });
  for (const row of skipped) allSkipped.push(row);
}

// Year breakdown
const byYear = new Map();
for (const r of allParsed) {
  const y = r.entry_date.slice(0, 4);
  byYear.set(y, (byYear.get(y) || 0) + 1);
}
console.log(`\n✅  ACCEPTED — ${allParsed.length} entries\n`);
for (const [y, n] of [...byYear.entries()].sort()) {
  console.log(`    ${y}: ${n}`);
}

// Sample some accepted entries
console.log(`\n   sample (first 3 + last 3):`);
const sample = [...allParsed.slice(0, 3), ...allParsed.slice(-3)];
for (const r of sample) {
  const s = r.summary.length > 80 ? r.summary.slice(0, 77) + '...' : r.summary;
  console.log(`    ${r.entry_date}  ${s}`);
}

// Skipped rows
if (allSkipped.length > 0) {
  console.log(`\n⚠️   SKIPPED with parseable date — ${allSkipped.length}`);
  console.log(`    (date found but summary < 10 chars; review:)`);
  for (const r of allSkipped.slice(0, 12)) {
    console.log(`    [${r.sheet}] ${JSON.stringify(r.cells)}  // ${r.reason}`);
  }
  if (allSkipped.length > 12) console.log(`    ... +${allSkipped.length - 12} more`);
} else {
  console.log(`\n   no flagged-skip rows.`);
}

// Duplicate-date check (timeline is one-per-day per user)
const dateMap = new Map();
for (const r of allParsed) {
  if (!dateMap.has(r.entry_date)) dateMap.set(r.entry_date, []);
  dateMap.get(r.entry_date).push(r);
}
const dupes = [...dateMap.entries()].filter(([, rs]) => rs.length > 1);
if (dupes.length > 0) {
  console.log(`\n⚠️   DUPLICATE DATES — ${dupes.length}`);
  console.log(`    Timeline enforces one-per-day. The importer's 'Skip duplicates'`);
  console.log(`    mode keeps the FIRST occurrence in the file order; 'Overwrite'`);
  console.log(`    keeps the LAST.`);
  for (const [date, rows] of dupes.slice(0, 8)) {
    console.log(`\n    ${date}:`);
    for (const r of rows) {
      const s = r.summary.length > 70 ? r.summary.slice(0, 67) + '...' : r.summary;
      console.log(`      [${r.sheet}] ${s}`);
    }
  }
  if (dupes.length > 8) console.log(`    ... +${dupes.length - 8} more dupe groups`);
}

console.log(`\n📊  TOTAL: ${allParsed.length} entries across ${byYear.size} years\n`);
