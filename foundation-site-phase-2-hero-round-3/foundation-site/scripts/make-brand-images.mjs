// Makes the two brand images that cannot be plain SVG: the share-preview picture (1200x630) and the
// phone home-screen icon (180x180). Both are built from the logo in content/brand/mark.svg and carry no text,
// so they never hold a placeholder name.
// Needs rsvg-convert (librsvg). Output is committed to src/assets/, so the normal build needs no tools.
// Replace the logo and run `npm run brand-images`, or replace either PNG with real brand art any time.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(root, 'content/site.json'), 'utf8'));
const t = site.brand.light;

// The logo, without its outer <svg> and <title>, so it can be placed inside another picture.
const mark = readFileSync(join(root, 'content/brand/mark.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<title>[\s\S]*?<\/title>/, '');

const W = 1200;
const H = 630;
const size = 384; // the logo is drawn on a 64 unit grid
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2B5FEF" stop-opacity=".6"/><stop offset="1" stop-color="#2B5FEF" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.7" fill="#FFFFFF" fill-opacity=".14"/></pattern>
</defs>
<rect width="${W}" height="${H}" fill="${t.band}"/>
<rect width="${W}" height="${H}" fill="url(#dots)"/>
<ellipse cx="${W / 2}" cy="${H / 2}" rx="500" ry="340" fill="url(#glow)"/>
<g transform="translate(${(W - size) / 2} ${(H - size) / 2}) scale(${size / 64})">${mark}</g>
</svg>`;

const touch = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
<rect width="180" height="180" fill="#FFFFFF"/>
<g transform="translate(30 30) scale(${120 / 64})">${mark}</g>
</svg>`;

const dir = mkdtempSync(join(tmpdir(), 'brand-'));
writeFileSync(join(dir, 'og.svg'), og);
writeFileSync(join(dir, 'touch.svg'), touch);
execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', '-o', join(root, 'src/assets/og-default.png'), join(dir, 'og.svg')]);
execFileSync('rsvg-convert', ['-w', '180', '-h', '180', '-o', join(root, 'src/assets/apple-touch-icon.png'), join(dir, 'touch.svg')]);
console.log('Wrote src/assets/og-default.png and src/assets/apple-touch-icon.png');
