// The frame around every page: <head>, header and menu, footer, and the staging note.
import { html, raw, ph } from './lib/html.mjs';
import { BOOT_SNIPPET } from './templates/boot.mjs';
import { plain, newsletterForm } from './components.mjs';
import { icon } from './icons.mjs';

const FOOTER_NAV = [
  ['Programs', '/programs/'],
  ['How to apply', '/apply/'],
  ['Impact', '/impact/'],
  ['Finances', '/finances/'],
  ['News', '/news/'],
  ['About', '/about/'],
  ['Partner with us', '/partner/'],
  ['Contact', '/contact/'],
];
const LEGAL_NAV = [
  ['Privacy', '/privacy/'],
  ['Terms of use', '/terms/'],
  ['Accessibility', '/accessibility/'],
];

const abs = (c, path) => `${c.siteUrl}${path}`;

function head(c, pg, p) {
  const { site } = c;
  const name = plain(site.name);
  // The short name keeps the tab title short; the full name is still used for sharing and the feed.
  const brand = plain(site.shortName || site.name);
  const title = pg.path === '/' ? `${brand}: ${plain(pg.title)}` : `${plain(pg.title)} | ${brand}`;
  const description = plain(pg.description || site.description);
  const canonical = c.production && c.siteUrl ? abs(c, pg.path) : null;
  const v = c.assetVersion;
  const image = c.siteUrl ? `${abs(c, '/assets/og-default.png')}?v=${v}` : null;
  const light = site.brand.light;
  const dark = site.brand.dark;
  const jsonLd = pg.jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(pg.jsonLd).replace(/</g, '\\u003c')}</script>`) : '';
  return html`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${c.production && !pg.noindex ? '' : raw('<meta name="robots" content="noindex, nofollow">')}
${canonical ? raw(`<link rel="canonical" href="${canonical}">`) : ''}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${light.paper}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${dark.paper}" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${name}">
<meta property="og:title" content="${plain(pg.title)}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="${pg.ogType ?? 'website'}">
${canonical ? raw(`<meta property="og:url" content="${canonical}">`) : ''}
${image ? raw(`<meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${name}">`) : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="${p.L('/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${p.L('/assets/apple-touch-icon.png')}?v=${v}">
<link rel="alternate" type="application/atom+xml" href="${p.L('/feed.xml')}" title="News from ${name}">
<link rel="preload" href="${p.L('/assets/fonts/inter-regular.woff')}" as="font" type="font/woff" crossorigin>
<link rel="preload" href="${p.L('/assets/fonts/inter-bold.woff')}" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="${p.L('/assets/site.css')}?v=${v}">
<script>${raw(BOOT_SNIPPET)}</script>
${jsonLd}
</head>`;
}

function header(c, pg, p) {
  const { site } = c;
  const current = (to) => (pg.path === to || (to !== '/' && pg.path.startsWith(to)) ? raw(' aria-current="page"') : '');
  return html`<header class="site-header">
  <div class="wrap">
    <div class="bar">
      <a class="brand" href="${p.L('/')}"><img class="mark" src="${p.L('/assets/mark.svg')}?v=${c.assetVersion}" alt="" width="40" height="40"><span class="name">${ph(site.shortName)}</span></a>
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav id="site-nav" class="nav" aria-label="Main">
        <ul>${site.nav.map((n) => html`<li><a href="${p.L(n.to)}"${current(n.to)}>${n.label}</a></li>`)}</ul>
        <a class="btn small" href="${p.L('/donate/')}">${icon('heart')}Donate</a>
      </nav>
    </div>
  </div>
</header>`;
}

function footer(c, p) {
  const { site } = c;
  return html`<footer class="site-footer">
  <div class="wrap foot">
    <div class="foot-about">
      <p class="foot-name">${ph(site.name)}</p>
      <p>${ph(site.tagline)}</p>
      <p class="fine">${ph(site.legalLine)}<br>${ph(site.postalAddress)}</p>
    </div>
    <nav class="foot-nav" aria-label="Site">
      <ul>${FOOTER_NAV.map(([label, to]) => html`<li><a href="${p.L(to)}">${label}</a></li>`)}</ul>
    </nav>
    <div class="foot-news">
      <h2 class="foot-h">Get our news</h2>
      ${newsletterForm(c, p)}
    </div>
    <nav class="foot-legal" aria-label="Legal">
      <ul>${LEGAL_NAV.map(([label, to]) => html`<li><a href="${p.L(to)}">${label}</a></li>`)}</ul>
    </nav>
  </div>
</footer>`;
}

function strip(c) {
  if (!c.staging) return '';
  return html`<div class="strip" role="note"><div class="wrap"><strong>Staging preview.</strong> Names, numbers, dates and stories are samples, shown with a hatched background where the Foundation must supply them. A production build refuses them.${c.relative ? ' Forms only work when the site runs on its own server (npm start).' : ''}</div></div>`;
}

function consent(c, p) {
  if (!c.site.analytics?.enabled) return '';
  return html`<div class="consent" id="consent" role="region" aria-label="Analytics choice" hidden data-src="${c.site.analytics.scriptSrc}">
    <p>We would like to count visits with a tool that stores no personal data. It only runs if you agree.</p>
    <p class="actions"><button class="btn small" type="button" data-consent="yes">Allow counting visits</button> <button class="btn small secondary" type="button" data-consent="no">No thanks</button></p>
  </div>`;
}

export function renderDocument(c, pg) {
  // The 404 page can be shown at any address, so its links always start from the site root.
  const p = { path: pg.path, L: pg.rootLinks ? (to) => to : (to) => c.link(pg.path, to) };
  const main = typeof pg.render === 'function' ? pg.render(p) : pg.main;
  return (
    '<!doctype html>\n' +
    html`<html lang="${c.lang}">
${head(c, pg, p)}
<body>
<a class="skip" href="#main">Skip to main content</a>
${strip(c)}
${header(c, pg, p)}
<main id="main" tabindex="-1">
${main}
</main>
${footer(c, p)}
${consent(c, p)}
<script src="${p.L('/assets/site.js')}?v=${c.assetVersion}" defer></script>
</body>
</html>
`
  );
}
