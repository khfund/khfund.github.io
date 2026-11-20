// Helpers for the tests: a throwaway copy of the content folder, and a way to "finish" it (every sample and
// placeholder replaced with ordinary text) so a production build can be tested without the Foundation's real text.
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function eachMarkdown(dir, fn) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) eachMarkdown(path, fn);
    else if (name.endsWith('.md')) fn(path);
  }
}

// Make content look finished: no "sample: true", no "stub: true", no [[placeholders]], and a real site address.
export function finishContent(contentDir) {
  eachMarkdown(contentDir, (file) => {
    const text = readFileSync(file, 'utf8')
      .replace(/^(sample|stub):\s*true\s*\r?\n/gm, '')
      .replace(/\[\[(.+?)\]\]/g, '$1');
    writeFileSync(file, text);
  });
  const site = JSON.parse(readFileSync(join(contentDir, 'site.json'), 'utf8'));
  Object.assign(site, {
    name: 'Example Scholars Foundation',
    shortName: 'Example Scholars',
    staffEmail: 'staff@foundation.example',
    postalAddress: '1 Example Street, Example City',
    legalLine: 'Example Scholars Foundation, a registered charity.',
    siteUrl: 'https://foundation.example',
  });
  writeFileSync(join(contentDir, 'site.json'), `${JSON.stringify(site, null, 2)}\n`);
}

// Returns { root, content, out, cleanup }. `edit(contentDir)` can change the copy before it is used.
export function makeRoot({ finished = false, edit } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-test-'));
  const content = join(root, 'content');
  cpSync(join(ROOT, 'content'), content, { recursive: true });
  if (finished) finishContent(content);
  edit?.(content, root);
  return { root, content, out: join(root, 'dist'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export const readSite = (content) => JSON.parse(readFileSync(join(content, 'site.json'), 'utf8'));
export const writeSite = (content, site) => writeFileSync(join(content, 'site.json'), `${JSON.stringify(site, null, 2)}\n`);

// Change one text file in a copy: edit(path, fn) where fn gets the old text and returns the new text.
export const changeFile = (path, fn) => writeFileSync(path, fn(readFileSync(path, 'utf8')));
