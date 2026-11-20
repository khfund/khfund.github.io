#!/usr/bin/env node
// Builds the site into dist/ from content/.
//   npm run build               staging: samples allowed, not indexed by search engines
//   npm run build:preview       staging with links that work from any folder or host
//   npm run build:production    refuses samples, placeholders, stubs and a missing site address
import { mkdirSync, rmSync, writeFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadContent } from './content.mjs';
import { makeLinker } from './lib/url.mjs';
import { buildPages, REQUIRED_PAGES } from './pages.mjs';
import { renderDocument } from './layout.mjs';
import { sitemapXml, robotsTxt, atomFeed } from './seo.mjs';
import { headersFile } from './lib/security.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const vars = (t) => Object.entries(t).map(([k, v]) => `--${kebab(k)}:${v};`).join('');

export function productionProblems(c) {
  const out = [];
  if (!/^https:\/\/[^/\s]+/.test(c.site.siteUrl || '')) out.push('content/site.json: "siteUrl" must be the public address, starting with https://, for example https://example.org.');
  for (const f of c.samples) out.push(`${f} is marked "sample: true". Replace the sample text with the Foundation's own, then delete that line.`);
  for (const f of c.stubs) out.push(`${f} is marked "stub: true". It stands in for something that is not built yet.`);
  for (const p of c.placeholders) out.push(`${p.file} still has ${p.items.length} placeholder${p.items.length === 1 ? '' : 's'} written as [[...]], for example [[${p.items[0]}]].`);
  if (c.site.analytics?.enabled && !/^https:\/\//.test(c.site.analytics.scriptSrc || '')) out.push('content/site.json: analytics is enabled but "scriptSrc" is not an https:// address.');
  return out;
}

export function build({ root, out = join(root, 'dist'), production = false, relative = false, now = new Date() }) {
  const c = loadContent(join(root, 'content'), { now });
  c.production = production;
  c.staging = !production;
  c.relative = relative;
  c.link = makeLinker(relative ? 'relative' : 'clean');
  c.lang = c.site.locale.split('-')[0];
  c.siteUrl = (c.site.siteUrl || '').replace(/\/+$/, '');

  for (const slug of REQUIRED_PAGES) if (!c.pages[slug]) c.problems.push(`content/pages/${slug}.md is missing.`);
  for (const [kind, list] of [['story', c.stories], ['news item', c.news]]) {
    for (const x of list) {
      if (x.image && !existsSync(join(root, 'content/images', x.image))) c.problems.push(`${x.file}: the image "${x.image}" is not in content/images/.`);
    }
  }
  if (production) c.problems.push(...productionProblems(c));
  if (c.problems.length) return { ok: false, problems: c.problems, warnings: c.warnings };

  const pages = buildPages(c);

  // styles: the palette from content/site.json, then the stylesheet
  const { light, dark } = c.site.brand;
  const tokens = `:root{${vars(light)}color-scheme:light dark}\n@media (prefers-color-scheme:dark){:root{${vars(dark)}}}\n`;
  const css = tokens + readFileSync(join(here, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n');
  const js = readFileSync(join(here, 'site.js'), 'utf8');
  // The logo and share images are cached for a year like the stylesheet, so their addresses carry this version too.
  // It changes whenever the stylesheet, the script, the logo or the share images change.
  const mark = readFileSync(join(root, 'content/brand/mark.svg'));
  const brandImages = ['og-default.png', 'apple-touch-icon.png'].map((f) => readFileSync(join(here, 'assets', f)));
  c.assetVersion = createHash('sha256').update(css).update(js).update(mark).update(Buffer.concat(brandImages)).digest('hex').slice(0, 8);

  rmSync(out, { recursive: true, force: true });
  const put = (rel, data) => {
    const file = join(out, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  };

  for (const pg of pages) put(pg.path.endsWith('.html') ? pg.path.slice(1) : `${pg.path.slice(1)}index.html`, renderDocument(c, pg));
  put('assets/site.css', css);
  put('assets/site.js', js);
  cpSync(join(here, 'assets/fonts'), join(out, 'assets/fonts'), { recursive: true });
  for (const f of ['og-default.png', 'apple-touch-icon.png']) cpSync(join(here, 'assets', f), join(out, 'assets', f));
  put('assets/mark.svg', mark);
  put('favicon.svg', mark);
  // Hidden files (a .gitkeep that holds an empty folder in place, a .DS_Store) are never published.
  const visible = (file) => !basename(file).startsWith('.');
  for (const dir of ['files', 'images']) if (existsSync(join(root, 'content', dir))) cpSync(join(root, 'content', dir), join(out, dir), { recursive: true, filter: visible });
  put('feed.xml', atomFeed(c));
  put('robots.txt', robotsTxt(c));
  if (production) put('sitemap.xml', sitemapXml(c, pages));
  put('_headers', headersFile({ https: production, analyticsSrc: c.site.analytics?.enabled ? c.site.analytics.scriptSrc : '' }));

  const report = {
    mode: production ? 'production' : relative ? 'preview' : 'staging',
    builtAt: now.toISOString(),
    pages: pages.length,
    programs: { open: c.programs.open.length, upcoming: c.programs.upcoming.length, closed: c.programs.closed.length },
    stories: c.stories.length,
    news: c.news.length,
    sampleFiles: c.samples,
    stubPages: c.stubs,
    placeholderFiles: c.placeholders.map((p) => ({ file: p.file, count: p.items.length })),
    warnings: c.warnings,
  };
  put('build-report.json', `${JSON.stringify(report, null, 2)}\n`);
  return { ok: true, report, pages, out, warnings: c.warnings };
}

// ---- command line ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const production = args.includes('--production');
  const relative = args.includes('--preview');
  const outArg = args.indexOf('--out');
  const root = resolve(here, '..');
  const result = build({ root, production, relative, out: outArg > -1 ? resolve(args[outArg + 1]) : join(root, 'dist') });
  if (!result.ok) {
    console.error(`\nThe site was not built. ${result.problems.length} thing${result.problems.length === 1 ? '' : 's'} to fix:\n`);
    for (const p of result.problems) console.error(`  - ${p}`);
    if (result.warnings.length) console.error(`\n(${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} not shown; they appear once these are fixed.)`);
    process.exit(1);
  }
  const r = result.report;
  console.log(`Built ${r.pages} pages (${r.mode}) into ${result.out}`);
  console.log(`Programs: ${r.programs.open} open, ${r.programs.upcoming} opening soon, ${r.programs.closed} closed. Stories: ${r.stories}. News: ${r.news}.`);
  if (r.sampleFiles.length) console.log(`Sample content in ${r.sampleFiles.length} files (a production build will refuse these).`);
  for (const w of r.warnings) console.log(`Warning: ${w}`);
}
