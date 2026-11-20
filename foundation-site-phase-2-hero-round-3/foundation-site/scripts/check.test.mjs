// A check that cannot fail is worth nothing. These tests break a finished build in one specific way at a time
// and confirm that check-site.mjs notices, and that it stays quiet on the untouched build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { build } from '../src/build.mjs';
import { checkSite } from './check-site.mjs';
import { parseHtml, find, textOf, nameOf } from './lib/scan-html.mjs';
import { makeRoot } from './lib/fixture.mjs';

const NOW = new Date('2026-11-08T10:00:00Z');
const scratch = mkdtempSync(join(tmpdir(), 'foundation-check-'));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

const staging = makeRoot();
const production = makeRoot({ finished: true });
test.after(() => {
  staging.cleanup();
  production.cleanup();
});
assert.ok(build({ root: staging.root, out: staging.out, now: NOW }).ok);
assert.ok(build({ root: production.root, out: production.out, production: true, now: NOW }).ok);

let n = 0;
// Copy a finished build, change one file, check it.
function broken(base, contentDir, file, change) {
  const dist = join(scratch, `copy-${n++}`);
  cpSync(base, dist, { recursive: true });
  const path = join(dist, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, change(existsSync(path) ? readFileSync(path, 'utf8') : ''));
  return checkSite({ dist, contentDir }).report;
}
const inStaging = (file, change) => broken(staging.out, staging.content, file, change);
const inProduction = (file, change) => broken(production.out, production.content, file, change);
const rulesFailing = (report) => [...report.rules.values()].filter((r) => r.problems.length).map((r) => r.id);
const before = (marker, add) => (t) => t.replace(marker, `${add}${marker}`);

test.describe('a clean build', () => {
  test('passes every rule, in staging and in production', () => {
    for (const [base, content] of [[staging.out, staging.content], [production.out, production.content]]) {
      const { report, pages } = checkSite({ dist: base, contentDir: content });
      assert.equal(pages, 28);
      assert.deepEqual(report.problems, []);
      for (const r of report.rules.values()) assert.ok(r.checked > 0, `${r.id} checked nothing`);
    }
  });
});

test.describe('it notices broken pages', () => {
  const cases = [
    ['an image without alt text', 'images', 'index.html', (t) => t.replace('alt=""', '')],
    ['an image whose alt text is a file name', 'images', 'index.html', (t) => t.replace('alt=""', 'alt="photo.jpg"')],
    ['a repeated id', 'ids', 'about/index.html', before('</main>', '<p id="main">x</p>')],
    ['a label that points to nothing', 'ids', 'contact/index.html', (t) => t.replace('for="email"', 'for="e-mail"')],
    ['a skipped heading level', 'headings', 'programs/index.html', (t) => t.replace('<h2', '<h4').replace('</h2>', '</h4>')],
    ['two h1 headings', 'headings', 'about/index.html', before('</main>', '<h1>Another</h1>')],
    ['an empty heading', 'headings', 'about/index.html', before('</main>', '<h2></h2>')],
    ['a tag that is never closed', 'markup', 'about/index.html', before('</main>', '<div>')],
    ['a closing tag with no opening tag', 'markup', 'about/index.html', before('</main>', '</section>')],
    ['a wrong language', 'language', 'about/index.html', (t) => t.replace('<html lang="en">', '<html lang="fr">')],
    ['a missing title', 'titles', 'about/index.html', (t) => t.replace(/<title>.*?<\/title>/s, '')],
    ['a title used twice', 'titles', 'about/index.html', (t) => t.replace(/<title>.*?<\/title>/s, `<title>${/<title>(.*?)<\/title>/s.exec(readFileSync(join(staging.out, 'index.html'), 'utf8'))[1]}</title>`)],
    ['a missing description', 'titles', 'about/index.html', (t) => t.replace(/<meta name="description"[^>]*>/, '')],
    ['no skip link', 'landmarks', 'about/index.html', (t) => t.replace('href="#main"', 'href="#nowhere"')],
    ['two navigation areas with the same name', 'landmarks', 'about/index.html', (t) => t.replace('aria-label="Legal"', 'aria-label="Site"')],
    ['a link to a page that does not exist', 'links', 'about/index.html', before('</main>', '<p><a href="/does-not-exist/">Gone</a></p>')],
    ['a link to a heading that does not exist', 'links', 'about/index.html', before('</main>', '<p><a href="/finances/#nope">Gone</a></p>')],
    ['a link with no name', 'links', 'about/index.html', before('</main>', '<p><a href="/about/"></a></p>')],
    ['a link that goes nowhere', 'links', 'about/index.html', before('</main>', '<p><a href="#">x</a></p>')],
    ['a javascript: link', 'links', 'about/index.html', before('</main>', '<p><a href="javascript:alert(1)">x</a></p>')],
    ['a link that is not https', 'links', 'about/index.html', before('</main>', '<p><a href="http://example.org">x</a></p>')],
    ['a new-tab link without rel=noopener', 'links', 'about/index.html', before('</main>', '<p><a href="https://example.org" target="_blank">x</a></p>')],
    ['an email link that is not an address', 'links', 'about/index.html', before('</main>', '<p><a href="mailto:nobody">x</a></p>')],
    ['an inline picture that screen readers would announce', 'svg-hidden', 'about/index.html', before('</main>', '<p><svg width="10" height="10"><path d="M0 0h10"/></svg></p>')],
    ['a missing font file', 'links', 'assets/fonts/inter-bold.woff', () => 'x', 'delete'],
    ['a form field with no label', 'forms', 'contact/index.html', (t) => t.replace('<label for="name">', '<label for="other">')],
    ['a form without the spam trap', 'forms', 'contact/index.html', (t) => t.replace('name="website"', 'name="site"')],
    ['a form that sends somewhere else', 'forms', 'contact/index.html', (t) => t.replace('/api/contact', '/api/elsewhere')],
    ['a form that does not post', 'forms', 'contact/index.html', (t) => t.replace('method="post"', 'method="get"')],
    ['an email field that skips autocomplete', 'forms', 'contact/index.html', (t) => t.replace('autocomplete="email"', '')],
    ['a table without a name', 'tables', 'impact/index.html', (t) => t.replace(/ aria-labelledby="years-h"/g, '')],
    ['a deadline time with no time zone', 'times', 'about/index.html', before('</main>', '<p><time datetime="2027-03-31T23:59:00.000Z">March 31, 2027, 23:59</time></p>')],
    ['a date nobody can read', 'times', 'about/index.html', before('</main>', '<p><time datetime="soon">Soon</time></p>')],
    ['"undefined" shown as text', 'text', 'about/index.html', before('</main>', '<p>Deadline: undefined</p>')],
    ['Markdown left unconverted', 'text', 'about/index.html', before('</main>', '<p>This is **important**</p>')],
    ['an inline style', 'csp', 'about/index.html', (t) => t.replace('<h1', '<h1 style="color:red"')],
    ['an inline event handler', 'csp', 'about/index.html', (t) => t.replace('<h1', '<h1 onclick="x()"')],
    ['an inline script', 'csp', 'about/index.html', before('</body>', '<script>alert(1)</script>')],
    ['a script from another site', 'csp', 'about/index.html', before('</body>', '<script src="https://cdn.example/x.js"></script>')],
    ['an image from another site', 'csp', 'about/index.html', before('</main>', '<img src="https://tracker.example/p.png" alt="">')],
    ['a frame', 'csp', 'about/index.html', before('</main>', '<iframe src="/about/"></iframe>')],
    ['a weaker content policy', 'csp', '_headers', (t) => t.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")],
    ['a stylesheet that loads from another site', 'csp', 'assets/site.css', (t) => `@import url("https://fonts.example/css");${t}`],
    ['a script that makes network requests', 'csp', 'assets/site.js', (t) => `${t}\nfetch('/x');`],
    ['a page not marked noindex in staging', 'indexing', 'about/index.html', (t) => t.replace(/<meta name="robots"[^>]*>/, '')],
    ['a staging site that welcomes search engines', 'indexing', 'robots.txt', () => 'User-agent: *\nAllow: /\n'],
    ['missing share information', 'sharing', 'about/index.html', (t) => t.replace(/<meta property="og:title"[^>]*>/, '')],
    ['a page nobody links to', 'reachable', 'lonely/index.html', () => readFileSync(join(staging.out, 'about/index.html'), 'utf8')],
    ['a logo address with no version', 'caching', 'about/index.html', (t) => t.replace(/(\/assets\/mark\.svg)\?v=[0-9a-f]+/, '$1')],
    ['a stylesheet address with no version', 'caching', 'about/index.html', (t) => t.replace(/(\/assets\/site\.css)\?v=[0-9a-f]+/, '$1')],
    ['a home-screen icon address with no version', 'caching', 'index.html', (t) => t.replace(/(apple-touch-icon\.png)\?v=[0-9a-f]+/, '$1')],
    ['a font face that can hide the text while it loads', 'weight', 'assets/site.css', (t) => t.replace(/font-display: optional;/g, '')],
    ['a stylesheet that is too heavy', 'weight', 'assets/site.css', (t) => `${t}\n/* ${randomBytes(60_000).toString('hex')} */`],
    ['a page that is too heavy', 'weight', 'about/index.html', before('</main>', `<p>${randomBytes(80_000).toString('hex')}</p>`)],
  ];
  for (const [what, rule, file, change, mode] of cases) {
    test(`${what} is reported under "${rule}"`, () => {
      let report;
      if (mode === 'delete') {
        const dist = join(scratch, `copy-${n++}`);
        cpSync(staging.out, dist, { recursive: true });
        rmSync(join(dist, file));
        report = checkSite({ dist, contentDir: staging.content }).report;
      } else report = inStaging(file, change);
      assert.ok(rulesFailing(report).includes(rule), `expected "${rule}" to fail; failing rules: ${rulesFailing(report).join(', ') || 'none'}`);
      const problem = report.rules.get(rule).problems[0];
      assert.ok(problem.where && problem.message.length > 20, 'the message says where and what');
    });
  }
});

test.describe('in production it also notices', () => {
  const cases = [
    ['a missing canonical link', 'indexing', 'about/index.html', (t) => t.replace(/<link rel="canonical"[^>]*>/, '')],
    ['a wrong canonical link', 'indexing', 'about/index.html', (t) => t.replace('foundation.example/about/', 'foundation.example/other/')],
    ['an indexable page missing from the sitemap', 'indexing', 'sitemap.xml', (t) => t.replace(/<url><loc>https:\/\/foundation\.example\/about\/<\/loc>.*?<\/url>/s, '')],
    ['a private page listed in the sitemap', 'indexing', 'sitemap.xml', (t) => t.replace('</urlset>', '<url><loc>https://foundation.example/404.html</loc></url></urlset>')],
    ['a sitemap entry for a page that does not exist', 'indexing', 'sitemap.xml', (t) => t.replace('</urlset>', '<url><loc>https://foundation.example/ghost/</loc></url></urlset>')],
    ['a site that blocks all search engines', 'indexing', 'robots.txt', () => 'User-agent: *\nDisallow: /\n'],
    ['a leftover placeholder', 'no-samples', 'about/index.html', before('</main>', '<p><mark class="placeholder">todo</mark></p>')],
    ['a leftover staging notice', 'no-samples', 'index.html', (t) => t.replace('<body>', '<body><div class="strip">Staging preview.</div>')],
    ['a share image that is not https', 'sharing', 'about/index.html', (t) => t.replace(/(<meta property="og:image" content=")https/, '$1http')],
    ['a missing HSTS header', 'csp', '_headers', (t) => t.replace(/ *Strict-Transport-Security:.*\n/, '')],
    ['a share image address with no version', 'caching', 'index.html', (t) => t.replace(/(og-default\.png)\?v=[0-9a-f]+/, '$1')],
    ['a feed with relative addresses', 'sharing', 'feed.xml', (t) => t.replace(/<id>https:\/\/foundation\.example/g, '<id>')],
  ];
  for (const [what, rule, file, change] of cases) {
    test(`${what} is reported under "${rule}"`, () => {
      const report = inProduction(file, change);
      assert.ok(rulesFailing(report).includes(rule), `expected "${rule}" to fail; failing rules: ${rulesFailing(report).join(', ') || 'none'}`);
    });
  }
});

test.describe('the HTML reader the checks rely on', () => {
  test('reads nested tags, attributes with symbols, entities and raw script text', () => {
    const { root, problems } = parseHtml('<!doctype html><html lang="en"><body><a href="/a?x=1&amp;y=2" class=big>Hi &amp; <b>bye</b><img src="x.png" alt="A &quot;pic&quot;"></a><script>if (a < b && c > d) {}</script><p>One<p>Two</body></html>');
    assert.deepEqual(problems, []);
    const a = find(root, 'a')[0];
    assert.equal(a.attrs.href, '/a?x=1&y=2');
    assert.equal(a.attrs.class, 'big');
    assert.equal(textOf(a), 'Hi &amp; bye');
    assert.equal(nameOf(a), 'Hi &amp; byeA "pic"');
    assert.equal(find(root, 'script')[0].children[0].text, 'if (a < b && c > d) {}');
    assert.equal(find(root, 'p').length, 2);
  });
  test('reports tags that are opened and not closed, or closed and not opened', () => {
    assert.match(parseHtml('<div><span>x</div>').problems[0], /<span> is not closed before <\/div>/);
    assert.match(parseHtml('<div>x').problems[0], /<div> is never closed/);
    assert.match(parseHtml('x</div>').problems[0], /<\/div> closes something that was never opened/);
    assert.deepEqual(parseHtml('<ul><li>a<li>b</ul>').problems, [], 'list items may end without a closing tag');
  });
  test('the real site\'s own pages read without problems', () => {
    assert.deepEqual(parseHtml(readFileSync(join(staging.out, 'index.html'), 'utf8')).problems, []);
  });
});
