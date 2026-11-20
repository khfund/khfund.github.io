// Small pieces: the content reader, dates and deadlines, link building, Markdown safety, colour contrast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontMatter } from '../src/lib/frontmatter.mjs';
import { zonedToUtc, programState, closesAt, makeFormatters } from '../src/lib/dates.mjs';
import { makeLinker } from '../src/lib/url.mjs';
import { renderMarkdown, splitFaq, slugify } from '../src/lib/markdown.mjs';
import { html, raw, ph, esc } from '../src/lib/html.mjs';
import { ratio, hex2rgb, checkBrand, PAIRS } from '../src/lib/contrast.mjs';
import { securityHeaders, headersFile, bootHash } from '../src/lib/security.mjs';
import { CONTACT_TOPICS, PARTNER_INTERESTS } from '../src/lib/formspec.mjs';
import { icon, ICON_NAMES } from '../src/icons.mjs';
import { ROOT } from './lib/fixture.mjs';

const iso = (d) => d.toISOString();

test.describe('front matter', () => {
  test('reads text, numbers, true/false and lists', () => {
    const { data, body } = parseFrontMatter('---\ntitle: Hello there\ncount: 12\nratio: 0.5\nyes: true\nno: false\nitems:\n  - one\n  - "two: with colon"\n---\nBody text\n');
    assert.deepEqual(data, { title: 'Hello there', count: 12, ratio: 0.5, yes: true, no: false, items: ['one', 'two: with colon'] });
    assert.equal(body, 'Body text\n');
  });
  test('a date stays text, so it is not shifted by a time zone', () => {
    assert.equal(parseFrontMatter('---\ndate: 2026-09-01\n---\n').data.date, '2026-09-01');
  });
  test('quoted text keeps symbols and escaped quotes', () => {
    assert.equal(parseFrontMatter('---\na: "He said \\"hi\\": ok"\nb: \'single: quoted\'\n---\n').data.a, 'He said "hi": ok');
    assert.equal(parseFrontMatter('---\nb: \'single: quoted\'\n---\n').data.b, 'single: quoted');
  });
  test('works with Windows line endings and comments', () => {
    const { data, body } = parseFrontMatter('---\r\n# a note\r\ntitle: A\r\nitems:\r\n  - x\r\n---\r\nText');
    assert.deepEqual(data, { title: 'A', items: ['x'] });
    assert.equal(body, 'Text');
  });
  test('a file without front matter is all body', () => {
    assert.deepEqual(parseFrontMatter('Just text'), { data: {}, body: 'Just text' });
  });
  test('a line it cannot read gives a message that names the file and the line', () => {
    assert.throws(() => parseFrontMatter('---\ntitle: ok\nthis line is wrong\n---\n', 'content/pages/x.md'), /content\/pages\/x\.md: front matter line 3 is not understood/);
  });
  test('a list can hold small inline maps: numbers, dates, text, true/false, and quoted text with commas or quotes', () => {
    const { data } = parseFrontMatter('---\nrows:\n  - { date: 2025-12-18, direction: in, label: Year-end appeal, amount: 24300 }\n  - { label: "Gift, in kind", amount: 1200.5, flag: true }\n  - { a: \'one\', b: "say \\"hi\\"" }\n  - {a: 1,b: two}\n---\n');
    assert.deepEqual(data.rows, [
      { date: '2025-12-18', direction: 'in', label: 'Year-end appeal', amount: 24300 },
      { label: 'Gift, in kind', amount: 1200.5, flag: true },
      { a: 'one', b: 'say "hi"' },
      { a: 1, b: 'two' },
    ]);
  });
  test('an inline map keeps its date as text, and Windows line endings do not matter', () => {
    const { data } = parseFrontMatter('---\r\nrows:\r\n  - { date: 2026-01-05, n: 3 }\r\n---\r\n');
    assert.deepEqual(data.rows, [{ date: '2026-01-05', n: 3 }]);
  });
  test('an inline map that is not closed, or has no key, says what is wrong, where, and how to write it', () => {
    for (const bad of ['{ a: 1', '{ a 1 }', '{ a: "never closed }', '{ : 1 }']) {
      assert.throws(
        () => parseFrontMatter(`---\nrows:\n  - ${bad}\n---\n`, 'content/reports/x.md'),
        /content\/reports\/x\.md: front matter line 3 is not understood.*Write an inline item as \{ key: value, key: value \}.*quotes around text that contains a comma/,
        bad,
      );
    }
  });
  test('plain list items still work beside the new kind, in separate lists', () => {
    const { data } = parseFrontMatter('---\nplain:\n  - one\n  - two\nmaps:\n  - { k: v }\n---\n');
    assert.deepEqual(data, { plain: ['one', 'two'], maps: [{ k: 'v' }] });
  });
});

test.describe('icons', () => {
  test('every icon is drawn on the same 24 x 24 grid and hidden from screen readers', () => {
    for (const name of ICON_NAMES) {
      assert.match(String(icon(name)), /^<svg class="ico" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">.+<\/svg>$/, name);
    }
  });
  test('the icons the home page uses all exist, so a program can pick any of them', () => {
    for (const name of ['cap', 'hardhat', 'chip', 'flask', 'book', 'heart', 'gift', 'building', 'users', 'globe', 'dollar', 'donation', 'moneyIn', 'moneyOut']) {
      assert.ok(ICON_NAMES.includes(name), name);
    }
  });
  test('an icon that does not exist is refused with the names that do', () => {
    assert.throws(() => icon('rocket'), /There is no icon called "rocket"\. The icons are: .*cap.*moneyIn/);
  });
});

test.describe('dates and deadlines', () => {
  const at = (local, tz) => iso(zonedToUtc(local, tz));
  test('UTC is taken as written', () => assert.equal(at('2027-03-31 23:59', 'UTC'), '2027-03-31T23:59:00.000Z'));
  test('a date alone means midnight', () => assert.equal(at('2027-03-31', 'UTC'), '2027-03-31T00:00:00.000Z'));
  test('a "T" between date and time is accepted', () => assert.equal(at('2027-03-31T08:30', 'UTC'), '2027-03-31T08:30:00.000Z'));
  test('winter and summer time in Europe', () => {
    assert.equal(at('2027-01-15 12:00', 'Europe/Warsaw'), '2027-01-15T11:00:00.000Z');
    assert.equal(at('2027-07-01 12:00', 'Europe/Warsaw'), '2027-07-01T10:00:00.000Z');
  });
  test('the day the clocks change', () => {
    assert.equal(at('2027-03-28 01:30', 'Europe/Warsaw'), '2027-03-28T00:30:00.000Z'); // still winter time
    assert.equal(at('2027-03-28 03:30', 'Europe/Warsaw'), '2027-03-28T01:30:00.000Z'); // already summer time
  });
  test('a clock time that does not exist moves forward; one that happens twice takes the first', () => {
    assert.equal(at('2027-03-14 02:30', 'America/New_York'), '2027-03-14T07:30:00.000Z');
    assert.equal(at('2027-11-07 01:30', 'America/New_York'), '2027-11-07T05:30:00.000Z');
  });
  test('southern hemisphere and half-hour zones', () => {
    assert.equal(at('2027-01-15 12:00', 'Australia/Sydney'), '2027-01-15T01:00:00.000Z');
    assert.equal(at('2027-07-15 12:00', 'Australia/Sydney'), '2027-07-15T02:00:00.000Z');
    assert.equal(at('2027-03-31 23:59', 'Asia/Kolkata'), '2027-03-31T18:29:00.000Z');
    assert.equal(at('2027-03-31 12:00', 'Asia/Kathmandu'), '2027-03-31T06:15:00.000Z');
  });
  test('text that is not a date is refused with the format to use', () => {
    assert.throws(() => zonedToUtc('31/03/2027', 'UTC'), /Write it as YYYY-MM-DD HH:mm/);
    assert.throws(() => zonedToUtc('tomorrow', 'UTC'), /is not a date/);
  });

  const program = { opensAt: zonedToUtc('2027-02-01 09:00', 'UTC'), deadlineAt: zonedToUtc('2027-03-31 23:59', 'UTC') };
  test('a program is upcoming, open, then closed', () => {
    assert.equal(programState(program, new Date('2027-01-31T23:59:59Z')), 'upcoming');
    assert.equal(programState(program, new Date('2027-02-01T09:00:00Z')), 'open');
    assert.equal(programState(program, new Date('2027-03-15T12:00:00Z')), 'open');
  });
  test('a deadline of 23:59 stays open until 23:59:59 and closes at midnight', () => {
    assert.equal(iso(closesAt(program)), '2027-04-01T00:00:00.000Z');
    assert.equal(programState(program, new Date('2027-03-31T23:59:30Z')), 'open');
    assert.equal(programState(program, new Date('2027-03-31T23:59:59.999Z')), 'open');
    assert.equal(programState(program, new Date('2027-04-01T00:00:00Z')), 'closed');
  });
  test('a rolling program (no deadline) is always open once it has opened', () => {
    assert.equal(programState({ opensAt: null, deadlineAt: null }, new Date('2099-01-01')), 'open');
    assert.equal(closesAt({ deadlineAt: null }), null);
  });

  test('a short date drops the year and shows the day as written, whatever the time zone', () => {
    for (const timezone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      const fmt = makeFormatters({ locale: 'en-US', timezone, currency: 'USD' });
      assert.equal(fmt.isoShort('2025-12-18'), 'Dec 18', timezone);
      assert.equal(fmt.isoShort('2025-12-31T23:30:00Z'), 'Dec 31', timezone);
      assert.equal(fmt.isoShort('2026-01-01'), 'Jan 1', timezone);
    }
  });
  test('formatting names the zone and keeps the money readable', () => {
    const f = makeFormatters({ locale: 'en-US', timezone: 'UTC', currency: 'USD' });
    assert.equal(f.money(5000), '$5,000');
    assert.equal(f.number(1240), '1,240');
    assert.equal(f.instantShort(new Date('2027-03-31T23:59:00Z')), 'March 31, 2027, 23:59 UTC');
    assert.equal(f.day(new Date('2027-03-31T23:59:00Z')), 'March 31, 2027');
    assert.equal(f.isoDate('2026-09-01'), 'September 1, 2026');
    assert.equal(f.isoMonth('2026-09-01'), 'September 2026');
    const w = makeFormatters({ locale: 'en-GB', timezone: 'Europe/Warsaw', currency: 'EUR' });
    assert.match(w.instant(new Date('2027-07-01T10:00:00Z')), /12:00 Central European Summer Time$/);
    assert.match(w.money(5000), /€5,000/);
  });
});

test.describe('links', () => {
  const clean = makeLinker('clean');
  const rel = makeLinker('relative');
  test('clean links stay as written; outside addresses are never changed', () => {
    assert.equal(clean('/programs/', '/about/'), '/about/');
    assert.equal(clean('/', '/finances/#2025'), '/finances/#2025');
    assert.equal(clean('/', 'https://example.org/x'), 'https://example.org/x');
    assert.equal(clean('/', 'mailto:a@b.org'), 'mailto:a@b.org');
    assert.equal(clean('/x/', '#top'), '#top');
  });
  test('relative links work from any depth', () => {
    assert.equal(rel('/', '/about/'), 'about/index.html');
    assert.equal(rel('/programs/', '/'), '../index.html');
    assert.equal(rel('/programs/a/', '/assets/site.css'), '../../assets/site.css');
    assert.equal(rel('/programs/a/', '/programs/b/'), '../b/index.html');
    assert.equal(rel('/', '/finances/#2025'), 'finances/index.html#2025');
    assert.equal(rel('/404.html', '/about/'), 'about/index.html');
    assert.equal(rel('/x/', 'https://example.org'), 'https://example.org');
    assert.equal(rel('/x/', '#top'), '#top');
  });
  test('every relative link lands on the same page as the clean link', () => {
    const pages = ['/', '/programs/', '/programs/a/', '/news/', '/news/2026/', '/apply/start/', '/404.html', '/contact/sent/'];
    const targets = [...pages, '/assets/site.css', '/files/report.pdf', '/favicon.svg'];
    const file = (p) => (p.endsWith('/') ? `${p}index.html` : p);
    for (const from of pages) {
      for (const to of targets) {
        const landed = new URL(rel(from, to), `http://h${file(from)}`).pathname;
        assert.equal(landed, file(to), `${from} -> ${to} gave ${rel(from, to)}`);
      }
    }
  });
});

test.describe('Markdown', () => {
  test('raw HTML in staff text is shown as text, never run', () => {
    const { html: out } = renderMarkdown('Hello <script>alert(1)</script> and <img src=x onerror=alert(1)>\n\n<div onclick="x">block</div>');
    assert.ok(!/<script|<img|<div/i.test(out), out);
    assert.match(out, /&lt;script&gt;/);
  });
  test('only ordinary link addresses become links', () => {
    const one = (md) => renderMarkdown(md).html.trim();
    assert.equal(one('[a](javascript:alert(1))'), '<p>a</p>');
    assert.equal(one('[b](JaVaScRiPt:x)'), '<p>b</p>');
    assert.equal(one('[c](data:text/html,x)'), '<p>c</p>');
    assert.equal(one('[d](vbscript:x)'), '<p>d</p>');
    assert.match(one('[e](https://x.org)'), /<a href="https:\/\/x\.org" rel="noopener noreferrer">e<\/a>/);
    assert.match(one('[f](mailto:a@b.org)'), /<a href="mailto:a@b\.org">f<\/a>/);
    assert.match(one('[g](#part)'), /<a href="#part">g<\/a>/);
    assert.match(one('[h](relative/page)'), /<a href="relative\/page">h<\/a>/);
  });
  test('site links go through the page\'s link builder', () => {
    assert.match(renderMarkdown('[x](/about/)', { link: (to) => `..${to}index.html` }).html, /href="..\/about\/index\.html"/);
  });
  test('headings move down so a page keeps one h1; every h2 gets a unique id and a contents entry', () => {
    const { html: out, toc } = renderMarkdown('# A\n\n## B\n\n## B\n\n### C\n', { offset: 1 });
    assert.match(out, /<h2 id="a">A<\/h2>/);
    assert.match(out, /<h3>B<\/h3>/);
    assert.deepEqual(toc, [{ id: 'a', text: 'A' }]);
    const two = renderMarkdown('## Same\n\n## Same\n');
    assert.deepEqual(two.toc.map((t) => t.id), ['same', 'same-2']);
    assert.equal(renderMarkdown('###### Deep', { offset: 3 }).html.trim(), '<h6>Deep</h6>');
  });
  test('[[placeholders]] are marked', () => {
    assert.match(renderMarkdown('Call [[phone number]] now').html, /<mark class="placeholder">phone number<\/mark>/);
  });
  test('slugs drop accents and symbols', () => {
    assert.equal(slugify('Café déjà vu!'), 'cafe-deja-vu');
    assert.equal(slugify('  --  '), 'section');
    assert.equal(slugify('Привет'), 'section');
  });
  test('FAQ files split at each question', () => {
    const faq = splitFaq('Intro text that is dropped\n\n## Who can apply?\nAnyone.\n\nReally.\n\n## When?\nSoon.\n');
    assert.deepEqual(faq, [{ q: 'Who can apply?', a: 'Anyone.\n\nReally.' }, { q: 'When?', a: 'Soon.' }]);
  });
});

test.describe('html builder', () => {
  test('everything interpolated is escaped', () => {
    assert.equal(String(html`<p title="${'"><script>'}">${'<b>&\'</b>'}</p>`), '<p title="&quot;&gt;&lt;script&gt;">&lt;b&gt;&amp;&#39;&lt;/b&gt;</p>');
  });
  test('built html is not escaped twice, arrays join, empty values vanish', () => {
    const inner = html`<i>${'a & b'}</i>`;
    assert.equal(String(html`<p>${inner}${[1, 2]}${null}${false}${undefined}</p>`), '<p><i>a &amp; b</i>12</p>');
  });
  test('raw is the only way to skip escaping', () => assert.equal(String(html`${raw('<b>x</b>')}`), '<b>x</b>'));
  test('placeholders are marked but their surroundings stay escaped', () => {
    assert.equal(String(ph('<i>[[x]]</i>')), '&lt;i&gt;<mark class="placeholder">x</mark>&lt;/i&gt;');
    assert.equal(esc('a"b'), 'a&quot;b');
  });
});

test.describe('colour contrast (NFR-1)', () => {
  test('the maths matches the WCAG examples', () => {
    assert.equal(ratio('#000000', '#FFFFFF').toFixed(2), '21.00');
    assert.equal(ratio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
    assert.equal(ratio('#767676', '#FFFFFF').toFixed(2), '4.54');
    assert.deepEqual(hex2rgb('#0E1A4B'), [14, 26, 75]);
    assert.throws(() => hex2rgb('blue'), /not a 6-digit hex color/);
  });
  const brand = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8')).brand;
  test('the Foundation palette passes every pair in light and dark', () => {
    const results = checkBrand(brand);
    assert.equal(results.length, PAIRS.length * 2);
    const failed = results.filter((r) => !r.ok).map((r) => `${r.theme}: ${r.label} ${r.ratio?.toFixed(2)}`);
    assert.deepEqual(failed, []);
  });
  test('a weak colour is reported with its ratio and the minimum', () => {
    const weak = structuredClone(brand);
    weak.light.ink = '#999999';
    const bad = checkBrand(weak).filter((r) => !r.ok);
    assert.ok(bad.length >= 1);
    assert.ok(bad.every((r) => r.theme === 'light' && r.ratio < r.min));
  });
  test('a missing colour or theme is reported, not ignored', () => {
    const noInk = structuredClone(brand);
    delete noInk.dark.ink;
    assert.ok(checkBrand(noInk).some((r) => !r.ok && /brand\.dark\.ink is missing/.test(r.note)));
    assert.ok(checkBrand({ light: brand.light }).some((r) => !r.ok && /brand\.dark is missing/.test(r.note)));
  });
});

test.describe('security headers (NFR-4)', () => {
  test('a strict policy that allows only this site and the one hashed boot script', () => {
    const h = securityHeaders({ https: true });
    const csp = h['Content-Security-Policy'];
    assert.match(csp, /default-src 'self'/);
    assert.ok(csp.includes(`script-src 'self' ${bootHash()}`));
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(!/unsafe-/.test(csp));
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.match(h['Strict-Transport-Security'], /max-age=63072000/);
  });
  test('HSTS only goes out when the site is served over HTTPS', () => {
    assert.equal(securityHeaders({ https: false })['Strict-Transport-Security'], undefined);
  });
  test('an analytics service is allowed only by its own origin, and only when configured', () => {
    const csp = securityHeaders({ analyticsSrc: 'https://stats.example/js/count.js' })['Content-Security-Policy'];
    assert.match(csp, /script-src 'self' 'sha256-[^']+' https:\/\/stats\.example(;|$)/);
    assert.match(csp, /connect-src 'self' https:\/\/stats\.example/);
    assert.ok(!/stats\.example/.test(securityHeaders({})['Content-Security-Policy']));
  });
  test('the headers file for static hosts repeats the rules and caches assets for a year', () => {
    const f = headersFile({ https: true });
    assert.match(f, /^\/\*\n {2}Content-Security-Policy: /);
    assert.match(f, /\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  });
});

test('form choices are listed once each', () => {
  assert.equal(new Set(CONTACT_TOPICS).size, CONTACT_TOPICS.length);
  assert.equal(new Set(PARTNER_INTERESTS).size, PARTNER_INTERESTS.length);
});
