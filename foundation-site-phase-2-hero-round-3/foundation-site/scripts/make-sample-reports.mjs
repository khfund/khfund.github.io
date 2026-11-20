// Makes the sample annual-report PDFs in content/files/ so the download links on the finances page work
// in the staging site. Every page says SAMPLE. Replace them with the Foundation's real reports and
// delete this script's output; a production build refuses "sample: true" report entries.
// Needs Playwright with Chromium (a dev dependency). Run: npm run samples
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { parseFrontMatter } from '../src/lib/frontmatter.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'content/files');
mkdirSync(outDir, { recursive: true });

const reports = readdirSync(join(root, 'content/reports'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => parseFrontMatter(readFileSync(join(root, 'content/reports', f), 'utf8'), f).data);

const browser = await chromium.launch();
for (const r of reports) {
  if (!r.file) continue;
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{font:16pt/1.5 Georgia,serif;margin:0;padding:2.2cm;color:#0E1A4B}
    h1{font-size:30pt;margin:0 0 .4em}
    .stamp{display:inline-block;border:3px solid #0E1A4B;padding:.2em .6em;font:700 14pt sans-serif;margin-bottom:1.5em;background:#FFEF5C}
    td,th{padding:.3em 1em .3em 0;text-align:left;font-size:13pt} th{font-weight:700}
  </style>
  <p class="stamp">SAMPLE. NOT A REAL REPORT.</p>
  <h1>${r.title}</h1>
  <p>This file stands in for the Foundation's annual report for ${r.year}. Replace it with the real PDF and remove "sample: true" from the matching file in content/reports/.</p>
  <table><tr><th>Students</th><td>${r.students} of every 100</td></tr><tr><th>Running the foundation</th><td>${r.operations} of every 100</td></tr><tr><th>Raising money</th><td>${r.fundraising} of every 100</td></tr></table>`);
  await page.pdf({ path: join(outDir, r.file), format: 'A4' });
  await page.close();
  console.log(`Wrote content/files/${r.file}`);
}
await browser.close();
