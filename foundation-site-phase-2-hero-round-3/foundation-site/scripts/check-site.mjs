#!/usr/bin/env node
// Checks the built site in dist/ the way a careful reviewer would, without a browser: page structure,
// links, forms, search-engine basics, security rules and page weight. Run it after every build.
//
//   npm run check                     checks dist/
//   node scripts/check-site.mjs --dist some/folder
//
// Exit code 0 = no problems (warnings are allowed), 1 = at least one problem.
// The browser checks (phone widths, dark mode, keyboard, speed) are in check-render.mjs.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, posix, sep, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseHtml, find, walk, textOf, rawText, nameOf, clean, ancestors } from './lib/scan-html.mjs';
import { BOOT_SNIPPET } from '../src/templates/boot.mjs';

// ---- budgets (NFR-6). Sizes are after gzip, in bytes, because that is what a phone downloads. ----
export const BUDGET = {
  html: 60 * 1024, // one page's own HTML
  css: 30 * 1024,
  js: 8 * 1024,
  fonts: 160 * 1024, // every font file together
  firstView: 140 * 1024, // HTML + CSS + JS + the two preloaded fonts, for any one page
};

const FORM_ENDPOINTS = new Set(['/api/contact', '/api/partner', '/api/newsletter']);
const SERVER_ROUTES = /^\/(api\/|newsletter\/(confirm|unsubscribe)$|healthz$)/;
// Pages nobody links to because the server sends visitors there after a form or a wrong address.
const REACHED_BY_SERVER = new Set(['/contact/sent/', '/partner/sent/', '/newsletter/check-your-email/', '/newsletter/confirmed/', '/newsletter/unsubscribed/', '/form-error/', '/404.html']);
const VAGUE_LINK = /^(click here|here|read more|more|learn more|link|this|this link)$/i;
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

class Report {
  constructor() {
    this.rules = new Map();
  }
  rule(id, req, title) {
    const r = { id, req, title, checked: 0, problems: [], warnings: [] };
    this.rules.set(id, r);
    return {
      ok: (n = 1) => {
        r.checked += n;
      },
      // check(condition, where, message): counts one check; a false condition is a problem
      check: (cond, where, message) => {
        r.checked += 1;
        if (!cond) r.problems.push({ where, message });
        return cond;
      },
      warn: (where, message) => r.warnings.push({ where, message }),
    };
  }
  get problems() {
    return [...this.rules.values()].flatMap((r) => r.problems.map((p) => ({ rule: r.id, ...p })));
  }
  get warnings() {
    return [...this.rules.values()].flatMap((r) => r.warnings.map((p) => ({ rule: r.id, ...p })));
  }
}

function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [relative(base, full).split(sep).join('/')];
  });
}

const urlOf = (file) => (file === 'index.html' ? '/' : file.endsWith('/index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`);
const metaOf = (root, key, by = 'name') => find(root, (n) => n.tag === 'meta' && n.attrs[by] === key).map((n) => n.attrs.content ?? '');
const isExternal = (href) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href) && !/^(mailto:|tel:)/i.test(href);

export function checkSite({ dist, contentDir = join(dist, '..', 'content') }) {
  const report = new Report();
  const files = new Set(listFiles(dist));
  const read = (f) => readFileSync(join(dist, f));
  const text = (f) => (files.has(f) ? read(f).toString('utf8') : '');
  const buildInfo = files.has('build-report.json') ? JSON.parse(text('build-report.json')) : { mode: 'staging' };
  const mode = buildInfo.mode;
  const production = mode === 'production';
  const preview = mode === 'preview';
  let site = {};
  try {
    site = JSON.parse(readFileSync(join(contentDir, 'site.json'), 'utf8'));
  } catch {
    /* the folder may not be next to dist/; the checks that need it are skipped */
  }
  const siteUrl = (site.siteUrl || '').replace(/\/+$/, '');
  const siteHost = siteUrl ? new URL(siteUrl).host : '';

  const pages = [...files]
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((file) => {
      const src = text(file);
      const { root, problems } = parseHtml(src);
      const ids = new Map();
      for (const n of walk(root)) if (n.type === 'el' && n.attrs.id !== undefined) ids.set(n.attrs.id, (ids.get(n.attrs.id) ?? 0) + 1);
      return { file, url: urlOf(file), src, root, problems, ids, html: find(root, 'html')[0], robots: metaOf(root, 'robots').join(',') };
    });
  const byFile = new Map(pages.map((p) => [p.file, p]));
  const isNoindex = (p) => /noindex/i.test(p.robots);

  // ---- structure -------------------------------------------------------------------------------
  {
    const r = report.rule('markup', 'NFR-1', 'Every tag is opened and closed properly');
    for (const p of pages) {
      r.check(/^<!doctype html>/i.test(p.src), p.url, 'The page does not start with <!doctype html>.');
      if (p.problems.length === 0) r.ok();
      for (const msg of p.problems.slice(0, 5)) r.check(false, p.url, msg);
    }
  }
  {
    const r = report.rule('language', 'NFR-1', 'Every page declares its language');
    const want = site.locale ? site.locale.split('-')[0] : null;
    for (const p of pages) {
      const lang = p.html?.attrs.lang;
      r.check(Boolean(lang) && (!want || lang === want), p.url, `<html lang> is "${lang ?? ''}"${want ? `, expected "${want}"` : ''}.`);
    }
  }
  {
    const r = report.rule('titles', 'NFR-11', 'Every page has a clear, different title and a description');
    const seen = new Map();
    for (const p of pages) {
      const titles = find(p.root, 'title');
      const t = titles.length === 1 ? clean(textOf(titles[0])) : '';
      r.check(Boolean(t), p.url, titles.length === 1 ? 'The <title> is empty.' : `The page has ${titles.length} <title> elements; it needs exactly one.`);
      if (t.length > 70) r.warn(p.url, `The title is ${t.length} characters; search results cut it off around 60. "${t}"`);
      if (t) {
        r.check(!seen.has(t), p.url, `The title "${t}" is also used on ${seen.get(t)}.`);
        seen.set(t, p.url);
      }
      const d = clean(metaOf(p.root, 'description')[0] ?? '');
      r.check(Boolean(d), p.url, 'The page has no meta description.');
      if (d && !isNoindex(p) && (d.length < 40 || d.length > 175)) r.warn(p.url, `The description is ${d.length} characters; 50 to 160 reads best in search results.`);
    }
  }
  {
    const r = report.rule('headings', 'NFR-1', 'One h1 per page, and no skipped heading levels');
    for (const p of pages) {
      const hs = find(p.root, (n) => /^h[1-6]$/.test(n.tag));
      const h1s = hs.filter((h) => h.tag === 'h1');
      r.check(h1s.length === 1, p.url, `The page has ${h1s.length} h1 headings; it needs exactly one.`);
      r.check(hs.length > 0 && hs[0].tag === 'h1', p.url, 'The first heading on the page is not the h1.');
      let prev = 0;
      for (const h of hs) {
        const level = Number(h.tag[1]);
        r.check(prev === 0 || level <= prev + 1, p.url, `Heading jumps from h${prev} to h${level}: "${clean(textOf(h)).slice(0, 60)}".`);
        r.check(clean(textOf(h)) !== '', p.url, `The page has an empty ${h.tag} heading, which a screen reader announces as just "heading".`);
        prev = level;
      }
    }
  }
  {
    const r = report.rule('ids', 'NFR-1', 'No repeated ids, and every reference to an id finds it');
    for (const p of pages) {
      for (const [id, n] of p.ids) r.check(n === 1, p.url, `The id "${id}" is used ${n} times.`);
      for (const n of walk(p.root)) {
        if (n.type !== 'el') continue;
        for (const attr of ['aria-controls', 'aria-describedby', 'aria-labelledby']) {
          for (const id of (n.attrs[attr] ?? '').split(/\s+/).filter(Boolean)) r.check(p.ids.has(id), p.url, `${attr}="${id}" on <${n.tag}> points to an id that does not exist.`);
        }
        if (n.tag === 'label' && n.attrs.for) r.check(p.ids.has(n.attrs.for), p.url, `<label for="${n.attrs.for}"> points to a field that does not exist.`);
      }
    }
  }
  {
    const r = report.rule('landmarks', 'NFR-1', 'A skip link, one main area, and labelled navigation');
    for (const p of pages) {
      const body = find(p.root, 'body')[0];
      const firstLink = body && find(body, 'a')[0];
      r.check(firstLink?.attrs.href === '#main', p.url, 'The first link on the page is not the "skip to main content" link.');
      const mains = find(p.root, 'main');
      r.check(mains.length === 1 && mains[0].attrs.id === 'main', p.url, 'The page needs exactly one <main id="main">.');
      r.check(mains[0]?.attrs.tabindex === '-1', p.url, 'The <main> needs tabindex="-1" so the skip link moves keyboard focus into it.');
      r.check(find(p.root, (n) => n.tag === 'header' && (n.attrs.class ?? '').includes('site-header')).length === 1, p.url, 'The page needs one site header.');
      r.check(find(p.root, (n) => n.tag === 'footer' && (n.attrs.class ?? '').includes('site-footer')).length === 1, p.url, 'The page needs one site footer.');
      const labels = new Set();
      for (const nav of find(p.root, 'nav')) {
        const label = clean(nav.attrs['aria-label'] ?? '');
        r.check(Boolean(label), p.url, 'A <nav> has no aria-label.');
        r.check(!labels.has(label), p.url, `Two navigation areas are both called "${label}".`);
        labels.add(label);
      }
    }
  }
  {
    const r = report.rule('images', 'NFR-1', 'Every image has alternative text');
    for (const p of pages) {
      for (const img of find(p.root, 'img')) {
        const alt = img.attrs.alt;
        r.check(alt !== undefined, p.url, `An image has no alt attribute: ${img.attrs.src}`);
        r.check(!/\.(png|jpe?g|gif|webp|svg)$/i.test(alt ?? ''), p.url, `The alt text looks like a file name: "${alt}".`);
        const inFigure = ancestors(img).some((a) => a.tag === 'figure');
        if (inFigure) r.check(Boolean(clean(alt ?? '')), p.url, `A picture in a figure has empty alt text: ${img.attrs.src}`);
      }
    }
  }

  {
    // The icons are drawn in the page, not loaded as images, so nothing else says they are decoration.
    const r = report.rule('svg-hidden', 'NFR-1', 'Every inline picture is hidden from screen readers, or has a name');
    for (const p of pages) {
      for (const svg of find(p.root, 'svg')) {
        const hidden = svg.attrs['aria-hidden'] === 'true' || ancestors(svg).some((a) => a.attrs['aria-hidden'] === 'true');
        const named = svg.attrs.role === 'img' && (Boolean(clean(svg.attrs['aria-label'] ?? '')) || find(svg, 'title').length > 0);
        r.check(hidden || named, p.url, 'An inline picture is announced by screen readers but has no name. Add aria-hidden="true" if it is decoration, or role="img" and a label if it is not.');
      }
    }
  }

  // ---- links and files -----------------------------------------------------------------------
  function resolveInternal(page, href) {
    const u = new URL(href, `http://local/${page.file}`);
    const path = decodeURIComponent(u.pathname);
    const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`];
    const found = candidates.map((c) => c.slice(1)).find((c) => files.has(c));
    return { path, file: found, fragment: u.hash.slice(1) ? decodeURIComponent(u.hash.slice(1)) : '' };
  }
  const links = new Map(); // page url -> set of internal page urls it links to
  {
    const r = report.rule('links', 'NFR-1', 'Links have a name, and every link and file reaches something that exists');
    for (const p of pages) {
      const out = new Set();
      links.set(p.url, out);
      for (const a of find(p.root, 'a')) {
        const href = a.attrs.href;
        const name = clean(nameOf(a));
        const label = `"${name || href}"`;
        r.check(Boolean(href) && href !== '#', p.url, `A link (${label}) goes nowhere.`);
        if (!href || href === '#') continue;
        r.check(Boolean(name), p.url, `A link to ${href} has no text or label.`);
        if (VAGUE_LINK.test(name)) r.warn(p.url, `The link text "${name}" does not say where the link goes.`);
        if (a.attrs.target === '_blank') r.check(/noopener/.test(a.attrs.rel ?? ''), p.url, `A link that opens a new tab (${href}) needs rel="noopener".`);
        if (/^mailto:/i.test(href)) {
          r.check(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+(\?.*)?$/i.test(href), p.url, `The email link ${href} is not a valid address.`);
        } else if (/^tel:/i.test(href)) {
          r.check(/^tel:\+?[\d\s().-]{5,}$/i.test(href), p.url, `The phone link ${href} is not a valid number.`);
        } else if (isExternal(href)) {
          r.check(/^https:\/\//i.test(href), p.url, `The link ${href} does not use https.`);
          if (siteHost && new URL(href, 'https://x').host === siteHost) {
            const t = resolveInternal(p, new URL(href).pathname);
            if (t.file) out.add(urlOf(t.file));
          }
        } else if (href.startsWith('#')) {
          r.check(p.ids.has(decodeURIComponent(href.slice(1))), p.url, `The link ${href} points to a part of the page that does not exist.`);
        } else {
          if (preview && !p.url.startsWith('/404') && /^\/(?!\/)/.test(href)) r.check(false, p.url, `The preview build must use relative links, but this one starts with "/": ${href}`);
          if (SERVER_ROUTES.test(new URL(href, `http://local/${p.file}`).pathname)) continue;
          const t = resolveInternal(p, href);
          if (!r.check(Boolean(t.file), p.url, `The link ${href} leads to ${t.path}, which is not in the built site.`)) continue;
          out.add(urlOf(t.file));
          if (t.fragment && byFile.has(t.file)) r.check(byFile.get(t.file).ids.has(t.fragment), p.url, `The link ${href} points to "#${t.fragment}", which is not on that page.`);
        }
      }
      // files the page loads
      for (const n of walk(p.root)) {
        if (n.type !== 'el') continue;
        const ref = n.tag === 'link' ? n.attrs.href : ['img', 'script', 'source'].includes(n.tag) ? n.attrs.src : null;
        if (!ref || isExternal(ref) || ref.startsWith('data:')) continue;
        const t = resolveInternal(p, ref);
        r.check(Boolean(t.file), p.url, `The page loads ${ref}, which is not in the built site.`);
      }
    }
  }
  {
    const r = report.rule('reachable', 'NFR-1', 'Every page can be reached by following links from the home page');
    const seen = new Set(['/']);
    const queue = ['/'];
    while (queue.length) {
      for (const to of links.get(queue.shift()) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    for (const p of pages) r.check(seen.has(p.url) || REACHED_BY_SERVER.has(p.url), p.url, 'No page links here, so visitors cannot find it.');
  }

  // ---- forms -----------------------------------------------------------------------------------
  {
    const r = report.rule('forms', 'NFR-1, NFR-4', 'Forms have labelled fields and the spam traps, and post to the server');
    for (const p of pages) {
      for (const f of find(p.root, 'form')) {
        const id = f.attrs.id ?? 'form';
        r.check((f.attrs.method ?? '').toLowerCase() === 'post', p.url, `The ${id} form does not use method="post".`);
        const action = f.attrs.action ? new URL(f.attrs.action, `http://local/${p.file}`).pathname : '';
        r.check(FORM_ENDPOINTS.has(action), p.url, `The ${id} form sends to "${f.attrs.action}", which is not one of the server's form addresses.`);
        const controls = find(f, (n) => ['input', 'select', 'textarea'].includes(n.tag) && !['hidden', 'submit', 'button'].includes((n.attrs.type ?? '').toLowerCase()));
        const labels = find(f, 'label');
        for (const c of controls) {
          const named = clean(c.attrs['aria-label'] ?? '') || labels.some((l) => (c.attrs.id && l.attrs.for === c.attrs.id) || ancestors(c).includes(l));
          r.check(Boolean(named), p.url, `A field in the ${id} form has no label: ${c.attrs.name ?? c.tag}.`);
          if (c.attrs.placeholder) r.warn(p.url, `The "${c.attrs.name}" field uses a placeholder; placeholders disappear as people type, so a visible label must carry the meaning.`);
          if (c.attrs.name === 'email') r.check(c.attrs.autocomplete === 'email' && c.attrs.type === 'email', p.url, `The email field in ${id} needs type="email" and autocomplete="email".`);
          if (c.attrs.name === 'name') r.check(c.attrs.autocomplete === 'name', p.url, `The name field in ${id} needs autocomplete="name".`);
        }
        const trap = controls.find((c) => c.attrs.name === 'website');
        r.check(Boolean(trap) && trap.attrs.tabindex === '-1' && ancestors(trap).some((a) => a.attrs['aria-hidden'] === 'true'), p.url, `The ${id} form is missing its hidden spam-trap field (hidden from people, tabindex -1).`);
        r.check(find(f, (n) => n.tag === 'input' && n.attrs.name === 'ts' && n.attrs.type === 'hidden').length === 1, p.url, `The ${id} form is missing the hidden "ts" timing field.`);
        r.check(find(f, (n) => n.tag === 'button' && (n.attrs.type ?? 'submit') === 'submit').length >= 1, p.url, `The ${id} form has no submit button.`);
      }
    }
  }
  {
    const r = report.rule('tables', 'NFR-1', 'Tables have a caption and header cells');
    for (const p of pages) {
      for (const t of find(p.root, 'table')) {
        const caption = t.children.some((c) => c.tag === 'caption' && clean(textOf(c)));
        r.check(caption || Boolean(t.attrs['aria-label'] || t.attrs['aria-labelledby']), p.url, 'A table has no caption or label.');
        r.check(find(t, (n) => n.tag === 'th' && (n.attrs.scope || n.attrs.role)).length > 0, p.url, 'A table has no header cells with a scope.');
      }
    }
  }
  {
    const r = report.rule('times', 'PUB-2', 'Every date and time is machine-readable, and a clock time always names its time zone');
    for (const p of pages) {
      for (const t of find(p.root, 'time')) {
        const shown = clean(textOf(t));
        r.check(!Number.isNaN(Date.parse(t.attrs.datetime ?? '')), p.url, `A <time> has an unreadable datetime "${t.attrs.datetime ?? ''}".`);
        if (/\d{1,2}:\d{2}/.test(shown)) r.check(/\d{1,2}:\d{2}\s*(?:[AP]M)?\s+\S+/i.test(shown), p.url, `The time "${shown}" does not name its time zone.`);
      }
    }
  }
  {
    const r = report.rule('text', 'PUB-1..PUB-11', 'No leftover template or Markdown text on any page');
    for (const p of pages) {
      const body = find(p.root, 'body')[0];
      const shown = clean(textOf(body));
      for (const [re, what] of [[/\bundefined\b/, '"undefined"'], [/\bNaN\b/, '"NaN"'], [/\[object Object\]/, '"[object Object]"'], [/\bInvalid Date\b/, '"Invalid Date"'], [/\bnull\b/, '"null"'], [/\{\{|\}\}/, 'template braces'], [/(^|\s)#{1,6}\s\w/, 'a Markdown heading marker'], [/\*\*\w/, 'Markdown bold markers'], [/\]\(/, 'Markdown link syntax']]) {
        r.check(!re.test(shown), p.url, `The page shows ${what} as text.`);
      }
    }
  }

  // ---- security and privacy (NFR-3, NFR-4) -------------------------------------------------------
  {
    const r = report.rule('csp', 'NFR-3, NFR-4', 'Nothing inline and nothing from another site, so the strict content policy holds');
    const bootHash = `sha256-${createHash('sha256').update(BOOT_SNIPPET).digest('base64')}`;
    const headers = text('_headers');
    r.check(headers.includes("script-src 'self' '" + bootHash + "'") && !/unsafe-(inline|eval)/.test(headers), '_headers', 'The content policy must allow only this site\'s scripts and the one hashed boot snippet.');
    r.check(/frame-ancestors 'none'/.test(headers) && /X-Content-Type-Options: nosniff/.test(headers), '_headers', 'The headers file is missing frame-ancestors or nosniff.');
    r.check(production ? /Strict-Transport-Security/.test(headers) : true, '_headers', 'A production build must send Strict-Transport-Security.');
    for (const p of pages) {
      let inlineScripts = 0;
      for (const n of walk(p.root)) {
        if (n.type !== 'el') continue;
        r.check(n.attrs.style === undefined, p.url, `<${n.tag}> has an inline style, which the content policy blocks.`);
        const handler = Object.keys(n.attrs).find((k) => /^on/.test(k));
        r.check(!handler, p.url, `<${n.tag}> has an inline ${handler} handler, which the content policy blocks.`);
        if (n.tag === 'script' && !n.attrs.src && n.attrs.type !== 'application/ld+json') {
          inlineScripts += 1;
          r.check(rawText(n) === BOOT_SNIPPET, p.url, 'An inline script is not the known boot snippet, so the content policy would block it.');
        }
        const fetched = n.tag === 'link' && /stylesheet|icon|preload|modulepreload|prefetch/.test(n.attrs.rel ?? '') ? n.attrs.href : ['script', 'img', 'source', 'iframe', 'video', 'audio', 'track', 'embed', 'object'].includes(n.tag) ? n.attrs.src : n.tag === 'form' ? n.attrs.action : null;
        if (fetched && isExternal(fetched)) r.check(Boolean(siteHost) && new URL(fetched, 'https://x').host === siteHost, p.url, `The page loads ${fetched} from another site.`);
        if (n.tag === 'iframe') r.check(false, p.url, 'The page embeds a frame.');
      }
      r.check(inlineScripts <= 1, p.url, `The page has ${inlineScripts} inline scripts; only the boot snippet is allowed.`);
    }
    const css = text('assets/site.css');
    r.check(!/@import|url\(\s*["']?(https?:)?\/\//i.test(css), 'assets/site.css', 'The stylesheet loads something from another site.');
    for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (m[1].startsWith('data:')) continue;
      r.check(files.has(posix.normalize(posix.join('assets', m[1].replace(/^\.\//, '')))) || files.has(m[1].replace(/^\//, '')), 'assets/site.css', `The stylesheet refers to ${m[1]}, which is not in the built site.`);
    }
    const js = text('assets/site.js');
    r.check(!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(js), 'assets/site.js', 'The script uses eval, new Function or document.write.');
    r.check(!/fetch\(|XMLHttpRequest|sendBeacon|navigator\.geolocation/.test(js), 'assets/site.js', 'The script makes network requests or reads location without asking; review it against NFR-3.');
  }

  // ---- caching (NFR-6) ----------------------------------------------------------------------------
  // Everything under /assets/ is cached for a year and never rechecked. If the stylesheet, the logo or a share image
  // changed under the same address, returning visitors would keep the old one. So each must carry ?v=<fingerprint>.
  // Fonts are exempt: they never change, and a replaced font must get a new file name (see docs/decisions.md).
  {
    const r = report.rule('caching', 'NFR-6', 'Files cached for a year have an address that changes when the file changes');
    const versioned = (href) => /[?&]v=[0-9a-f]{6,}(&|$)/.test(href);
    for (const p of pages) {
      const refs = [];
      for (const n of walk(p.root)) {
        if (n.type !== 'el') continue;
        if (n.tag === 'link' && /stylesheet|icon/.test(n.attrs.rel ?? '') && n.attrs.href) refs.push(n.attrs.href);
        if ((n.tag === 'script' || n.tag === 'img') && n.attrs.src) refs.push(n.attrs.src);
        if (n.tag === 'meta' && n.attrs.property === 'og:image' && n.attrs.content) refs.push(n.attrs.content);
      }
      for (const href of refs) {
        if (href.startsWith('data:')) continue;
        let path;
        try {
          path = decodeURIComponent(new URL(href, `http://local/${p.file}`).pathname).slice(1);
        } catch {
          continue;
        }
        if (!path.startsWith('assets/') || path.startsWith('assets/fonts/')) continue;
        r.check(versioned(href), p.url, `${href} is cached for a year but its address has no version, so a changed file would not reach returning visitors. Add ?v= and a fingerprint of the file.`);
      }
    }
  }

  // ---- search engines and sharing (NFR-11) -------------------------------------------------------
  {
    const r = report.rule('indexing', 'NFR-11', production ? 'Public pages can be indexed, private ones cannot, and the sitemap matches' : 'A staging or preview build asks search engines to stay away');
    const robots = text('robots.txt');
    if (!production) {
      for (const p of pages) r.check(isNoindex(p), p.url, 'A non-production page must carry <meta name="robots" content="noindex">.');
      r.check(/Disallow:\s*\/\s*$/m.test(robots), 'robots.txt', 'robots.txt must disallow everything outside production.');
      r.check(!files.has('sitemap.xml'), 'sitemap.xml', 'There should be no sitemap outside production.');
    } else {
      const sitemap = text('sitemap.xml');
      const listed = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')));
      r.check(/^Sitemap:\s*https:\/\//m.test(robots) && !/Disallow:\s*\/\s*$/m.test(robots), 'robots.txt', 'robots.txt must allow crawling and name the sitemap (https).');
      for (const p of pages) {
        const canon = find(p.root, (n) => n.tag === 'link' && n.attrs.rel === 'canonical')[0]?.attrs.href;
        if (isNoindex(p)) {
          r.check(!listed.has(siteUrl + p.url), p.url, 'A page marked noindex is listed in the sitemap.');
        } else {
          r.check(canon === siteUrl + p.url, p.url, `The canonical link is "${canon ?? 'missing'}", expected "${siteUrl + p.url}".`);
          r.check(listed.has(siteUrl + p.url), p.url, 'An indexable page is missing from the sitemap.');
        }
      }
      for (const loc of listed) r.check(loc.startsWith('https://') && pages.some((p) => siteUrl + p.url === loc), 'sitemap.xml', `The sitemap lists ${loc}, which is not a built page.`);
    }
  }
  {
    const r = report.rule('sharing', 'NFR-11', 'Every page has social-share information');
    for (const p of pages) {
      for (const k of ['og:title', 'og:description', 'og:type', 'og:site_name']) r.check(Boolean(clean(metaOf(p.root, k, 'property')[0] ?? '')), p.url, `Missing <meta property="${k}">.`);
      r.check(find(p.root, (n) => n.tag === 'link' && n.attrs.rel === 'icon').length === 1, p.url, 'Missing the site icon link.');
      r.check(find(p.root, (n) => n.tag === 'meta' && n.attrs.name === 'viewport' && /width=device-width/.test(n.attrs.content ?? '')).length === 1, p.url, 'Missing the mobile viewport setting.');
      if (production || siteUrl) {
        r.check(/^https:\/\//.test(metaOf(p.root, 'og:image', 'property')[0] ?? ''), p.url, 'The share image must be an absolute https address.');
        r.check(Boolean(metaOf(p.root, 'og:image:alt', 'property')[0]), p.url, 'The share image has no alt text.');
      }
    }
    if (!production && !siteUrl) r.warn('content/site.json', 'No "siteUrl" is set, so share previews have no image yet. A production build requires it.');
    const feed = text('feed.xml');
    const newsPages = pages.filter((p) => /^\/news\/[^/]+\/$/.test(p.url));
    r.check((feed.match(/<entry>/g) ?? []).length === newsPages.length, 'feed.xml', `The news feed has ${(feed.match(/<entry>/g) ?? []).length} entries but the site has ${newsPages.length} news pages.`);
    if (production) r.check(!/<id>\/|href="\//.test(feed), 'feed.xml', 'The feed must use absolute https addresses.');
  }

  // ---- what a production build must not contain ---------------------------------------------------
  if (production) {
    const r = report.rule('no-samples', 'PUB-1..PUB-11', 'No sample content, placeholders or staging notes in a production build');
    r.check(buildInfo.sampleFiles.length === 0 && buildInfo.stubPages.length === 0 && buildInfo.placeholderFiles.length === 0, 'build-report.json', 'The build report still lists sample, stub or placeholder files.');
    for (const p of pages) {
      r.check(!/class="placeholder"|\[\[|sample-tag|class="strip"|Staging preview|example\.invalid/.test(p.src), p.url, 'The page still shows a placeholder, sample note or staging notice.');
    }
  }

  // ---- weight (NFR-6) --------------------------------------------------------------------------
  const weight = { pages: [], css: 0, js: 0, fonts: 0 };
  {
    const r = report.rule('weight', 'NFR-6', 'Pages stay light enough for a phone on a slow connection');
    const css = gz(read('assets/site.css'));
    const js = gz(read('assets/site.js'));
    const fonts = [...files].filter((f) => f.startsWith('assets/fonts/') && /\.woff2?$/.test(f));
    const fontBytes = fonts.reduce((s, f) => s + read(f).length, 0);
    for (const face of text('assets/site.css').matchAll(/@font-face\s*\{[^}]*\}/g)) {
      r.check(/font-display:\s*(optional|swap|fallback)/.test(face[0]), 'assets/site.css', `A font face sets no font-display, so text can stay invisible while it loads: ${face[0].slice(0, 70)}`);
    }
    r.check(css <= BUDGET.css, 'assets/site.css', `The stylesheet is ${kb(css)} compressed; the budget is ${kb(BUDGET.css)}.`);
    r.check(js <= BUDGET.js, 'assets/site.js', `The script is ${kb(js)} compressed; the budget is ${kb(BUDGET.js)}.`);
    r.check(fontBytes <= BUDGET.fonts, 'assets/fonts', `The fonts are ${kb(fontBytes)}; the budget is ${kb(BUDGET.fonts)}.`);
    for (const p of pages) {
      const html = gz(Buffer.from(p.src));
      const preloaded = find(p.root, (n) => n.tag === 'link' && n.attrs.rel === 'preload' && n.attrs.as === 'font').reduce((s, n) => {
        const t = resolveInternal(p, n.attrs.href);
        return s + (t.file ? read(t.file).length : 0);
      }, 0);
      const first = html + css + js + preloaded;
      weight.pages.push({ url: p.url, html, first });
      r.check(html <= BUDGET.html, p.url, `The page is ${kb(html)} compressed; the budget is ${kb(BUDGET.html)}.`);
      r.check(first <= BUDGET.firstView, p.url, `First view is ${kb(first)} (page, styles, script and preloaded fonts); the budget is ${kb(BUDGET.firstView)}.`);
    }
    Object.assign(weight, { css, js, fonts: fontBytes });
  }

  return { report, mode, pages: pages.length, weight };
}

// ---- command line ----------------------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--dist');
  const dist = resolve(i > -1 ? args[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  if (!existsSync(join(dist, 'index.html')) || !statSync(dist).isDirectory()) {
    console.error(`There is no built site in ${dist}. Run "npm run build" first.`);
    process.exit(2);
  }
  const { report, mode, pages, weight } = checkSite({ dist });
  console.log(`Checked ${pages} pages in ${dist} (${mode} build)\n`);
  for (const r of report.rules.values()) {
    const state = r.problems.length ? 'FAIL' : 'pass';
    console.log(`  ${state}  ${r.title}  [${r.req}]  ${r.checked} checks${r.problems.length ? `, ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}` : ''}`);
  }
  const top = (list, n = 40) => list.slice(0, n);
  if (report.problems.length) {
    console.log(`\n${report.problems.length} problem${report.problems.length === 1 ? '' : 's'}:\n`);
    for (const p of top(report.problems)) console.log(`  ${p.where}  (${p.rule})\n    ${p.message}`);
    if (report.problems.length > 40) console.log(`\n  ...and ${report.problems.length - 40} more.`);
  }
  if (report.warnings.length) {
    console.log(`\n${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'} (these do not fail the check):\n`);
    for (const w of top(report.warnings, 15)) console.log(`  ${w.where}\n    ${w.message}`);
  }
  const heaviest = [...weight.pages].sort((a, b) => b.first - a.first)[0];
  console.log(`\nWeight after compression: styles ${kb(weight.css)}, script ${kb(weight.js)}, fonts ${kb(weight.fonts)}. Heaviest first view: ${heaviest.url} at ${kb(heaviest.first)} (budget ${kb(BUDGET.firstView)}).`);
  process.exit(report.problems.length ? 1 : 0);
}
