// The rules staff content must follow, and the gates a build enforces: nothing sample or unfinished reaches
// a production site, stories need recorded consent, and mistakes are explained in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { loadContent } from '../src/content.mjs';
import { ROOT, makeRoot, changeFile, readSite, writeSite } from './lib/fixture.mjs';
import { checkSite } from './check-site.mjs';

const NOW = new Date('2026-11-08T10:00:00Z');
const tidy = [];
test.after(() => tidy.forEach((fn) => fn()));

// Builds a copy of the real content and returns what happened. `finished` replaces every sample first.
function tryBuild({ finished = true, production = true, relative = false, edit, now = NOW } = {}) {
  const t = makeRoot({ finished, edit });
  tidy.push(t.cleanup);
  const result = build({ root: t.root, out: t.out, production, relative, now });
  return { ...t, result, problems: result.problems ?? [], warnings: result.warnings ?? [] };
}
const load = (edit, opts = {}) => {
  const t = makeRoot({ finished: true, edit });
  tidy.push(t.cleanup);
  return loadContent(t.content, { now: NOW, ...opts });
};
const mentions = (list, re) => list.some((p) => re.test(p));

test.describe('the production gate', () => {
  test('refuses the sample site and says what to replace, in plain words, and writes nothing', () => {
    const t = makeRoot();
    tidy.push(t.cleanup);
    const r = build({ root: t.root, out: t.out, production: true, now: NOW });
    assert.equal(r.ok, false);
    assert.ok(!existsSync(t.out), 'a refused build leaves no half-finished site behind');
    assert.ok(mentions(r.problems, /"siteUrl" must be the public address, starting with https:\/\//));
    assert.ok(mentions(r.problems, /content\/pages\/about\.md is marked "sample: true"/));
    assert.ok(mentions(r.problems, /content\/pages\/apply-start\.md is marked "stub: true"/));
    assert.ok(mentions(r.problems, /content\/site\.json still has \d+ placeholders? written as \[\[/));
    assert.ok(r.problems.every((p) => !/Error:|at \w+ \(|undefined/.test(p)), 'every message reads as a sentence, not a stack trace');
  });
  test('accepts the same site once samples, stubs and placeholders are gone', () => {
    const b = tryBuild();
    assert.deepEqual(b.problems, []);
    assert.equal(b.result.ok, true);
    assert.equal(b.result.report.mode, 'production');
    assert.ok(existsSync(join(b.out, 'sitemap.xml')));
    assert.match(readFileSync(join(b.out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/foundation\.example\/sitemap\.xml/);
  });
  test('a finished production site passes every site check, including "no sample content"', () => {
    const b = tryBuild();
    const { report } = checkSite({ dist: b.out, contentDir: b.content });
    assert.deepEqual(report.problems, []);
    assert.ok(report.rules.get('no-samples').checked > 28, 'the production-only rules ran');
    assert.equal(report.rules.get('indexing').title.startsWith('Public pages can be indexed'), true);
  });
  for (const [what, siteUrl] of [['empty', ''], ['plain http', 'http://foundation.example'], ['no address', 'foundation.example']]) {
    test(`refuses a site address that is ${what}`, () => {
      const b = tryBuild({ edit: (c) => writeSite(c, { ...readSite(c), siteUrl }) });
      assert.ok(mentions(b.problems, /"siteUrl" must be the public address/));
    });
  }
  test('one remaining placeholder, sample flag or stub flag stops the build', () => {
    for (const [file, bad, re] of [
      ['pages/about.md', (t) => t.replace('## What we do', '## What we do [[todo]]'), /about\.md still has 1 placeholder written as \[\[\.\.\.\]\], for example \[\[todo\]\]/],
      ['programs/emergency-fund.md', (t) => t.replace('---\n', '---\nsample: true\n'), /emergency-fund\.md is marked "sample: true"/],
      ['pages/donate.md', (t) => t.replace('---\n', '---\nstub: true\n'), /donate\.md is marked "stub: true"/],
    ]) {
      const b = tryBuild({ edit: (c) => changeFile(join(c, file), bad) });
      assert.ok(mentions(b.problems, re), `${file}: ${b.problems.join(' | ')}`);
    }
  });
  test('analytics cannot be switched on without an https address for the script', () => {
    const b = tryBuild({ edit: (c) => writeSite(c, { ...readSite(c), analytics: { enabled: true, scriptSrc: 'http://stats.example/a.js' } }) });
    assert.ok(mentions(b.problems, /analytics is enabled but "scriptSrc" is not an https:\/\/ address/));
  });
  test('a staging build accepts samples and marks every page as not for search engines', () => {
    const b = tryBuild({ finished: false, production: false });
    assert.equal(b.result.ok, true);
    assert.ok(!existsSync(join(b.out, 'sitemap.xml')));
    assert.match(readFileSync(join(b.out, 'index.html'), 'utf8'), /<meta name="robots" content="noindex, nofollow">/);
    assert.match(readFileSync(join(b.out, 'robots.txt'), 'utf8'), /Disallow: \//);
  });
  test('the preview build uses relative links so it works from any folder', () => {
    const b = tryBuild({ finished: false, production: false, relative: true });
    const home = readFileSync(join(b.out, 'index.html'), 'utf8');
    assert.match(home, /href="programs\/index\.html"/);
    assert.ok(!/href="\/(?!\/)/.test(home), 'no link starts with a slash');
    const { report } = checkSite({ dist: b.out, contentDir: b.content });
    assert.equal(report.rules.get('links').problems.length, 0);
    assert.equal(report.problems.length, 0, report.problems.map((p) => `${p.where}: ${p.message}`).join('\n'));
  });
});

test.describe('stories need consent (PUB-5)', () => {
  const story = (extra) => (c) => changeFile(join(c, 'stories/waiting-for-consent.md'), (t) => t.replace('consent: false', extra));
  test('a story without recorded consent is never published, and staff are told why', () => {
    const c = load();
    assert.ok(!c.stories.some((s) => s.slug === 'waiting-for-consent'));
    assert.ok(mentions(c.warnings, /waiting-for-consent\.md: not published\. Consent is not recorded/));
  });
  test('"consent: true" alone is not enough; the recording date is needed as well', () => {
    const c = load(story('consent: true'));
    assert.ok(!c.stories.some((s) => s.slug === 'waiting-for-consent'));
  });
  test('"consent: false" with a date is still not published', () => {
    const c = load(story('consent: false\nconsentRecorded: 2026-01-01'));
    assert.ok(!c.stories.some((s) => s.slug === 'waiting-for-consent'));
  });
  test('"consent: true" with the date publishes it', () => {
    const c = load(story('consent: true\nconsentRecorded: 2026-10-01'));
    assert.ok(c.stories.some((s) => s.slug === 'waiting-for-consent'));
  });
  test('a consent that is not a clear yes ("yes", "true" in quotes) does not count', () => {
    for (const value of ['consent: yes', 'consent: "true"', 'consent: 1']) {
      const c = load(story(`${value}\nconsentRecorded: 2026-10-01`));
      assert.ok(!c.stories.some((s) => s.slug === 'waiting-for-consent'), value);
    }
  });
  test('an unpublished story does not appear anywhere in the built site', () => {
    const b = tryBuild();
    for (const file of ['impact/index.html', 'index.html', 'feed.xml']) assert.ok(!/waiting for consent/i.test(readFileSync(join(b.out, file), 'utf8')), file);
    assert.ok(!readdirSync(b.out).some((f) => /consent/.test(f)));
  });
});

test.describe('numbers and dates are checked', () => {
  test('a money breakdown must add up to 100', () => {
    const b = tryBuild({ edit: (c) => changeFile(join(c, 'reports/2025.md'), (t) => t.replace('operations: 9', 'operations: 12')) });
    assert.ok(mentions(b.problems, /reports\/2025\.md: students, operations and fundraising must add up to 100\. They add up to 103\./));
  });
  test('shares must be whole numbers', () => {
    const c = load((d) => changeFile(join(d, 'reports/2025.md'), (t) => t.replace('operations: 9', 'operations: 8.5').replace('students: 86', 'students: 86.5')));
    assert.ok(mentions(c.problems, /must be a whole number from 0 to 100/));
  });
  test('a report that names a file which is not there is an error, not a dead link', () => {
    const c = load((d) => rmSync(join(d, 'files/annual-report-2025.pdf')));
    assert.ok(mentions(c.problems, /reports\/2025\.md: the report file "annual-report-2025\.pdf" is not in content\/files\//));
  });
  test('a program needs a deadline (or "rolling: true") and an amount', () => {
    const c = load((d) => changeFile(join(d, 'programs/undergraduate-award.md'), (t) => t.replace(/^deadlineAt:.*\n/m, '').replace(/^amountMax:.*\n/m, '')));
    assert.ok(mentions(c.problems, /undergraduate-award\.md: "deadlineAt" is missing\. Add it, or write "rolling: true"/));
    assert.ok(mentions(c.problems, /undergraduate-award\.md: "amountMax" is missing/));
  });
  test('a deadline before the opening date is caught', () => {
    const c = load((d) => changeFile(join(d, 'programs/undergraduate-award.md'), (t) => t.replace('deadlineAt: 2027-03-31 23:59', 'deadlineAt: 2026-08-01 23:59')));
    assert.ok(mentions(c.problems, /the deadline is not after the opening date/));
  });
  test('a deadline written as a date alone is refused, because it would close the program a day early', () => {
    const c = load((d) => changeFile(join(d, 'programs/undergraduate-award.md'), (t) => t.replace('deadlineAt: 2027-03-31 23:59', 'deadlineAt: 2027-03-31')));
    assert.ok(mentions(c.problems, /undergraduate-award\.md: "deadlineAt" needs a time as well as a date.*2027-03-31 23:59/));
    assert.equal(c.problems.filter((x) => /deadlineAt/.test(x)).length, 1, 'one clear message, not two');
    // the opening date may be a date alone: it means the start of that day
    const o = load((d) => changeFile(join(d, 'programs/undergraduate-award.md'), (t) => t.replace('opensAt: 2026-09-01 09:00', 'opensAt: 2026-09-01')));
    assert.deepEqual(o.problems, []);
  });
  test('a date in the wrong shape says what to write', () => {
    const c = load((d) => changeFile(join(d, 'programs/undergraduate-award.md'), (t) => t.replace('deadlineAt: 2027-03-31 23:59', 'deadlineAt: 31 March 2027')));
    assert.ok(mentions(c.problems, /"deadlineAt": .*Write it as YYYY-MM-DD HH:mm/));
    const n = load((d) => changeFile(join(d, 'news/2026-09-01-undergraduate-award-opens.md'), (t) => t.replace('date: 2026-09-01', 'date: 1 Sept')));
    assert.ok(mentions(n.problems, /"date" must look like 2026-09-01/));
  });
  test('a missing title or name is named by file', () => {
    const c = load((d) => changeFile(join(d, 'pages/about.md'), (t) => t.replace(/^title:.*\n/m, '')));
    assert.ok(mentions(c.problems, /pages\/about\.md: "title" is missing/));
  });
  test('a missing page the site needs is reported by name', () => {
    const b = tryBuild({ edit: (c) => rmSync(join(c, 'pages/privacy.md')) });
    assert.ok(mentions(b.problems, /content\/pages\/privacy\.md is missing\./));
  });
  test('a line in front matter that cannot be read points to the file and the line', () => {
    const c = load((d) => changeFile(join(d, 'pages/about.md'), (t) => t.replace('description:', 'this is not a setting\ndescription:')));
    assert.ok(mentions(c.problems, /about\.md: front matter line \d+ is not understood/));
  });
});

test.describe('program dates drive the open and closed notice (PUB-2)', () => {
  const at = (iso) => load(undefined, { now: new Date(iso) });
  const stateOf = (c, slug = 'undergraduate-award') => c.programs.find((p) => p.slug === slug).state;
  test('before it opens, while open, and after it closes', () => {
    assert.equal(stateOf(at('2026-08-31T23:00:00Z')), 'upcoming');
    assert.equal(stateOf(at('2026-09-01T09:00:00Z')), 'open');
    assert.equal(stateOf(at('2027-03-31T23:59:30Z')), 'open');
    assert.equal(stateOf(at('2027-04-01T00:00:00Z')), 'closed');
  });
  test('the program lists group them the same way, and a rolling program is open all year', () => {
    const c = at('2026-11-08T10:00:00Z');
    assert.deepEqual([...c.programs.open.map((p) => p.slug)].sort(), ['emergency-fund', 'undergraduate-award']);
    assert.equal(c.programs.upcoming.length + c.programs.open.length + c.programs.closed.length, c.programs.length);
    assert.equal(stateOf(at('2040-01-01T00:00:00Z'), 'emergency-fund'), 'open');
  });
  test('the built page shows the Apply button before the deadline and the closed notice after it', () => {
    const open = tryBuild({ now: new Date('2027-03-01T10:00:00Z') });
    const closed = tryBuild({ now: new Date('2027-04-02T10:00:00Z') });
    const page = (b) => readFileSync(join(b.out, 'programs/undergraduate-award/index.html'), 'utf8');
    const visible = (html, which) => new RegExp(`data-when="${which}"(?! hidden)`).test(html);
    assert.ok(visible(page(open), 'open') && !visible(page(open), 'closed'));
    assert.ok(visible(page(closed), 'closed') && !visible(page(closed), 'open'));
    assert.match(page(closed), /Applications are closed/);
    assert.match(readFileSync(join(closed.out, 'programs/index.html'), 'utf8'), /Closed/);
  });
  test('every deadline on the page names its time zone', () => {
    const b = tryBuild({ edit: (c) => writeSite(c, { ...readSite(c), timezone: 'Europe/Warsaw' }) });
    const html = readFileSync(join(b.out, 'programs/undergraduate-award/index.html'), 'utf8');
    assert.match(html, /23:59 (UTC|GMT\+2)|23:59 Central European Summer Time/);
    assert.ok(!/<time[^>]*>[^<]*\d{2}:\d{2}<\/time>/.test(html), 'a clock time without a zone');
  });
});

test.describe('news (PUB-10)', () => {
  test('a post dated in the future waits for its day, and staff are told', () => {
    const before = load(undefined, { now: new Date('2026-08-31T10:00:00Z') });
    assert.ok(!before.news.some((n) => /undergraduate-award-opens/.test(n.slug)));
    assert.ok(mentions(before.warnings, /scheduled for 2026-09-01, so it is not on the site yet/));
    const after = load(undefined, { now: new Date('2026-09-01T10:00:00Z') });
    assert.ok(after.news.some((n) => /undergraduate-award-opens/.test(n.slug)));
  });
  test('newest first, and the feed lists exactly the published posts', () => {
    const b = tryBuild();
    const feed = readFileSync(join(b.out, 'feed.xml'), 'utf8');
    assert.equal((feed.match(/<entry>/g) ?? []).length, 3);
    const dates = [...feed.matchAll(/<updated>([^<]+)<\/updated>/g)].map((m) => m[1]);
    assert.deepEqual(dates.slice(1), [...dates.slice(1)].sort().reverse());
    assert.ok(feed.includes('https://foundation.example/news/'));
  });
});

test.describe('pictures need a description (NFR-1)', () => {
  test('an image without "imageAlt" is refused, with what to write', () => {
    const c = load((d) => changeFile(join(d, 'stories/jonas-emergency-2025.md'), (t) => t.replace('consent: true', 'image: jonas.jpg\nconsent: true')));
    assert.ok(mentions(c.problems, /jonas-emergency-2025\.md: this story has an image but no "imageAlt"\. Describe the picture/));
  });
  test('an image file that is not in the folder is refused', () => {
    const b = tryBuild({ edit: (d) => changeFile(join(d, 'stories/jonas-emergency-2025.md'), (t) => t.replace('consent: true', 'image: jonas.jpg\nimageAlt: A student at a desk\nconsent: true')) });
    assert.ok(mentions(b.problems, /the image "jonas\.jpg" is not in content\/images\//));
  });
  test('hidden files in the images and files folders are never published', () => {
    const b = tryBuild({
      edit: (d) => {
        mkdirSync(join(d, 'images'), { recursive: true });
        writeFileSync(join(d, 'images/.gitkeep'), '');
        writeFileSync(join(d, 'images/.DS_Store'), 'x');
        writeFileSync(join(d, 'files/.hidden-note'), 'private');
      },
    });
    assert.deepEqual(b.problems, []);
    for (const f of ['images/.gitkeep', 'images/.DS_Store', 'files/.hidden-note']) assert.equal(existsSync(join(b.out, f)), false, `${f} was published`);
    assert.ok(existsSync(join(b.out, 'files/annual-report-2025.pdf')), 'the real files are still published');
  });
  test('an image with its description is published with that description', () => {
    const b = tryBuild({
      edit: (d, root) => {
        changeFile(join(d, 'stories/jonas-emergency-2025.md'), (t) => t.replace('consent: true', 'image: jonas.jpg\nimageAlt: A student at a desk by a window\nconsent: true'));
        mkdirSync(join(d, 'images'), { recursive: true });
        writeFileSync(join(d, 'images/jonas.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      },
    });
    assert.deepEqual(b.problems, []);
    assert.match(readFileSync(join(b.out, 'impact/index.html'), 'utf8'), /<img src="[^"]*images\/jonas\.jpg" alt="A student at a desk by a window"/);
    assert.ok(existsSync(join(b.out, 'images/jonas.jpg')));
  });
});

test.describe('the Foundation palette (NFR-1)', () => {
  test('a colour that is too faint stops the build and names the pair', () => {
    const b = tryBuild({ edit: (c) => { const s = readSite(c); s.brand.light.inkSoft = '#B8BED8'; writeSite(c, s); } });
    assert.ok(mentions(b.problems, /Colors \(light\): secondary text on the page\. inkSoft #B8BED8 on paper #[0-9A-F]{6} is [\d.]+:1 and needs 4\.5:1\./i));
  });
});

test.describe('a replaced logo reaches returning visitors (NFR-6)', () => {
  // Files under /assets/ are cached for a year, so their address has to change when the file does.
  const versionOf = (dir, re) => readFileSync(join(dir, 'index.html'), 'utf8').match(re)?.[1];
  test('the logo, the home-screen icon and the share image get new addresses when the logo changes', () => {
    const before = tryBuild();
    const after = tryBuild({ edit: (c) => changeFile(join(c, 'brand/mark.svg'), (t) => t.replace('</svg>', '<!-- new logo --></svg>')) });
    for (const re of [/mark\.svg\?v=([0-9a-f]+)/, /apple-touch-icon\.png\?v=([0-9a-f]+)/, /og-default\.png\?v=([0-9a-f]+)/]) {
      const a = versionOf(before.out, re);
      const b = versionOf(after.out, re);
      assert.ok(a && b, `${re} carries a version`);
      assert.notEqual(a, b, `${re} changes when the logo changes`);
    }
  });
  test('an unchanged site keeps the same addresses, so nothing is downloaded again for no reason', () => {
    const a = tryBuild();
    const b = tryBuild();
    assert.equal(versionOf(a.out, /site\.css\?v=([0-9a-f]+)/), versionOf(b.out, /site\.css\?v=([0-9a-f]+)/));
  });
});

test.describe('analytics only after consent (NFR-3)', () => {
  test('when enabled, pages carry a choice banner and no analytics script until it is accepted', () => {
    const b = tryBuild({ edit: (c) => writeSite(c, { ...readSite(c), analytics: { enabled: true, scriptSrc: 'https://stats.example/count.js' } }) });
    const html = readFileSync(join(b.out, 'index.html'), 'utf8');
    assert.match(html, /id="consent"[^>]* hidden[^>]*data-src="https:\/\/stats\.example\/count\.js"/);
    assert.ok(!/<script[^>]*src="https:\/\/stats/.test(html), 'the analytics script is not in the page');
    assert.match(readFileSync(join(b.out, '_headers'), 'utf8'), /script-src 'self' 'sha256-[^']+' https:\/\/stats\.example/);
    const { report } = checkSite({ dist: b.out, contentDir: b.content });
    assert.deepEqual(report.problems, []);
  });
  test('when disabled, there is no banner and no mention of any service', () => {
    const b = tryBuild();
    assert.ok(!/id="consent"/.test(readFileSync(join(b.out, 'index.html'), 'utf8')));
    assert.ok(!/stats\./.test(readFileSync(join(b.out, '_headers'), 'utf8')));
  });
});

test('the real content builds for staging, and the build report lists everything still to replace', () => {
  const t = makeRoot();
  tidy.push(t.cleanup);
  const r = build({ root: t.root, out: t.out, now: NOW });
  assert.equal(r.ok, true);
  const report = JSON.parse(readFileSync(join(t.out, 'build-report.json'), 'utf8'));
  assert.equal(report.mode, 'staging');
  assert.ok(report.pages >= 28);
  assert.ok(report.sampleFiles.length > 10 && report.stubPages.length >= 2 && report.placeholderFiles.length > 10);
  assert.ok(existsSync(join(ROOT, 'content/pages/home.md')));
});

// ---- the home page's two figure cards, the pictures and the lines ---------------------------
test.describe('the home page: figure cards, pictures, lines', () => {
  const staging = (edit) => tryBuild({ finished: false, production: false, edit });
  const homeOf = (b) => readFileSync(join(b.out, 'index.html'), 'utf8');
  // the text of one card: from its opening tag to the end of its section
  const cardOf = (h, name) => {
    const at = h.indexOf(`class="stat ${name}"`);
    return at < 0 ? null : h.slice(at, h.indexOf('</section>', at));
  };
  const studentLines = (card) => [...card.matchAll(/<span class="name">(.*?)<\/span><span class="val">(\d+)<\/span>/g)].map((m) => [m[1], m[2]]);
  const moneyLines = (card) => [...card.matchAll(/<li class="(in|out)"><span class="tile">.*?<\/span><span class="name">(.*?)<time class="when" datetime="([^"]+)">([^<]+)<\/time><\/span><span class="val"><span class="sr-only">(Received|Paid out) <\/span><span aria-hidden="true">([+−])<\/span>([^<]+)<\/span><\/li>/g)]
    .map((m) => m.slice(1));
  const noByProgram = (d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace(/^byProgram:\n(  - .*\n)+/m, ''));
  const noTransactions = (d) => changeFile(join(d, 'reports/2025.md'), (t) => t.replace(/^transactions:\n(  - .*\n)+/m, ''));

  test('the students card has the latest year\'s total, then each program, biggest first', () => {
    const b = staging();
    assert.equal(b.result.ok, true);
    const card = cardOf(homeOf(b), 'stat-students');
    assert.match(card, /<span class="big">142<\/span> <span class="what">students funded in 2025<\/span>/);
    assert.deepEqual(studentLines(card), [['Undergraduate Award', '63'], ['Vocational Training Scholarship', '41'], ['Emergency Fund', '20'], ['Graduate Research Grant', '18']]);
    assert.match(card, /<a href="\/impact\/">/, 'the card leads to the full figures');
  });
  test('the donations card has the latest report\'s total, then its four newest transactions, each with in or out three ways', () => {
    const b = staging();
    const card = cardOf(homeOf(b), 'stat-money');
    assert.match(card, /<span class="big">\$702,000<\/span> <span class="what">total donations in 2025<\/span>/);
    assert.deepEqual(moneyLines(card), [
      ['in', 'Year-end appeal', '2025-12-18', 'Dec 18', 'Received', '+', '$24,300'],
      ['out', 'Undergraduate Award', '2025-12-15', 'Dec 15', 'Paid out', '−', '$61,000'],
      ['in', 'Corporate gift', '2025-12-11', 'Dec 11', 'Received', '+', '$50,000'],
      ['out', 'Emergency Fund', '2025-12-04', 'Dec 4', 'Paid out', '−', '$9,800'],
    ]);
    assert.ok(!/Monthly giving/.test(card), 'the fifth, older transaction is left off');
    assert.match(card, /<a href="\/finances\/">/);
    assert.ok((card.match(/class="ico"/g) ?? []).length === 4, 'one arrow icon on each line');
  });
  test('more programs than lines: the biggest three, then "Other programs", so the lines still add up', () => {
    const b = staging((d) => {
      cpSync(join(d, 'programs/emergency-fund.md'), join(d, 'programs/second-chance-grant.md'));
      changeFile(join(d, 'programs/second-chance-grant.md'), (t) => t.replace(/^title:.*$/m, 'title: Second Chance Grant'));
      changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace(/^byProgram:\n(  - .*\n)+/m,
        'byProgram:\n  - { program: undergraduate-award, students: 60 }\n  - { program: vocational-training-scholarship, students: 40 }\n  - { program: emergency-fund, students: 20 }\n  - { program: graduate-research-grant, students: 12 }\n  - { program: second-chance-grant, students: 10 }\n'));
    });
    assert.equal(b.result.ok, true, b.problems.join(' | '));
    const lines = studentLines(cardOf(homeOf(b), 'stat-students'));
    assert.deepEqual(lines, [['Undergraduate Award', '60'], ['Vocational Training Scholarship', '40'], ['Emergency Fund', '20'], ['Other programs', '22']]);
    assert.equal(lines.reduce((s, [, n]) => s + Number(n), 0), 142);
  });
  test('a program can choose its icon; one that is not in the set is refused, and no icon means a book', () => {
    const bad = load((d) => changeFile(join(d, 'programs/emergency-fund.md'), (t) => t.replace('icon: heart', 'icon: rocket')));
    assert.ok(mentions(bad.problems, /emergency-fund\.md: "icon" must be one of: cap, hardhat, .*moneyOut\./));
    const none = load((d) => changeFile(join(d, 'programs/emergency-fund.md'), (t) => t.replace(/^icon:.*\n/m, '')));
    assert.deepEqual(none.problems, []);
    assert.equal(none.programs.find((p) => p.slug === 'emergency-fund').icon, 'book');
  });

  test('without a program breakdown there is no students card, and without transactions no donations card; the page still builds', () => {
    const noStudents = staging(noByProgram);
    assert.equal(noStudents.result.ok, true);
    assert.equal(cardOf(homeOf(noStudents), 'stat-students'), null);
    assert.ok(cardOf(homeOf(noStudents), 'stat-money'));
    const noMoney = staging(noTransactions);
    assert.equal(noMoney.result.ok, true);
    assert.ok(cardOf(homeOf(noMoney), 'stat-students'));
    assert.equal(cardOf(homeOf(noMoney), 'stat-money'), null);
    const neither = staging((d) => { noByProgram(d); noTransactions(d); });
    const h = homeOf(neither);
    assert.ok(!/class="stat /.test(h));
    assert.match(h, /<h1 id="hero-h">/);
    assert.match(h, />Donate<\/a>/);
    assert.match(h, />Apply for a scholarship<\/a>/);
  });
  test('the cards follow the most recent year and report, not an older one', () => {
    const b = staging((d) => {
      writeFileSync(join(d, 'data/impact-2026.md'), '---\nyear: 2026\nstudents: 10\nawarded: 5000\napplications: 40\nbyProgram:\n  - { program: emergency-fund, students: 10 }\nsample: true\n---\nShort note.\n');
      writeFileSync(join(d, 'reports/2026.md'), '---\nyear: 2026\ntitle: Annual report 2026\nstudents: 85\noperations: 10\nfundraising: 5\nspent: 700000\nincome: 800000\ntransactions:\n  - { date: 2026-03-02, direction: in, label: "Spring appeal, online", amount: 5000 }\nsample: true\n---\nNote.\n');
    });
    assert.equal(b.result.ok, true, b.problems.join(' | '));
    const h = homeOf(b);
    assert.match(cardOf(h, 'stat-students'), /<span class="big">10<\/span> <span class="what">students funded in 2026<\/span>/);
    assert.match(cardOf(h, 'stat-money'), /<span class="big">\$800,000<\/span> <span class="what">total donations in 2026<\/span>/);
    assert.deepEqual(moneyLines(cardOf(h, 'stat-money')), [['in', 'Spring appeal, online', '2026-03-02', 'Mar 2', 'Received', '+', '$5,000']]);
  });
  test('a newer report with no transactions leaves the donations card out, rather than showing an older year\'s', () => {
    const b = staging((d) => writeFileSync(join(d, 'reports/2026.md'), '---\nyear: 2026\ntitle: Annual report 2026\nstudents: 85\noperations: 10\nfundraising: 5\nspent: 700000\nincome: 800000\nsample: true\n---\nNote.\n'));
    assert.equal(cardOf(homeOf(b), 'stat-money'), null);
    assert.ok(cardOf(homeOf(b), 'stat-students'), 'the students card is unaffected');
  });
  test('figures that do not add up, name no real program, or are written in a way that cannot be read are refused in plain words', () => {
    const total = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace('students: 142', 'students: 150')));
    assert.ok(mentions(total.problems, /impact-2025\.md: the programs in "byProgram" add up to 142, but "students" says 150\. They must match\./));
    const unknown = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace('program: emergency-fund', 'program: no-such-program')));
    assert.ok(mentions(unknown.problems, /impact-2025\.md: "byProgram" item 3: "program" must be the name of a file in content\/programs\//));
    const twice = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace('program: emergency-fund', 'program: undergraduate-award')));
    assert.ok(mentions(twice.problems, /"byProgram" item 3: "undergraduate-award" is listed twice\./));
    const fraction = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace('students: 63 }', 'students: 63.5 }')));
    assert.ok(mentions(fraction.problems, /"byProgram" item 1: "students" must be a whole number such as 63\./));
    const unclosed = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace('students: 41 }', 'students: 41')));
    assert.ok(mentions(unclosed.problems, /impact-2025\.md: front matter line \d+ is not understood.*Write an inline item as \{ key: value, key: value \}/));
    const notList = load((d) => changeFile(join(d, 'data/impact-2025.md'), (t) => t.replace(/^byProgram:\n(  - .*\n)+/m, 'byProgram: lots\n')));
    assert.ok(mentions(notList.problems, /"byProgram" must be a list, one program per line/));
  });
  test('each transaction needs a real date, "in" or "out", a label and an amount above zero, and the total donations must be given', () => {
    const edit = (from, to) => load((d) => changeFile(join(d, 'reports/2025.md'), (t) => t.replace(from, to)));
    assert.ok(mentions(edit('date: 2025-12-18', 'date: 18 Dec').problems, /reports\/2025\.md: "transactions" item 1: "date" must be written YYYY-MM-DD\./));
    assert.ok(mentions(edit('date: 2025-12-18', 'date: 2025-13-45').problems, /item 1: "date" must be written YYYY-MM-DD\./));
    assert.ok(mentions(edit('direction: out, label: Undergraduate Award', 'direction: sideways, label: Undergraduate Award').problems, /item 2: "direction" must be "in" \(money received\) or "out" \(money paid\)\./));
    assert.ok(mentions(edit('label: Corporate gift, ', '').problems, /item 3: "label" is missing/));
    assert.ok(mentions(edit('amount: 9800', 'amount: 0').problems, /item 4: "amount" must be a number above zero\./));
    assert.ok(mentions(edit(/^income:.*\n/m, '').problems, /"transactions" are listed, so "income" \(the total donations received that year\) is needed too/));
  });
  test('transactions are shown newest first, whatever order they were written in', () => {
    const c = load((d) => changeFile(join(d, 'reports/2025.md'), (t) => t.replace(/^transactions:\n(  - .*\n)+/m,
      'transactions:\n  - { date: 2025-01-02, direction: in, label: A, amount: 1 }\n  - { date: 2025-06-30, direction: out, label: B, amount: 2 }\n  - { date: 2025-03-15, direction: in, label: C, amount: 3 }\n')));
    assert.deepEqual(c.problems, []);
    assert.deepEqual(c.reports.find((r) => r.year === 2025).transactions.map((x) => x.label), ['B', 'C', 'A']);
  });

  test('the pictures around the headline have no words in them, and are hidden from screen readers', () => {
    const h = homeOf(staging());
    const hero = h.slice(h.indexOf('<section class="hero"'), h.indexOf('</section>', h.indexOf('class="link link-end"')));
    for (const part of ['<div class="students" aria-hidden="true">', '<div class="donors" aria-hidden="true">', '<div class="flow" aria-hidden="true">',
      '<span class="branch branch-start" aria-hidden="true">', '<span class="branch branch-end" aria-hidden="true">',
      '<span class="link link-start" aria-hidden="true">', '<span class="link link-end" aria-hidden="true">']) {
      assert.ok(hero.includes(part), `${part} is there, hidden from screen readers`);
    }
    // what is left once the headline block and the two figure cards are taken out is the pictures and the lines: icons and lines only
    const rest = hero.replace(/<div class="hero-copy">[\s\S]*?(?=<div class="hero-side hero-side-start">)/, '').replace(/<section class="stat[\s\S]*?<\/section>/g, '');
    assert.equal(rest.replace(/<[^>]*>/g, '').trim(), '', 'icons and lines only');
    assert.ok(!/alt="[^"]/.test(rest), 'the logo in the connector has no description');
  });
  test('the reading order is the headline and buttons, then the figure cards; the pictures come last and say nothing', () => {
    const h = homeOf(staging());
    const at = (needle) => h.indexOf(needle);
    assert.ok(at('class="hero-copy"') < at('class="stat stat-students"') && at('class="stat stat-students"') < at('class="stat stat-money"') && at('class="stat stat-money"') < at('class="branch branch-start"'));
  });
  test('the old parts of the top of the page are gone: no "Transparent" card, no figure line, no labels', () => {
    const h = homeOf(staging());
    for (const gone of [/Transparent/, /since 2012/, /Sample figures/ , /Individual donor/i, /Corporate donor/i, /class="lab"/, /class="principles"/, /class="figure"/]) {
      assert.ok(!gone.test(h.slice(0, h.indexOf('class="section"'))), `the top of the home page still has ${gone}`);
    }
  });
  test('the figures never say "Sample" on the cards themselves; the staging strip and the production gate carry that', () => {
    const h = homeOf(staging());
    assert.ok(!/sample/i.test(cardOf(h, 'stat-students')) && !/sample/i.test(cardOf(h, 'stat-money')));
    assert.match(h, /Staging preview\./);
  });
  test('a production build still refuses the sample figures behind the cards, like any other sample file', () => {
    const t = makeRoot();
    tidy.push(t.cleanup);
    const r = build({ root: t.root, out: t.out, production: true, now: NOW });
    assert.ok(mentions(r.problems, /content\/data\/impact-2025\.md is marked "sample: true"/));
    assert.ok(mentions(r.problems, /content\/reports\/2025\.md is marked "sample: true"/));
  });
  test('the real figures, once the sample marks are gone, build for production and show on the cards', () => {
    const b = tryBuild();
    assert.deepEqual(b.problems, []);
    const h = homeOf(b);
    assert.ok(cardOf(h, 'stat-students') && cardOf(h, 'stat-money'));
  });

  test('the lines are on the home page only: two elbows and two stretches, none of them in a figure card', () => {
    const b = staging();
    const h = homeOf(b);
    assert.equal((h.match(/class="branch branch-(start|end)"/g) ?? []).length, 2);
    assert.equal((h.match(/class="link link-(start|end)"/g) ?? []).length, 2);
    // each elbow is one quarter circle that carries on straight, drawn once and mirrored by the stylesheet for the other side
    assert.deepEqual([...h.matchAll(/<svg viewBox="0 0 112 48" focusable="false" aria-hidden="true"><path d="([^"]+)"\/><\/svg>/g)].map((m) => m[1]),
      ['M.7 0A47.3 47.3 0 0 0 48 47.3H112', 'M.7 0A47.3 47.3 0 0 0 48 47.3H112']);
    for (const name of ['stat-students', 'stat-money']) {
      assert.ok(!/class="(branch|link)[ "]/.test(cardOf(h, name)), `no line is part of the ${name} card`);
    }
    for (const other of ['programs/index.html', 'finances/index.html', 'about/index.html']) {
      assert.ok(!/class="(branch|link|students|donors|flow)[ "]/.test(readFileSync(join(b.out, other), 'utf8')), other);
    }
    assert.ok(!/class="deco"|<svg class="deco/.test(h), 'the old drawing that met the figure cards is gone');
  });
  test('the lines are drawn from colours in site.json (light and dark), not fixed in the stylesheet', () => {
    const b = staging();
    const css = readFileSync(join(b.out, 'assets/site.css'), 'utf8');
    assert.match(css, /--deco:\s*#D0DFFF/i);
    assert.match(css, /--deco-soft:\s*#D4E1FF/i);
    assert.match(css, /--deco:\s*#1D2858/i, 'and a dark-mode value');
    assert.match(css, /\.home-page::before, \.home-page::after \{[^}]*background: var\(--deco\)/, 'the rails down the sides');
    assert.match(css, /\.branch svg \{[^}]*stroke: var\(--deco\)/, 'the elbows');
    assert.match(css, /\.link \{[^}]*var\(--deco-soft\)/, 'the dashed stretches');
  });
  test('the figure cards are the same width as the students picture, so the corner cards are one size', () => {
    const b = staging();
    const css = readFileSync(join(b.out, 'assets/site.css'), 'utf8');
    const picture = /--pic-s:\s*([\d.]+)rem/.exec(css);
    const card = /@media \(min-width: 64rem\) \{[\s\S]*?\n  \.stat \{ width: ([\d.]+)rem; \}/.exec(css);
    assert.ok(picture && card, 'both sizes are set in the stylesheet');
    assert.equal(card[1], picture[1]);
  });
});
