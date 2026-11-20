// What happens when someone sends a form: validation, spam protection, mail to staff, and the newsletter's
// double opt-in. Time is controlled by a fake clock and mail goes to memory, so nothing real is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForms, createLimiter } from '../server/forms.mjs';

const HOUR = 3600e3;
const DAY = 24 * HOUR;

function setup(opts = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'foundation-forms-'));
  const clock = { t: Date.UTC(2026, 10, 8, 12, 0, 0) };
  const sent = [];
  const held = [];
  const make = (extra = {}) =>
    createForms({
      dataDir,
      staffEmail: 'staff@foundation.example',
      mailFrom: 'no-reply@foundation.example',
      siteUrl: 'https://foundation.example',
      mail: { async send(m) { sent.push(m); return {}; } },
      held: { async send(m) { held.push(m); return {}; } },
      now: () => clock.t,
      ...opts,
      ...extra,
    });
  const forms = make();
  // a form as a browser would send it: the page loaded 10 seconds ago
  const fill = (f = {}) => ({ ts: String(clock.t - 10_000), website: '', ...f });
  return { dataDir, clock, sent, held, forms, make, fill, done: () => rmSync(dataDir, { recursive: true, force: true }) };
}

const contact = { name: 'Amina Rahimi', email: 'Amina@Example.org', topic: 'A question about a program', message: 'When does the Undergraduate Award open next year?' };
const partner = { organisation: 'Acme Bank', name: 'Lee Chan', email: 'lee@acme.example', interest: 'Sponsor an event or program', message: 'We would like to sponsor a scholarship night.' };

test.describe('contact form', () => {
  test('sends the message to staff, with the visitor\'s address as the reply address', async () => {
    const s = setup();
    const r = await s.forms.contact(s.fill(contact), '203.0.113.5');
    assert.deepEqual(r, { ok: true, redirect: '/contact/sent/' });
    assert.equal(s.sent.length, 1);
    const m = s.sent[0];
    assert.equal(m.to, 'staff@foundation.example');
    assert.equal(m.from, 'no-reply@foundation.example');
    assert.equal(m.replyTo, 'amina@example.org');
    assert.equal(m.subject, '[Contact] A question about a program: Amina Rahimi');
    assert.match(m.text, /When does the Undergraduate Award open next year\?/);
    s.done();
  });
  test('line breaks in the name or email cannot add mail headers', async () => {
    const s = setup();
    await s.forms.contact(s.fill({ ...contact, name: 'Eve\r\nBcc: spy@evil.example' }), '1.1.1.1');
    assert.ok(!/[\r\n]/.test(s.sent[0].subject));
    const bad = await s.forms.contact(s.fill({ ...contact, email: 'a@b.org\r\nBcc: spy@evil.example' }), '1.1.1.2');
    assert.equal(bad.status, 422);
    assert.equal(s.sent.length, 1);
    s.done();
  });
  for (const [what, change, message] of [
    ['no name', { name: '  ' }, /tell us your name/],
    ['no topic', { topic: '' }, /choose what your message is about/],
    ['an invented topic', { topic: 'Free money' }, /choose what your message is about/],
    ['a short message', { message: 'Hi' }, /at least 10 characters/],
    ['three links', { message: 'See http://a.example and https://b.example and www.c.example please' }, /more than two links/],
  ]) {
    test(`refuses ${what} and says why`, async () => {
      const s = setup();
      const r = await s.forms.contact(s.fill({ ...contact, ...change }), '198.51.100.1');
      assert.equal(r.ok, false);
      assert.equal(r.status, 422);
      assert.match(r.message, message);
      assert.equal(s.sent.length, 0);
      s.done();
    });
  }
  for (const email of ['', 'nobody', 'a@b', 'a@b.c', 'two words@example.org', '"quoted"@example.org', 'a@b@example.org', '<a@example.org>', 'a,b@example.org']) {
    test(`refuses the email address "${email}"`, async () => {
      const s = setup();
      const r = await s.forms.contact(s.fill({ ...contact, email }), '198.51.100.2');
      assert.equal(r.status, 422);
      assert.match(r.message, /email address does not look right/);
      s.done();
    });
  }
  test('two links are fine; very long messages are cut at 4,000 characters', async () => {
    const s = setup();
    await s.forms.contact(s.fill({ ...contact, message: `${'x'.repeat(5000)} http://a.example http://b.example` }), '198.51.100.3');
    assert.equal(s.sent.length, 1);
    assert.ok(s.sent[0].text.length < 4400);
    s.done();
  });
  test('control characters are removed from what staff receive', async () => {
    const s = setup();
    await s.forms.contact(s.fill({ ...contact, message: 'Hello\u0000 there\u0007, this is a message' }), '198.51.100.4');
    assert.match(s.sent[0].text, /Hello there, this is a message/);
    s.done();
  });
});

test.describe('sponsor enquiry', () => {
  test('goes to staff with the organization named', async () => {
    const s = setup();
    const r = await s.forms.partner(s.fill(partner), '203.0.113.9');
    assert.deepEqual(r, { ok: true, redirect: '/partner/sent/' });
    assert.equal(s.sent[0].subject, '[Partner] Sponsor an event or program: Acme Bank');
    assert.equal(s.sent[0].replyTo, 'lee@acme.example');
    s.done();
  });
  test('needs the organization, a real interest and a message', async () => {
    const s = setup();
    assert.match((await s.forms.partner(s.fill({ ...partner, organisation: '' }), '9.9.9.1')).message, /name of your organization/);
    assert.match((await s.forms.partner(s.fill({ ...partner, interest: 'Other' }), '9.9.9.2')).message, /how you would like to help/);
    assert.match((await s.forms.partner(s.fill({ ...partner, message: 'short' }), '9.9.9.3')).message, /at least 10 characters/);
    assert.equal(s.sent.length, 0);
    s.done();
  });
});

test.describe('spam protection', () => {
  test('a filled-in hidden field looks like success to the bot, sends nothing, and keeps a private copy', async () => {
    const s = setup();
    const r = await s.forms.contact(s.fill({ ...contact, website: 'http://spam.example' }), '192.0.2.1');
    assert.deepEqual(r, { ok: true, redirect: '/contact/sent/' });
    assert.equal(s.sent.length, 0, 'nothing is emailed');
    assert.equal(s.held.length, 1, 'but nothing a person wrote is lost silently');
    assert.equal(s.held[0].kind, 'contact');
    assert.match(s.held[0].reason, /spam-trap/);
    assert.equal(s.held[0].fields.message, contact.message);
    assert.ok(!('ts' in s.held[0].fields) && !('ip' in s.held[0]), 'no timing data and no address is kept');
    const n = await s.forms.subscribe(s.fill({ email: 'bot@example.org', website: 'x' }), '192.0.2.1');
    assert.equal(n.redirect, '/newsletter/check-your-email/');
    assert.equal(s.sent.length, 0);
    s.done();
  });
  test('the private copies are limited so a flood cannot fill the disk', async () => {
    const s = setup();
    for (let i = 0; i < 150; i++) await s.forms.contact(s.fill({ ...contact, website: 'x' }), `192.0.2.${i}`);
    assert.equal(s.held.length, 100);
    s.done();
  });
  test('a form sent within three seconds of loading is turned away with a clear message', async () => {
    const s = setup();
    const fast = await s.forms.contact({ ...contact, ts: String(s.clock.t - 1000), website: '' }, '192.0.2.2');
    assert.equal(fast.status, 422);
    assert.match(fast.message, /very quickly/);
    const future = await s.forms.contact({ ...contact, ts: String(s.clock.t + 60_000), website: '' }, '192.0.2.2');
    assert.equal(future.status, 422);
    const ok = await s.forms.contact({ ...contact, ts: String(s.clock.t - 3000), website: '' }, '192.0.2.2');
    assert.equal(ok.ok, true);
    s.done();
  });
  test('without the timing field (scripts off) the form still works, with a lower limit', async () => {
    const s = setup();
    const send = () => s.forms.contact({ ...contact, website: '' }, '192.0.2.3');
    assert.equal((await send()).ok, true);
    assert.equal((await send()).ok, true);
    const third = await send();
    assert.equal(third.status, 429);
    s.done();
  });
  test('five messages an hour from one connection, then a polite stop; the hour passes and it works again', async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) assert.equal((await s.forms.contact(s.fill(contact), '192.0.2.4')).ok, true);
    const sixth = await s.forms.contact(s.fill(contact), '192.0.2.4');
    assert.equal(sixth.status, 429);
    assert.match(sixth.message, /Too many messages from this connection/);
    assert.equal((await s.forms.contact(s.fill(contact), '192.0.2.5')).ok, true, 'another connection is not affected');
    s.clock.t += HOUR + 1000;
    assert.equal((await s.forms.contact(s.fill(contact), '192.0.2.4')).ok, true);
    s.done();
  });
  test('each form has its own count, and the whole site has a ceiling', async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) await s.forms.contact(s.fill(contact), '192.0.2.6');
    assert.equal((await s.forms.partner(s.fill(partner), '192.0.2.6')).ok, true);
    const s2 = setup();
    let last;
    for (let i = 0; i < 301; i++) last = await s2.forms.contact(s2.fill(contact), `10.${i >> 8}.${i & 255}.1`);
    assert.equal(last.status, 429);
    s.done();
    s2.done();
  });
  test('the limiter forgets old visitors', () => {
    let t = 0;
    const l = createLimiter(() => t);
    assert.equal(l.take('a', 1, 1000), true);
    assert.equal(l.take('a', 1, 1000), false);
    t = 3 * HOUR;
    l.sweep();
    assert.equal(l.take('a', 1, 1000), true);
  });
});

test.describe('newsletter double opt-in', () => {
  const tokenFrom = (mail) => new URL(/https:\/\/\S+/.exec(mail.text)[0]).searchParams.get('token');

  test('signing up emails a link and stores nothing yet', async () => {
    const s = setup();
    const r = await s.forms.subscribe(s.fill({ email: 'Student@Example.org' }), '203.0.113.20');
    assert.deepEqual(r, { ok: true, redirect: '/newsletter/check-your-email/' });
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0].to, 'student@example.org');
    assert.match(s.sent[0].text, /https:\/\/foundation\.example\/newsletter\/confirm\?token=/);
    assert.match(s.sent[0].text, /within 3 days/);
    assert.deepEqual(s.forms.subscribers(), []);
    assert.ok(!existsSync(join(s.dataDir, 'newsletter.json')), 'no list is written before anyone confirms');
    s.done();
  });
  test('clicking the link subscribes the person, once, with the time recorded', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'student@example.org' }), '203.0.113.21');
    const token = tokenFrom(s.sent[0]);
    s.clock.t += 2 * HOUR;
    assert.deepEqual(s.forms.confirm(token), { ok: true, redirect: '/newsletter/confirmed/' });
    assert.deepEqual(s.forms.confirm(token), { ok: true, redirect: '/newsletter/confirmed/' });
    assert.deepEqual(s.forms.subscribers(), [{ email: 'student@example.org', confirmedAt: new Date(s.clock.t).toISOString() }]);
    s.done();
  });
  test('asking twice sends one email; an address already on the list gets none, and the page says the same thing', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'a@example.org' }), '203.0.113.22');
    const again = await s.forms.subscribe(s.fill({ email: 'a@example.org' }), '203.0.113.23');
    assert.equal(again.redirect, '/newsletter/check-your-email/');
    assert.equal(s.sent.length, 1);
    s.forms.confirm(tokenFrom(s.sent[0]));
    s.clock.t += HOUR;
    const known = await s.forms.subscribe(s.fill({ email: 'a@example.org' }), '203.0.113.24');
    assert.equal(known.redirect, '/newsletter/check-your-email/');
    assert.equal(s.sent.length, 1, 'nobody can find out who is subscribed by trying addresses');
    s.done();
  });
  test('a link works for three days and not after', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'b@example.org' }), '203.0.113.25');
    const token = tokenFrom(s.sent[0]);
    s.clock.t += 3 * DAY - 1000;
    assert.equal(s.forms.confirm(token).ok, true);
    const s2 = setup();
    await s2.forms.subscribe(s2.fill({ email: 'c@example.org' }), '203.0.113.26');
    const late = tokenFrom(s2.sent[0]);
    s2.clock.t += 3 * DAY + 1000;
    const r = s2.forms.confirm(late);
    assert.equal(r.status, 410);
    assert.match(r.message, /expired or is not valid/);
    assert.deepEqual(s2.forms.subscribers(), []);
    s.done();
    s2.done();
  });
  test('a changed, mixed-up or made-up link subscribes nobody and never crashes', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'd@example.org' }), '203.0.113.27');
    const token = tokenFrom(s.sent[0]);
    const [body, sig] = token.split('.');
    const forged = Buffer.from('victim@example.org\n' + Date.parse('2026-11-08T12:00:00Z')).toString('base64url');
    const other = setup({ secret: 'a-different-secret' });
    await other.forms.subscribe(other.fill({ email: 'd@example.org' }), '203.0.113.28');
    for (const bad of [null, undefined, '', 'x', '.', 'a.b', `${body}.`, `.${sig}`, `${body}.${sig}x`, `${body}.${sig.slice(1)}`, `${forged}.${sig}`, `${body}.${'A'.repeat(sig.length)}`, tokenFrom(other.sent[0]), '%%%.%%%', 'é.é']) {
      const r = s.forms.confirm(bad);
      assert.equal(r.ok, false, `accepted ${String(bad).slice(0, 30)}`);
      assert.equal(r.status, 410);
    }
    assert.deepEqual(s.forms.subscribers(), []);
    s.done();
    other.done();
  });
  test('a sign-up link cannot be used as an unsubscribe link, nor the other way round', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'e@example.org' }), '203.0.113.29');
    const confirmToken = tokenFrom(s.sent[0]);
    assert.equal(s.forms.unsubscribe(confirmToken).ok, false);
    const unsub = new URL(s.forms.unsubscribeLink('e@example.org')).searchParams.get('token');
    assert.equal(s.forms.confirm(unsub).ok, false);
    s.done();
  });
  test('the unsubscribe link removes the person, never expires, and can be used twice', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'f@example.org' }), '203.0.113.30');
    s.forms.confirm(tokenFrom(s.sent[0]));
    const link = s.forms.unsubscribeLink('f@example.org');
    assert.match(link, /^https:\/\/foundation\.example\/newsletter\/unsubscribe\?token=/);
    s.clock.t += 400 * DAY;
    const token = new URL(link).searchParams.get('token');
    assert.deepEqual(s.forms.unsubscribe(token), { ok: true, redirect: '/newsletter/unsubscribed/' });
    assert.deepEqual(s.forms.subscribers(), []);
    assert.equal(s.forms.unsubscribe(token).ok, true);
    assert.equal(s.forms.unsubscribe('nonsense').status, 410);
    s.done();
  });
  test('only the person who signed up is added, and only the right address is removed', async () => {
    const s = setup();
    for (const e of ['one@example.org', 'two@example.org']) {
      await s.forms.subscribe(s.fill({ email: e }), `203.0.113.${e.length}`);
      s.forms.confirm(tokenFrom(s.sent.at(-1)));
    }
    s.forms.unsubscribe(new URL(s.forms.unsubscribeLink('one@example.org')).searchParams.get('token'));
    assert.deepEqual(s.forms.subscribers().map((x) => x.email), ['two@example.org']);
    s.done();
  });
  test('the list and the signing key survive a restart, and old links still work', async () => {
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'g@example.org' }), '203.0.113.31');
    const token = tokenFrom(s.sent[0]);
    const restarted = createForms({ dataDir: s.dataDir, staffEmail: 'x@x.org', mailFrom: 'y@y.org', siteUrl: 'https://foundation.example', mail: { async send() {} }, held: { async send() {} }, now: () => s.clock.t });
    assert.equal(restarted.confirm(token).ok, true);
    const again = createForms({ dataDir: s.dataDir, staffEmail: 'x@x.org', mailFrom: 'y@y.org', siteUrl: 'https://foundation.example', mail: { async send() {} }, held: { async send() {} }, now: () => s.clock.t });
    assert.deepEqual(again.subscribers().map((x) => x.email), ['g@example.org']);
    s.done();
  });
  test('the list and the key are readable only by the server\'s own user', async (t) => {
    if (process.platform === 'win32') return t.skip('file modes do not apply on Windows');
    const s = setup();
    await s.forms.subscribe(s.fill({ email: 'h@example.org' }), '203.0.113.32');
    s.forms.confirm(tokenFrom(s.sent[0]));
    for (const f of ['newsletter.json', 'secret.key']) assert.equal(statSync(join(s.dataDir, f)).mode & 0o077, 0, `${f} is open to other users`);
    s.done();
  });
  test('an address that is not an address is refused', async () => {
    const s = setup();
    const r = await s.forms.subscribe(s.fill({ email: 'nope' }), '203.0.113.33');
    assert.equal(r.status, 422);
    assert.equal(s.sent.length, 0);
    s.done();
  });
});

test('with no mail service connected, every message is written to the outbox folder as a file', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'foundation-outbox-'));
  const forms = createForms({ dataDir, staffEmail: 'staff@foundation.example', mailFrom: 'no-reply@foundation.example', siteUrl: 'https://foundation.example', now: () => Date.now() + 60_000 });
  await forms.contact({ ...contact, ts: String(Date.now() - 10_000), website: '' }, '203.0.113.40');
  await forms.contact({ ...contact, ts: String(Date.now() - 10_000), website: 'bot' }, '203.0.113.41');
  const outbox = readdirSync(join(dataDir, 'outbox'));
  const held = readdirSync(join(dataDir, 'held'));
  assert.equal(outbox.length, 1);
  assert.equal(held.length, 1);
  const mail = JSON.parse(readFileSync(join(dataDir, 'outbox', outbox[0]), 'utf8'));
  assert.equal(mail.to, 'staff@foundation.example');
  if (process.platform !== 'win32') assert.equal(statSync(join(dataDir, 'outbox', outbox[0])).mode & 0o077, 0);
  rmSync(dataDir, { recursive: true, force: true });
});
