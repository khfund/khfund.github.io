// The web server: what it sends, what it refuses, and the three forms end to end over real HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { createServer } from '../server/server.mjs';
import { bootHash } from '../src/lib/security.mjs';
import { ROOT } from './lib/fixture.mjs';

const work = mkdtempSync(join(tmpdir(), 'foundation-server-'));
const dist = join(work, 'dist');
const built = build({ root: ROOT, out: dist, now: new Date('2026-11-08T10:00:00Z') });
assert.ok(built.ok, 'the site must build for these tests');
writeFileSync(join(work, 'secret.txt'), 'top secret');
const running = [];
test.after(() => {
  for (const server of running) server.closeAllConnections();
  for (const server of running) server.close();
  rmSync(work, { recursive: true, force: true });
});

async function start(opts = {}) {
  const dataDir = mkdtempSync(join(work, 'data-'));
  const mail = [];
  const held = [];
  const clock = { t: Date.parse('2026-11-08T12:00:00Z') };
  const { server, forms } = createServer({
    dist,
    dataDir,
    siteUrl: 'https://foundation.example',
    staffEmail: 'staff@foundation.example',
    mail: { async send(m) { mail.push(m); } },
    held: { async send(m) { held.push(m); } },
    now: () => clock.t,
    log: () => {},
    ...opts,
  });
  running.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const request = ({ method = 'GET', path = '/', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, buf, text: buf.toString('utf8') });
        });
      });
      req.on('error', reject);
      req.end(body);
    });
  // A form sent from the site's own page, ten seconds after the page loaded.
  const post = (path, fields, { headers = {}, json = false } = {}) =>
    request({
      method: 'POST',
      path,
      headers: { Origin: origin, 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded', ...headers },
      body: json ? JSON.stringify({ ts: String(clock.t - 10_000), website: '', ...fields }) : new URLSearchParams({ ts: String(clock.t - 10_000), website: '', ...fields }).toString(),
    });
  return { request, post, mail, held, clock, forms, origin, dataDir, close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }) };
}

const contact = { name: 'Amina Rahimi', email: 'amina@example.org', topic: 'Something else', message: 'A question about the next round.' };

test.describe('pages and files', () => {
  test('pages come with the security headers', async () => {
    const s = await start();
    const r = await s.request({ path: '/' });
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /^text\/html; charset=utf-8/);
    const csp = r.headers['content-security-policy'];
    assert.ok(csp.includes(`script-src 'self' ${bootHash()}`));
    assert.ok(!/unsafe-/.test(csp));
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(r.headers['permissions-policy'], /camera=\(\)/);
    assert.equal(r.headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(r.headers['strict-transport-security'], undefined, 'no HSTS over plain http');
    assert.equal(r.headers['cache-control'], 'no-cache');
    await s.close();
  });
  test('HSTS is added when the site runs over https', async () => {
    const s = await start({ https: true });
    assert.match((await s.request({ path: '/' })).headers['strict-transport-security'], /max-age=63072000/);
    await s.close();
  });
  test('styles, scripts and fonts are cached for a year and compressed when the browser accepts it', async () => {
    const s = await start();
    const css = await s.request({ path: '/assets/site.css', headers: { 'Accept-Encoding': 'br, gzip' } });
    assert.equal(css.status, 200);
    assert.match(css.headers['cache-control'], /immutable/);
    assert.equal(css.headers['content-encoding'], 'br');
    assert.equal(css.headers.vary, 'Accept-Encoding');
    const plain = await s.request({ path: '/assets/site.css' });
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.ok(plain.buf.length > css.buf.length * 2);
    const font = await s.request({ path: '/assets/fonts/inter-regular.woff', headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(font.headers['content-type'], 'font/woff');
    assert.equal(font.headers['content-encoding'], undefined, 'already-compressed fonts are sent as they are');
    await s.close();
  });
  test('a folder address without the slash is sent to the one with it', async () => {
    const s = await start();
    const r = await s.request({ path: '/about?x=1' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, '/about/?x=1');
    await s.close();
  });
  test('an unknown address gets the 404 page, with the same headers', async () => {
    const s = await start();
    const r = await s.request({ path: '/no/such/page/' });
    assert.equal(r.status, 404);
    assert.match(r.text, /<title>/);
    assert.ok(r.headers['content-security-policy']);
    await s.close();
  });
  test('nothing outside the site folder can be read, and the build files stay private', async () => {
    const s = await start();
    for (const path of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/%00', '/assets/%00.css', '/%c0%ae%c0%ae/secret.txt', '/build-report.json', '/_headers', '/%5C..%5Csecret.txt']) {
      const r = await s.request({ path });
      assert.ok([404, 400, 303].includes(r.status), `${path} gave ${r.status}`);
      assert.ok(!r.text.includes('top secret'), `${path} leaked a file`);
      if (r.status === 303) assert.ok(!r.headers.location.includes('..'));
    }
    await s.close();
  });
  test('HEAD sends headers and no body; other methods are refused', async () => {
    const s = await start();
    const head = await s.request({ method: 'HEAD', path: '/' });
    assert.equal(head.status, 200);
    assert.equal(head.buf.length, 0);
    assert.ok(Number(head.headers['content-length']) > 1000);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await s.request({ method, path: '/', headers: { Origin: s.origin } });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.allow, 'GET, HEAD, POST');
    }
    await s.close();
  });
  test('the health address answers for monitoring', async () => {
    const s = await start();
    const r = await s.request({ path: '/healthz' });
    assert.equal(r.status, 200);
    assert.equal(r.text, 'ok');
    assert.equal(r.headers['cache-control'], 'no-store');
    await s.close();
  });
});

test.describe('forms over HTTP', () => {
  test('a contact message is accepted and the visitor lands on the thank-you page', async () => {
    const s = await start();
    const r = await s.post('/api/contact', contact);
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, '/contact/sent/');
    assert.equal(s.mail.length, 1);
    assert.equal(s.mail[0].to, 'staff@foundation.example');
    assert.equal((await s.request({ path: r.headers.location })).status, 200);
    await s.close();
  });
  test('JSON works as well as a normal form', async () => {
    const s = await start();
    const r = await s.post('/api/partner', { organisation: 'Acme', name: 'Lee', email: 'lee@acme.example', interest: 'Something else', message: 'We would like to help.' }, { json: true });
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, '/partner/sent/');
    await s.close();
  });
  test('a mistake shows the site\'s own error page with the reason, and the right status', async () => {
    const s = await start();
    const r = await s.post('/api/contact', { ...contact, email: 'nope' });
    assert.equal(r.status, 422);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.text, /That email address does not look right/);
    assert.match(r.text, /<main/);
    assert.ok(!r.text.includes('<!--message-start-->'));
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(s.mail.length, 0);
    await s.close();
  });
  test('a form from another site is refused, however it is sent', async () => {
    const s = await start();
    for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site', Origin: s.origin }, { Origin: 'not a url' }]) {
      const r = await s.post('/api/contact', contact, { headers });
      assert.equal(r.status, 403, JSON.stringify(headers));
      assert.match(r.text, /can only be sent from this site/);
    }
    assert.equal(s.mail.length, 0);
    await s.close();
  });
  test('a form is accepted when the browser says it came from the same site', async () => {
    const s = await start();
    assert.equal((await s.post('/api/contact', contact, { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 303);
    await s.close();
  });
  test('behind a trusted proxy the public address in X-Forwarded-Host is the one that counts', async () => {
    const behind = await start({ trustProxy: true });
    const ok = await behind.post('/api/contact', contact, { headers: { Origin: 'https://foundation.example', 'X-Forwarded-Host': 'foundation.example' } });
    assert.equal(ok.status, 303);
    await behind.close();
    const direct = await start();
    const refused = await direct.post('/api/contact', contact, { headers: { Origin: 'https://foundation.example', 'X-Forwarded-Host': 'foundation.example' } });
    assert.equal(refused.status, 403, 'a visitor cannot choose the host unless the operator trusts the proxy');
    await direct.close();
  });
  test('the form addresses answer only to POST', async () => {
    const s = await start();
    const r = await s.request({ path: '/api/contact' });
    assert.equal(r.status, 405);
    assert.equal(r.headers.allow, 'POST');
    await s.close();
  });
  test('a huge or broken body is refused politely', async () => {
    const s = await start();
    const big = await s.post('/api/contact', { ...contact, message: 'x'.repeat(40 * 1024) });
    assert.equal(big.status, 413);
    assert.match(big.text, /too much text/);
    const broken = await s.request({ method: 'POST', path: '/api/contact', headers: { Origin: s.origin, 'Content-Type': 'application/json' }, body: '{not json' });
    assert.equal(broken.status, 400);
    assert.match(broken.text, /could not be read/);
    await s.close();
  });
  test('the visitor\'s address for rate limiting is the connection, unless a proxy is trusted', async () => {
    const s = await start();
    for (let i = 0; i < 5; i++) assert.equal((await s.post('/api/contact', contact, { headers: { 'X-Forwarded-For': `10.0.0.${i}` } })).status, 303);
    const sixth = await s.post('/api/contact', contact, { headers: { 'X-Forwarded-For': '10.0.0.99' } });
    assert.equal(sixth.status, 429, 'a made-up X-Forwarded-For does not get a fresh allowance');
    await s.close();
    const behind = await start({ trustProxy: true });
    for (let i = 0; i < 5; i++) await behind.post('/api/contact', contact, { headers: { 'X-Forwarded-For': '10.0.0.1' } });
    assert.equal((await behind.post('/api/contact', contact, { headers: { 'X-Forwarded-For': '10.0.0.1' } })).status, 429);
    assert.equal((await behind.post('/api/contact', contact, { headers: { 'X-Forwarded-For': '10.0.0.2' } })).status, 303);
    await behind.close();
  });

  test('the newsletter, end to end: sign up, confirm from the email, unsubscribe', async () => {
    const s = await start();
    const signup = await s.post('/api/newsletter', { email: 'Student@Example.org' });
    assert.equal(signup.status, 303);
    assert.equal(signup.headers.location, '/newsletter/check-your-email/');
    assert.deepEqual(s.forms.subscribers(), []);
    const confirmUrl = new URL(/https:\/\/\S+/.exec(s.mail[0].text)[0]);
    const confirmPath = confirmUrl.pathname + confirmUrl.search;
    assert.equal((await s.request({ method: 'POST', path: confirmPath, headers: { Origin: s.origin } })).status, 405, 'confirming is a visit to the link, not a form');
    const confirmed = await s.request({ path: confirmPath });
    assert.equal(confirmed.status, 303);
    assert.equal(confirmed.headers.location, '/newsletter/confirmed/');
    assert.deepEqual(s.forms.subscribers().map((x) => x.email), ['student@example.org']);
    const link = new URL(s.forms.unsubscribeLink('student@example.org'));
    const bye = await s.request({ path: link.pathname + link.search });
    assert.equal(bye.headers.location, '/newsletter/unsubscribed/');
    assert.deepEqual(s.forms.subscribers(), []);
    await s.close();
  });
  test('a wrong or old confirmation link shows a clear page and adds nobody', async () => {
    const s = await start();
    const r = await s.request({ path: '/newsletter/confirm?token=abc.def' });
    assert.equal(r.status, 410);
    assert.match(r.text, /expired or is not valid/);
    assert.equal((await s.request({ path: '/newsletter/confirm' })).status, 410);
    assert.deepEqual(s.forms.subscribers(), []);
    await s.close();
  });
  test('a bot that fills the hidden field is told it worked and nothing is sent', async () => {
    const s = await start();
    const r = await s.post('/api/contact', { ...contact, website: 'http://spam.example' });
    assert.equal(r.status, 303);
    assert.equal(s.mail.length, 0);
    assert.equal(s.held.length, 1);
    await s.close();
  });
});

test('a crash inside the server shows a plain message and keeps the server running', async () => {
  const broken = mkdtempSync(join(work, 'broken-'));
  mkdirSync(join(broken, 'dist'));
  writeFileSync(join(broken, 'dist', 'index.html'), '<!doctype html><title>x</title>');
  const s = await start({
    dist: join(broken, 'dist'),
    forms: { contact: async () => { throw new Error('mail service is down'); }, limiter: null },
    log: () => {},
  });
  const r = await s.post('/api/contact', contact);
  assert.equal(r.status, 500);
  assert.match(r.text, /Something went wrong on our side/);
  assert.ok(!r.text.includes('mail service is down'), 'the reason is logged, not shown to visitors');
  assert.equal((await s.request({ path: '/' })).status, 200, 'the server is still answering');
  await s.close();
});

test.describe('settings: one place for each fact', () => {
  const siteFile = join(work, 'site-settings.json');
  const quiet = { dist, dataDir: join(work, 'settings-data'), log: () => {} };
  const withEnv = (vars, fn) => {
    const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    try { return fn(); } finally { for (const [k, v] of Object.entries(before)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
  };

  test('the server uses the staff mailbox and public address from the settings file', () => {
    writeFileSync(siteFile, JSON.stringify({ staffEmail: 'hello@foundation.example', siteUrl: 'https://foundation.example/' }));
    withEnv({ STAFF_EMAIL: undefined, SITE_URL: undefined }, () => {
      const s = createServer({ ...quiet, siteFile });
      assert.equal(s.staffEmail, 'hello@foundation.example');
      assert.equal(s.siteUrl, 'https://foundation.example', 'the trailing slash is dropped');
    });
  });

  test('an environment variable overrides the settings file', () => {
    writeFileSync(siteFile, JSON.stringify({ staffEmail: 'hello@foundation.example', siteUrl: 'https://foundation.example' }));
    withEnv({ STAFF_EMAIL: 'desk@foundation.example', SITE_URL: 'https://www.foundation.example' }, () => {
      const s = createServer({ ...quiet, siteFile });
      assert.equal(s.staffEmail, 'desk@foundation.example');
      assert.equal(s.siteUrl, 'https://www.foundation.example');
    });
  });

  test('a value still in [[brackets]], or no settings file at all, is treated as not set', () => {
    writeFileSync(siteFile, JSON.stringify({ staffEmail: '[[staff mailbox]]', siteUrl: '' }));
    withEnv({ STAFF_EMAIL: undefined, SITE_URL: undefined }, () => {
      const a = createServer({ ...quiet, siteFile });
      assert.equal(a.staffEmail, 'staff@example.invalid');
      assert.equal(a.siteUrl, 'http://localhost:8080');
      const b = createServer({ ...quiet, siteFile: join(work, 'does-not-exist.json') });
      assert.equal(b.staffEmail, 'staff@example.invalid');
    });
  });
});
