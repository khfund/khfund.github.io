#!/usr/bin/env node
// Opens the built site in a real browser (Chromium), served by the real server with its real security
// headers, and checks what only a browser can show: layout at phone, tablet and desktop widths in light and
// dark, scripts off, keyboard use, tap-target size, text colour as actually drawn, the forms end to end, and
// how fast the first screen appears on a slow phone connection.
//
//   npm run check:render                     checks dist/
//   node scripts/check-render.mjs --shots shots/    also saves a screenshot of every page
//   node scripts/check-render.mjs --only speed,forms   runs just those parts: pages, nojs, menu, keyboard, spacing, hero, forced, forms, errors, speed
//
// Only Chromium (Chrome and Edge's engine) is installed in the build environment, so Safari and Firefox are
// not covered here. Exit code 0 = no problems, 1 = at least one.
import { mkdtempSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { createServer } from '../server/server.mjs';

// NFR-6: first content on screen in under 2.5 s on a mid-range phone over a typical mobile connection.
// Chrome's own Lighthouse tool calls this "slow 4G with a 4x slower processor", and so does this check.
export const SPEED = { lcpMs: 2500, cls: 0.1, downKbps: 1600, upKbps: 750, rttMs: 150, cpuSlowdown: 4 };

const VIEWPORTS = [
  { name: '320 wide (smallest phone)', width: 320, height: 640 },
  { name: '390 wide (phone)', width: 390, height: 844 },
  { name: '768 wide (tablet)', width: 768, height: 1024 },
  { name: '1280 wide (desktop)', width: 1280, height: 800 },
];
const KEY_PAGES = ['/', '/programs/undergraduate-award/', '/contact/', '/finances/'];
// The top of the home page changes layout at 40, 64 and 80rem (640, 1024 and 1280px), so it is checked just either side of
// each of those as well as at the usual widths.
const HERO_WIDTHS = [320, 390, 639, 640, 768, 1023, 1024, 1100, 1279, 1280, 1440, 1920];

const listPages = (dist, dir = dist) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return listPages(dist, full);
    if (!e.name.endsWith('.html')) return [];
    const rel = relative(dist, full).split(sep).join('/');
    return [rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`];
  }).sort();

// ---- code that runs inside the page -----------------------------------------------------------------
const inPage = {
  overflow: () => {
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= w + 1) return null;
    const wide = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') wide.push(`<${el.tagName.toLowerCase()}${el.className ? ` class="${String(el.className).split(' ')[0]}"` : ''}> reaches ${Math.round(r.right)}px`);
      if (wide.length >= 3) break;
    }
    return `The page scrolls sideways (${document.documentElement.scrollWidth}px of content in ${w}px). ${wide.join('; ')}`;
  },

  // The top of the home page: the headline and buttons in the middle and a card in each corner around them (a card of figures at
  // the top, a picture at the bottom), with the connector between the two pictures. The pictures are laid out by hand (donor
  // icons placed in em), so check that nothing overlaps, that their parts stay inside their card, that they carry no words,
  // that the figure cards are no bigger than the pictures, and, on a wide screen, that the lines join the three pictures
  // (and the two rails down the sides of the page) and never touch a figure card.
  hero: () => {
    const issues = [];
    const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const q = (sel) => document.querySelector(sel);
    const shown = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const rect = (el) => box(el.getBoundingClientRect());
    const touches = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
    const opaque = (c) => {
      let m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length < 4 || Number(p[3]) === 1; }
      m = /^color\(srgb ([^)]+)\)$/.exec(c);
      if (m) { const p = m[1].split(/[ /]+/).filter(Boolean); return p.length < 4 || Number(p[3]) === 1; }
      return false;
    };
    const copy = q('.hero-copy');
    if (!shown(copy)) return ['The headline and buttons are missing.'];
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const students = q('.stat-students');
    const money = q('.stat-money');
    const picS = q('.students');
    const picD = q('.donors');
    const flow = q('.flow');
    const named = [['the headline and buttons', copy], ['the students card', students], ['the donations card', money],
      ['the students picture', picS], ['the connector', flow], ['the donors picture', picD]]
      .filter(([, el]) => shown(el))
      .map(([name, el]) => [name, el, rect(el)]);
    for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) {
      if (touches(named[i][2], named[j][2])) issues.push(`${named[i][0]} overlaps ${named[j][0]}`);
    }

    const c = rect(copy);
    const cards = [['students', students], ['donations', money]].filter(([, el]) => shown(el)).map(([name, el]) => [name, rect(el)]);
    const corner = innerWidth >= 1024; // the four-corner arrangement starts at 64rem
    if (corner) {
      // a figure card in each top corner: beside the headline and level with its top
      for (const [name, b] of cards) {
        const left = (name === 'students') !== rtl;
        if (left ? b.r > c.l + 1 : b.l < c.r - 1) issues.push(`the ${name} card is not ${left ? 'left' : 'right'} of the headline`);
        if (Math.abs(b.t - c.t) > 8) issues.push(`the ${name} card is not level with the top of the headline`);
      }
      if (!shown(picS) || !shown(picD) || !shown(flow)) issues.push('a picture or the connector is missing on a wide screen');
      else {
        const ps = rect(picS);
        const pd = rect(picD);
        const f = rect(flow);
        // the pictures: a clear gap under their figure card, on one line with the connector at the bottom, the connector between them and clear of the buttons
        for (const [name, b] of cards) {
          const pic = name === 'students' ? ps : pd;
          if (pic.t < b.b + 16) issues.push(`the ${name} picture is too close under its card`);
        }
        if (Math.abs(ps.b - f.b) > 2 || Math.abs(pd.b - f.b) > 2) issues.push('the two pictures and the connector do not end on the same line');
        const [lo, hi] = rtl ? [pd, ps] : [ps, pd];
        if (!(lo.r < f.l && f.r < hi.l)) issues.push('the connector is not between the two pictures');
        if (f.t < c.b + 24) issues.push('the connector is too close to the buttons');
        if (lo.r > c.l + 1 || hi.l < c.r - 1) issues.push('a picture is not beside the headline');

        // the four corner cards are about one size: a figure card is no wider than the widest picture, nor much taller than the tallest
        const maxW = Math.max(ps.r - ps.l, pd.r - pd.l);
        const maxH = Math.max(ps.b - ps.t, pd.b - pd.t);
        for (const [name, b] of cards) {
          if (b.r - b.l > maxW + 2) issues.push(`the ${name} card is wider than the pictures`);
          if (b.b - b.t > maxH + 40) issues.push(`the ${name} card is much taller than the pictures`);
        }

        // the lines
        const ls = q('.link-start');
        const le = q('.link-end');
        const bs = q('.branch-start');
        const be = q('.branch-end');
        if (![ls, le, bs, be].every(shown)) issues.push('the lines between the pictures are missing on a wide screen');
        else {
          const mid = (b) => (b.t + b.b) / 2;
          const span = (a, z) => [Math.min(a, z), Math.max(a, z)];
          // a stretch of line runs from a picture's inner edge to the connector, level with both
          const stretch = (what, el, [from, to], pic) => {
            const b = rect(el);
            if (Math.abs(b.l - from) > 2 || Math.abs(b.r - to) > 2) issues.push(`the line between ${what} does not run from one to the other`);
            if (!(mid(b) > pic.t && mid(b) < pic.b && mid(b) > f.t && mid(b) < f.b)) issues.push(`the line between ${what} is not level with both`);
          };
          stretch('the students picture and the connector', ls, span(rtl ? ps.l : ps.r, rtl ? f.r : f.l), ps);
          stretch('the connector and the donors picture', le, span(rtl ? pd.r : pd.l, rtl ? f.l : f.r), pd);
          // the line out to the rail runs level with the stretch, and in under its (opaque) picture
          for (const [name, el, pic] of [['students', bs, ps], ['donors', be, pd]]) {
            const b = rect(el);
            const y = b.b - 0.7;
            if (!(y > pic.t && y < pic.b)) issues.push(`the line out to the ${name} picture does not meet it`);
            if (Math.abs(y - mid(rect(ls))) > 2) issues.push(`the line out to the ${name} picture is not level with the line to the connector`);
            const outerLeft = (name === 'students') !== rtl;
            if (outerLeft ? !(b.l < pic.l && b.r > pic.l + 8) : !(b.r > pic.r && b.l < pic.r - 8)) issues.push(`the line out to the ${name} picture does not run in under it`);
            const cs = getComputedStyle(el);
            if (!(Number(cs.zIndex) < 0)) issues.push('a line is drawn over the cards, not behind them');
          }
          for (const el of [ls, le, bs, be]) {
            if (getComputedStyle(el).pointerEvents !== 'none') issues.push('a line would catch clicks meant for the page');
            for (const [name, b] of cards) if (touches(rect(el), b)) issues.push(`a line touches the ${name} card`);
          }
          // the two rails down the sides of the page: outside the text, clear of the figure cards, and meeting the lines out to the pictures
          const home = q('.home-page');
          const hr = home.getBoundingClientRect();
          const rails = ['::before', '::after'].map((pseudo) => {
            const cs = getComputedStyle(home, pseudo);
            const l = hr.left + parseFloat(cs.left);
            return cs.content === 'none' || !Number.isFinite(l) ? null : { l, r: l + parseFloat(cs.width), z: Number(cs.zIndex), events: cs.pointerEvents };
          }).filter(Boolean).sort((a, z) => a.l - z.l);
          if (rails.length !== 2) issues.push('the two lines down the sides of the page are missing');
          else {
            for (const r of rails) {
              if (!(r.z < 0)) issues.push('a line down the side of the page is drawn over the page, not behind it');
              if (r.events !== 'none') issues.push('a line down the side of the page would catch clicks meant for the page');
              for (const [name, b] of cards) if (r.r > b.l - 16 && r.l < b.r + 16) issues.push(`a line down the side of the page runs right beside the ${name} card`);
            }
            const [bl, br] = [bs, be].map(rect).sort((a, z) => a.l - z.l);
            if (Math.abs(rails[0].l - bl.l) > 2 || Math.abs(rails[1].r - br.r) > 2) issues.push('the lines down the sides of the page do not meet the lines out to the pictures');
          }
        }
      }
    } else {
      // below 64rem: the headline and buttons, then the two figure cards under them, and no pictures
      if (cards.length === 2) {
        const [s, m] = cards.map(([, b]) => b);
        if (s.t < c.b - 1 || m.t < c.b - 1) issues.push('a figure card sits above the buttons on a narrow screen');
        if (s.t > m.t + 1 && s.l >= m.l - 1) issues.push('the students card comes after the donations card');
      }
      for (const sel of ['.students', '.donors', '.flow', '.branch', '.link']) {
        if ([...document.querySelectorAll(sel)].some(shown)) issues.push(`the ${sel} part of the picture shows on a screen too narrow for it`);
      }
    }

    // the headline block fits its space: a big headline must wrap, not run on into the cards beside it
    for (const el of [copy, copy.querySelector('h1'), copy.querySelector('.lede'), copy.querySelector('.actions')]) {
      if (el && el.scrollWidth > el.clientWidth + 1) { issues.push('the headline, its text or its buttons run wider than their space'); break; }
    }

    // words stay whole: nothing at the top of the page may break a long word in the middle just to fit (a line in a card, or a big headline)
    for (const el of [copy.querySelector('h1'), ...document.querySelectorAll('.stat-lines .name')]) {
      if (!el || !shown(el)) continue;
      const before = el.style.overflowWrap;
      el.style.overflowWrap = 'normal';
      const tooWide = el.scrollWidth > el.clientWidth + 1;
      el.style.overflowWrap = before;
      if (tooWide) {
        issues.push(`"${(el.firstChild?.textContent || el.textContent).trim().slice(0, 30)}" is too wide for its space, so a word is broken in the middle`);
        break;
      }
    }

    // the pictures and the lines: no words, hidden from screen readers
    for (const sel of ['.students', '.flow', '.donors', '.branch', '.link']) {
      for (const el of document.querySelectorAll(sel)) {
        if ((el.textContent || '').trim() !== '') issues.push(`the ${sel} part of the picture has words in it; it should be made of icons and lines only`);
        if (el.getAttribute('aria-hidden') !== 'true') issues.push(`the ${sel} part of the picture is not hidden from screen readers`);
      }
    }
    const net = q('.net');
    if (shown(net)) {
      const edge = rect(net);
      const parts = [];
      const core = q('.net-core');
      if (core) parts.push(['the centre icon', rect(core)]);
      document.querySelectorAll('.node .tile').forEach((tile, i) => parts.push([`donor icon ${i + 1}`, rect(tile)]));
      for (const [name, b] of parts) {
        if (b.l < edge.l + 1 || b.r > edge.r - 1 || b.t < edge.t + 1 || b.b > edge.b - 1) issues.push(`${name} sticks out of its card`);
      }
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        if (touches(parts[i][1], parts[j][1])) issues.push(`${parts[i][0]} overlaps ${parts[j][0]}`);
      }
    }

    // the cards are opaque, so the lines run behind them and never through them
    for (const [name, sel] of [['a figure card', '.stat'], ['the students picture', '.students'], ['the connector', '.flow'], ['the donors picture', '.net']]) {
      const el = q(sel);
      if (shown(el) && !opaque(getComputedStyle(el).backgroundColor)) issues.push(`${name} is see-through, so the lines would show through it`);
    }
    return issues;
  },

  // High-contrast (forced colours) mode throws away background colours and filters. A shape that is only a
  // background has to take a system colour, and every card and button has to keep an edge.
  forced: () => {
    const issues = [];
    const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const canvas = getComputedStyle(document.body).backgroundColor;
    for (const [sel, what] of [['.ruler i', 'a bar in the finances chart'], ['.key', 'a legend swatch'], ['.rail', 'a line in the flow picture']]) {
      for (const el of document.querySelectorAll(sel)) {
        if (shown(el) && getComputedStyle(el).backgroundColor === canvas) { issues.push(`${what} is the same colour as the page, so it disappears`); break; }
      }
    }
    for (const [sel, what] of [['.btn', 'a button'], ['.row', 'a program row'], ['.stat', 'a figure card'], ['.net', 'the donors picture'], ['.students', 'the students picture'], ['.flow', 'the connector'], ['.hub', 'the Khwarizmi tile'], ['.faq details', 'a question'], ['.steps li', 'a step']]) {
      const el = document.querySelector(sel);
      if (!el || !shown(el)) continue;
      const cs = getComputedStyle(el);
      if (!(parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none')) issues.push(`${what} has no edge`);
    }
    // the lines are left out in this mode: they are decoration, and the system's colours are for content
    for (const sel of ['.branch', '.link']) {
      for (const el of document.querySelectorAll(sel)) if (shown(el)) { issues.push('the decoration lines are still showing'); break; }
    }
    return issues;
  },

  // WCAG 2.5.8: a target is at least 24 x 24 px, or has enough space around it, or is a link inside a sentence.
  targets: () => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]';
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"]');
    };
    const items = [...document.querySelectorAll(sel)].filter(shown).map((el) => ({ el, r: el.getBoundingClientRect() }));
    const small = (t) => t.r.width < 24 || t.r.height < 24;
    const centre = (t) => [t.r.left + t.r.width / 2, t.r.top + t.r.height / 2];
    const gap = (a, b) => {
      // distance from a's centre to b's box (or b's own 24px circle when b is also small)
      const [x, y] = centre(a);
      if (small(b)) {
        const [bx, by] = centre(b);
        return Math.hypot(x - bx, y - by) - 12;
      }
      return Math.hypot(Math.max(b.r.left - x, 0, x - b.r.right), Math.max(b.r.top - y, 0, y - b.r.bottom));
    };
    const bad = [];
    for (const t of items.filter(small)) {
      const block = t.el.closest('p, li, dd, figcaption, td, blockquote, caption, h1, h2, h3');
      const ownText = (t.el.textContent || '').trim().length;
      const inSentence = getComputedStyle(t.el).display === 'inline' && block && (block.textContent || '').trim().length > ownText + 8;
      if (inSentence) continue;
      const crowded = items.some((o) => o !== t && !t.el.contains(o.el) && !o.el.contains(t.el) && gap(t, o) < 12);
      if (!crowded) continue;
      bad.push(`"${(t.el.textContent || t.el.getAttribute('aria-label') || t.el.name || t.el.tagName).trim().slice(0, 30)}" is ${Math.round(t.r.width)}x${Math.round(t.r.height)}px and close to another control`);
    }
    return bad.slice(0, 4);
  },

  // Text colour as drawn: the colour of each piece of text against the background behind it.
  contrast: () => {
    const parse = (c) => {
      let m = /^rgba?\(([^)]+)\)$/.exec(c);
      if (m) {
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
      }
      m = /^color\(srgb ([^)]+)\)$/.exec(c);
      if (m) {
        const p = m[1].split(/[ /]+/).map(Number);
        return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 };
      }
      return null;
    };
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none' || Number(cs.opacity) < 1) return null; // gradients and fades: cannot be read this way
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a === 1) break;
        }
      }
      return layers.reverse().reduce((under, l) => over(l, under), { r: 255, g: 255, b: 255, a: 1 });
    };
    const failures = [];
    let checked = 0;
    let skipped = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent.trim() || el.closest('script,style,[hidden],[aria-hidden="true"]')) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden') continue;
      const bg = backdrop(el);
      const fg = parse(cs.color);
      if (!bg || !fg) {
        skipped += 1;
        continue;
      }
      const text = over(fg, bg);
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (parseInt(cs.fontWeight, 10) >= 700 && size >= 18.66);
      checked += 1;
      if (ratio < (large ? 3 : 4.5)) failures.push(`"${node.textContent.trim().slice(0, 30)}" is ${ratio.toFixed(2)}:1 (needs ${large ? 3 : 4.5}:1) in <${el.tagName.toLowerCase()}${el.className ? ` class="${String(el.className).split(' ')[0]}"` : ''}>`);
    }
    return { failures: failures.slice(0, 4), checked, skipped };
  },

  focusState: () => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      what: `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 25)}"`,
      skip: el.classList.contains('skip'),
      outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
      inView: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
      field: el.name === 'website',
    };
  },
};

// ---- the run ------------------------------------------------------------------------------------------
export async function checkRender({ dist, shots = null, only = null, log = () => {} }) {
  const want = (name) => !only || only.includes(name);
  const results = new Map();
  const group = (id, title) => {
    const g = { id, title, checked: 0, problems: [] };
    results.set(id, g);
    return {
      ok: (n = 1) => { g.checked += n; },
      check: (cond, where, message) => {
        g.checked += 1;
        if (!cond) g.problems.push({ where, message });
        return cond;
      },
      note: (text) => { g.note = text; },
    };
  };
  const g = {
    overflow: group('overflow', 'No page scrolls sideways at any width, in light or dark (NFR-8)'),
    clean: group('clean', 'No console errors, blocked requests or security-policy violations on any page'),
    nojs: group('nojs', 'With scripts turned off every page still works: all links are visible and nothing overflows'),
    menu: group('menu', 'The menu button appears only when the links are hidden, opens, closes with Escape and returns focus'),
    keyboard: group('keyboard', 'Keyboard: the skip link comes first and works, every focused item shows a ring and stays on screen'),
    targets: group('targets', 'Buttons and links are big enough to tap, or have room around them (WCAG 2.5.8)'),
    contrast: group('contrast', 'Text colour against its background, as drawn, in light and dark (NFR-1)'),
    themes: group('themes', 'Light and dark follow the visitor\'s setting'),
    spacing: group('spacing', 'Text-spacing overrides (WCAG 1.4.12) do not break the layout at 320px'),
    hero: group('hero', 'The top of the home page: the headline, the four corner cards and the connector never overlap, the figure cards are no bigger than the pictures, the pictures have no words, and the lines join the three pictures but never touch a figure card, at every width'),
    forced: group('forced', 'In high-contrast (forced colours) mode, bars, lines and cards keep a visible shape'),
    motion: group('motion', 'Nothing moves by itself'),
    forms: group('forms', 'The forms work from a real browser: contact, sign-up, mistakes, the hidden trap'),
    closing: group('closing', 'A program page follows the clock when it loads: not open yet, open until the last second of the deadline minute, then closed (PUB-2)'),
    errors: group('errors', 'A wrong address shows the site\'s own 404 page'),
    speed: group('speed', `First screen under ${SPEED.lcpMs / 1000} s on a slow phone connection, and no jumping (NFR-6)`),
  };

  const dataDir = mkdtempSync(join(tmpdir(), 'foundation-render-'));
  const mail = [];
  const { server } = createServer({ dist, dataDir, log: () => {}, mail: { async send(m) { mail.push(m); } }, held: { async send() {} } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const pages = listPages(dist);
  const open = (context) => context.newPage();

  // Collects everything the browser complains about while a page loads.
  // `expect` lists status codes this page is supposed to receive (the 404 page, a refused form).
  const watch = (page, bucket, { expect = [] } = {}) => {
    const wanted = (text) => expect.some((code) => text.includes(`status of ${code}`));
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !wanted(m.text()) && bucket.push(`${m.type()} in the console: ${m.text().slice(0, 200)}`));
    page.on('pageerror', (e) => bucket.push(`script error: ${e.message}`));
    page.on('requestfailed', (r) => bucket.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => r.status() >= 400 && !expect.includes(r.status()) && bucket.push(`HTTP ${r.status()} for ${r.url()}`));
  };

  try {
    // 1. every page, every width, both colour schemes
    if (want('pages')) for (const scheme of ['light', 'dark']) {
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });
        const page = await open(context);
        const issues = [];
        watch(page, issues);
        let contrastChecked = 0;
        let contrastSkipped = 0;
        for (const path of pages) {
          issues.length = 0;
          await page.goto(base + path, { waitUntil: 'load' });
          const where = `${path}  (${vp.width}px, ${scheme})`;
          const over = await page.evaluate(inPage.overflow);
          g.overflow.check(!over, where, over ?? '');
          g.clean.check(issues.length === 0, where, issues.join('; '));
          const tooSmall = await page.evaluate(inPage.targets);
          g.targets.check(tooSmall.length === 0, where, tooSmall.join('; '));
          const c = await page.evaluate(inPage.contrast);
          g.contrast.check(c.failures.length === 0, where, c.failures.join('; '));
          contrastChecked += c.checked;
          contrastSkipped += c.skipped;
          g.motion.check((await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)) === 0, where, 'An animation is running without being asked for.');
          if (shots && (vp.width === 390 || vp.width === 1280)) await page.screenshot({ path: join(shots, `${path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '-')}-${vp.width}-${scheme}.png`), fullPage: true });
          if (path === '/' ) {
            const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            const dark = (bg.match(/\d+/g) ?? [255]).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3 < 80;
            g.themes.check(dark === (scheme === 'dark'), where, `The page background is ${bg} in ${scheme} mode.`);
          }
        }
        if (vp.width === 320 && scheme === 'light') g.contrast.note(`${contrastChecked} pieces of text checked per theme and width; ${contrastSkipped} sit on gradients or hatching and are covered by the build's colour-pair check instead.`);
        await context.close();
        log(`  ${scheme} ${vp.name}`);
      }
    }

    // 2. scripts off
    if (want('nojs')) {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, javaScriptEnabled: false });
      const page = await open(context);
      for (const path of pages) {
        await page.goto(base + path, { waitUntil: 'load' });
        const where = `${path}  (scripts off, 320px)`;
        const over = await page.evaluate(inPage.overflow);
        g.nojs.check(!over, where, over ?? '');
        const nav = await page.evaluate(() => {
          const links = [...document.querySelectorAll('#site-nav a')];
          return { n: links.length, hidden: links.filter((a) => !a.offsetParent).length, button: !!document.querySelector('.menu-btn')?.offsetParent };
        });
        g.nojs.check(nav.n > 0 && nav.hidden === 0 && !nav.button, where, `${nav.hidden} of ${nav.n} menu links are hidden${nav.button ? ' and a menu button that cannot work is showing' : ''}.`);
      }
      // the apply box still shows the right notice, chosen when the site was built
      await page.goto(`${base}/programs/undergraduate-award/`);
      g.nojs.check((await page.locator('.apply-box [data-when]:not([hidden])').count()) === 1, '/programs/undergraduate-award/', 'Exactly one of the open, upcoming and closed notices must show.');
      await context.close();
    }

    // 3. the menu button at each width
    if (want('menu')) for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await open(context);
      await page.goto(`${base}/`);
      const where = `/  (${vp.width}px)`;
      const btn = page.locator('.menu-btn');
      const nav = page.locator('#site-nav');
      const btnShown = await btn.isVisible();
      g.menu.check((await nav.locator('a').first().isVisible()) !== btnShown, where, btnShown ? 'The menu button is showing, but the links are visible too.' : 'The menu button is hidden and so are the links: visitors cannot reach any page.');
      if (btnShown) {
        g.menu.check((await btn.getAttribute('aria-expanded')) === 'false', where, 'The button must start with aria-expanded="false".');
        await btn.click();
        g.menu.check((await btn.getAttribute('aria-expanded')) === 'true' && (await nav.locator('a').first().isVisible()), where, 'Clicking the menu button does not open the links.');
        const small = await nav.locator('a, .btn').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 24).length);
        g.menu.check(small === 0, where, `${small} menu links are under 24px tall.`);
        g.menu.check(!(await page.evaluate(inPage.overflow)), where, 'The open menu makes the page scroll sideways.');
        await page.keyboard.press('Escape');
        g.menu.check((await btn.getAttribute('aria-expanded')) === 'false' && !(await nav.locator('a').first().isVisible()), where, 'Escape does not close the menu.');
        g.menu.check(await btn.evaluate((b) => b === document.activeElement), where, 'After Escape, keyboard focus does not return to the menu button.');
      }
      await context.close();
    }

    // 4. keyboard
    if (want('keyboard')) for (const scheme of ['light', 'dark']) {
      for (const width of [320, 1280]) {
        // reduced motion: the page scrolls smoothly otherwise, which delays the scroll that follows each Tab press
        const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await open(context);
        for (const path of KEY_PAGES) {
          await page.goto(base + path);
          const where = `${path}  (${width}px, ${scheme})`;
          await page.keyboard.press('Tab');
          const first = await page.evaluate(inPage.focusState);
          g.keyboard.check(first?.skip === true, where, `The first Tab stop is ${first?.what ?? 'nothing'}, not the skip link.`);
          g.keyboard.check(first?.skip && first.inView && first.outline, where, 'The skip link is not visible when it has focus.');
          await page.keyboard.press('Enter');
          g.keyboard.check(await page.evaluate(() => document.activeElement?.id === 'main'), where, 'The skip link does not move focus to the main content.');
          await page.reload();
          for (let i = 0; i < 18; i++) {
            await page.keyboard.press('Tab');
            const f = await page.evaluate(inPage.focusState);
            if (!f) break;
            g.keyboard.check(f.outline, where, `${f.what} has no visible focus ring.`);
            g.keyboard.check(f.inView, where, `${f.what} has focus but is not on screen.`);
            g.keyboard.check(!f.field, where, 'Keyboard focus reaches the hidden spam-trap field.');
          }
        }
        await context.close();
      }
    }

    // 5. text spacing overrides, at the smallest width
    if (want('spacing')) {
      // bypassCSP only lets this check add its own test stylesheet; the site's policy is checked everywhere else
      const context = await browser.newContext({ viewport: { width: 320, height: 640 }, bypassCSP: true });
      const page = await open(context);
      for (const path of pages) {
        await page.goto(base + path);
        await page.addStyleTag({ content: '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}' });
        const over = await page.evaluate(inPage.overflow);
        g.spacing.check(!over, `${path}  (320px)`, over ?? '');
      }
      await context.close();
    }

    // 5b. the home page picture, at every width, in light and dark
    if (want('hero')) for (const scheme of ['light', 'dark']) {
      for (const width of HERO_WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
        const page = await open(context);
        await page.goto(`${base}/`);
        const where = `/  (${width}px, ${scheme})`;
        const issues = await page.evaluate(inPage.hero);
        g.hero.check(issues.length === 0, where, issues.join('; '));
        await context.close();
      }
    }

    // 5c. high-contrast mode (the visitor's system replaces our colours)
    if (want('forced')) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, forcedColors: 'active' });
      const page = await open(context);
      for (const path of ['/', '/programs/', '/finances/', '/apply/']) {
        await page.goto(base + path);
        const where = `${path}  (forced colours)`;
        const issues = await page.evaluate(inPage.forced);
        g.forced.check(issues.length === 0, where, issues.join('; '));
        const over = await page.evaluate(inPage.overflow);
        g.forced.check(!over, where, over ?? '');
      }
      await context.close();
    }

    // 6. forms, end to end, on a phone
    if (want('forms')) {
      const context = await browser.newContext({ ...devices['Pixel 5'] });
      const page = await open(context);
      const issues = [];
      watch(page, issues, { expect: [422] });
      await page.goto(`${base}/contact/`);
      const loaded = Date.now();
      const trap = page.locator('#contact-form .hp input');
      const box = await trap.boundingBox();
      g.forms.check(!(await trap.isVisible()) || !box || box.x + box.width <= 0 || box.width <= 1, '/contact/', 'The hidden spam-trap field is visible to people.');
      await page.fill('#name', 'Amina Rahimi');
      await page.fill('#email', 'not-an-email');
      await page.selectOption('#topic', { index: 1 });
      await page.fill('#message', 'When does the next round of the Undergraduate Award open?');
      await page.click('form#contact-form button[type=submit]');
      g.forms.check(page.url().endsWith('/contact/') && (await page.evaluate(() => !document.getElementById('email').validity.valid)), '/contact/', 'A wrong email address was not stopped by the browser before sending.');
      await page.fill('#email', 'amina@example.org');
      await page.waitForTimeout(Math.max(0, 3300 - (Date.now() - loaded)));
      await Promise.all([page.waitForURL('**/contact/sent/'), page.click('form#contact-form button[type=submit]')]);
      g.forms.check(page.url().endsWith('/contact/sent/') && /message/i.test(await page.locator('h1').innerText()), '/contact/', 'Sending a valid message does not end on the thank-you page.');
      g.forms.check(mail.length === 1 && mail[0].replyTo === 'amina@example.org', '/contact/', 'The message did not reach the staff mailbox with the visitor as reply address.');

      // sent too fast: the server refuses, and the page explains what to do
      await page.goto(`${base}/contact/`);
      await page.fill('#name', 'Quick Sender');
      await page.fill('#email', 'quick@example.org');
      await page.selectOption('#topic', { index: 1 });
      await page.fill('#message', 'This is sent very quickly after the page loads.');
      const res = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/contact')), page.click('form#contact-form button[type=submit]')]);
      g.forms.check(res[0].status() === 422 && (await page.locator('h1').count()) === 1 && /quickly/i.test(await page.locator('main').innerText()), '/contact/', 'A form sent within seconds of loading does not get a clear message.');
      g.forms.check((await page.locator('main a').count()) > 0, '/form-error/', 'The error page has no link to get back to.');

      // newsletter: footer form, then the link in the email
      await page.goto(`${base}/`);
      await page.waitForTimeout(3300);
      await page.fill('#nl-email', 'student@example.org');
      await Promise.all([page.waitForURL('**/newsletter/check-your-email/'), page.click('#newsletter-form button[type=submit]')]);
      const link = /https?:\/\/\S+\/newsletter\/confirm\?token=\S+/.exec(mail.at(-1)?.text ?? '')?.[0];
      g.forms.check(Boolean(link), '/newsletter/', 'The sign-up did not produce a confirmation email with a link.');
      if (link) {
        await page.goto(link.replace(/^https?:\/\/[^/]+/, base));
        g.forms.check(page.url().endsWith('/newsletter/confirmed/'), '/newsletter/', 'The confirmation link does not end on the confirmation page.');
      }
      g.forms.check(issues.length === 0, 'forms', issues.join('; '));
      await context.close();
    }

    // 6b. a program page follows the clock when it loads (the build may be hours old)
    if (want('closing')) {
      const probe = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const first = await open(probe);
      await first.goto(`${base}/programs/undergraduate-award/`);
      const times = await first.evaluate(() => {
        const box = document.querySelector('.apply-box');
        return { opens: Date.parse(box.dataset.opens), closes: Date.parse(box.dataset.closes) };
      });
      await probe.close();
      g.closing.check(Number.isFinite(times.opens) && Number.isFinite(times.closes) && times.opens < times.closes, '/programs/undergraduate-award/', 'The apply box does not carry its opening and closing times.');
      const moments = [
        ['a minute before it opens', times.opens - 60_000, 'upcoming'],
        ['a second after it opens', times.opens + 1_000, 'open'],
        ['one second before it closes (the last second of the deadline minute)', times.closes - 1_000, 'open'],
        ['one second after it closes', times.closes + 1_000, 'closed'],
        ['a year later', times.closes + 365 * 24 * 3600_000, 'closed'],
      ];
      for (const [when, at, expected] of moments) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await open(context);
        await page.clock.setFixedTime(new Date(at));
        await page.goto(`${base}/programs/undergraduate-award/`);
        const shown = await page.evaluate(() => [...document.querySelectorAll('.apply-box [data-when]')].filter((b) => !b.hidden).map((b) => b.dataset.when));
        g.closing.check(shown.length === 1 && shown[0] === expected, `/programs/undergraduate-award/  (${when})`, `Showing "${shown.join(', ') || 'nothing'}" instead of "${expected}".`);
        const applyLinks = await page.locator('.apply-box a[href*="/apply/start/"]:visible').count();
        g.closing.check(applyLinks === (expected === 'open' ? 1 : 0), `/programs/undergraduate-award/  (${when})`, `${applyLinks} visible Apply buttons when the program is ${expected}.`);
        await context.close();
      }
    }

    // 7. a wrong address
    if (want('errors')) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await open(context);
      const issues = [];
      watch(page, issues, { expect: [404] });
      const res = await page.goto(`${base}/this/page/is/missing/`);
      g.errors.check(res.status() === 404, '/this/page/is/missing/', `Status ${res.status()} instead of 404.`);
      g.errors.check((await page.locator('h1').count()) === 1 && (await page.locator('#site-nav a').count()) > 0, '/this/page/is/missing/', 'The 404 page is not the site\'s own page.');
      await page.locator('main a').first().click();
      g.errors.check(new URL(page.url()).pathname !== '/this/page/is/missing/' && (await page.title()).length > 0, '/this/page/is/missing/', 'A link on the 404 page does not lead anywhere.');
      g.errors.check(issues.length === 0, '404', issues.join('; '));
      await context.close();
    }

    // 8. speed on a slow phone
    if (want('speed')) {
      const runs = 3;
      const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const measured = [];
      for (const path of ['/', '/programs/', '/programs/undergraduate-award/', '/finances/']) {
        const lcps = [];
        const clss = [];
        let bytes = 0;
        for (let i = 0; i < runs; i++) {
          const context = await browser.newContext({ ...devices['Pixel 5'] });
          const page = await open(context);
          await page.addInitScript(() => {
            window.__lcp = 0;
            window.__cls = 0;
            new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
            new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
          });
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: SPEED.rttMs, downloadThroughput: (SPEED.downKbps * 1024) / 8, uploadThroughput: (SPEED.upKbps * 1024) / 8 });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: SPEED.cpuSlowdown });
          let sent = 0;
          cdp.on('Network.loadingFinished', (e) => { sent += e.encodedDataLength; });
          await page.goto(base + path, { waitUntil: 'load' });
          await page.waitForTimeout(600);
          lcps.push(await page.evaluate(() => window.__lcp));
          clss.push(await page.evaluate(() => window.__cls));
          bytes = sent;
          await context.close();
        }
        measured.push({ path, lcp: median(lcps), cls: median(clss), kb: bytes / 1024 });
        g.speed.check(median(lcps) < SPEED.lcpMs, path, `The first content appears after ${Math.round(median(lcps))} ms on a slow phone connection; the target is ${SPEED.lcpMs} ms.`);
        g.speed.check(median(clss) <= SPEED.cls, path, `The layout shifts by ${median(clss).toFixed(3)} while loading; the limit is ${SPEED.cls}.`);
      }
      g.speed.note(measured.map((m) => `${m.path} ${Math.round(m.lcp)} ms, ${m.kb.toFixed(0)} KB, shift ${m.cls.toFixed(3)}`).join(' | '));
    }
  } finally {
    await browser.close();
    await new Promise((r) => { server.close(r); server.closeAllConnections(); });
    rmSync(dataDir, { recursive: true, force: true });
  }
  return { results, pages: pages.length };
}

// ---- command line -------------------------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const dist = resolve(opt('--dist') ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`There is no built site in ${dist}. Run "npm run build" first.`);
    process.exit(2);
  }
  const shots = opt('--shots') ? resolve(opt('--shots')) : null;
  if (shots) mkdirSync(shots, { recursive: true });
  console.log(`Opening the site in Chromium (${dist})\n`);
  const started = Date.now();
  const only = opt('--only') ? opt('--only').split(',') : null;
  const { results, pages } = await checkRender({ dist, shots, only, log: (l) => console.log(l) });
  console.log(`\nChecked ${pages} pages in ${Math.round((Date.now() - started) / 1000)} s\n`);
  let problems = 0;
  for (const r of [...results.values()].filter((x) => x.checked > 0 || x.problems.length)) {
    problems += r.problems.length;
    console.log(`  ${r.problems.length ? 'FAIL' : 'pass'}  ${r.title}  ${r.checked} checks${r.problems.length ? `, ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}` : ''}`);
    if (r.note) console.log(`        ${r.note}`);
  }
  for (const r of results.values()) {
    for (const p of r.problems.slice(0, 12)) console.log(`\n  ${p.where}  (${r.id})\n    ${p.message}`);
    if (r.problems.length > 12) console.log(`\n  ...and ${r.problems.length - 12} more under "${r.id}".`);
  }
  process.exit(problems ? 1 : 0);
}
