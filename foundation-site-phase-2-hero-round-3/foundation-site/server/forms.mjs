// What happens when a form is sent: check it, turn away spam, mail it to staff, and run the newsletter's
// double opt-in (the address is stored only after its owner clicks the link we email to it).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_TOPICS, PARTNER_INTERESTS, LIMITS } from '../src/lib/formspec.mjs';
import { fileOutbox } from './mail.mjs';
import { jsonStore } from './store.mjs';

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (v, max) => String(v ?? '').replace(CONTROL, '').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const HOUR = 3600e3;

export function createLimiter(now = Date.now) {
  const hits = new Map();
  return {
    // true when the caller is under the limit (and the call is counted), false when over it
    take(key, max, windowMs) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
    sweep(maxAgeMs = 2 * HOUR) {
      const t = now();
      for (const [k, v] of hits) if (!v.some((x) => t - x < maxAgeMs)) hits.delete(k);
    },
  };
}

function loadSecret(dataDir, given) {
  if (given) return given;
  const file = join(dataDir, 'secret.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const s = randomBytes(32).toString('base64url');
  writeFileSync(file, `${s}\n`, { mode: 0o600 });
  return s;
}

export function createForms({ dataDir, staffEmail, mailFrom, siteUrl, mail = fileOutbox(join(dataDir, 'outbox')), held = fileOutbox(join(dataDir, 'held')), secret, now = Date.now, minFillMs = 3000 }) {
  const limiter = createLimiter(now);
  const store = jsonStore(join(dataDir, 'newsletter.json'), { subscribers: [] });
  const key = loadSecret(dataDir, secret);

  const sign = (s) => createHmac('sha256', key).update(s).digest('base64url');
  const token = (kind, email, ts) => `${Buffer.from(`${email}\n${ts}`).toString('base64url')}.${sign(`${kind}\n${email}\n${ts}`)}`;
  function readToken(kind, tok, maxAgeMs = Infinity) {
    const [body, sig] = String(tok ?? '').split('.');
    if (!body || !sig) return null;
    const [email, ts] = Buffer.from(body, 'base64url').toString().split('\n');
    const want = Buffer.from(sign(`${kind}\n${email}\n${ts}`));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    if (now() - Number(ts) > maxAgeMs) return null;
    return email;
  }

  const fail = (status, message) => ({ ok: false, status, message });
  const done = (redirect) => ({ ok: true, redirect });

  // Checks every form shares. Returns a result when the form must stop here, otherwise null.
  async function gate(kind, f, ip) {
    if (clean(f.website, 200)) {
      // The hidden field: only bots fill it, so the bot is told it worked and nothing is emailed. But a person whose
      // browser auto-filled it would lose their message without a word, so a copy is kept in data/held/ for staff.
      if (limiter.take('held:all', 100, HOUR)) {
        const fields = Object.fromEntries(Object.entries(f).slice(0, 12).filter(([k]) => k !== 'ts').map(([k, v]) => [k.slice(0, 40), clean(v, LIMITS.message)]));
        await held.send({ kind, reason: 'the hidden spam-trap field was filled in', fields });
      }
      return done(null);
    }
    const ts = Number(f.ts);
    const timed = Number.isFinite(ts) && ts > 0;
    if (timed && now() - ts < minFillMs) return fail(422, 'That was sent very quickly. Please wait a few seconds and send it again.');
    if (!limiter.take(`${kind}:${ip}`, timed ? 5 : 2, HOUR) || !limiter.take(`${kind}:all`, 300, HOUR)) {
      return fail(429, 'Too many messages from this connection. Please try again in an hour, or write to us by post.');
    }
    return null;
  }

  function checkEmail(f) {
    const email = oneLine(f.email, LIMITS.email).toLowerCase();
    return EMAIL.test(email) ? email : null;
  }

  function checkMessage(text) {
    const m = clean(text, LIMITS.message);
    if (m.length < 10) return { error: 'Please write a message of at least 10 characters.' };
    if ((m.match(/https?:\/\/|www\./gi) ?? []).length > 2) return { error: 'Messages with more than two links are not accepted. Please remove some links and send it again.' };
    return { value: m };
  }

  async function toStaff({ subject, replyTo, lines }) {
    return mail.send({ to: staffEmail, from: mailFrom, replyTo, subject, text: `${lines.join('\n')}\n` });
  }

  return {
    limiter,

    async contact(f, ip) {
      const stop = await gate('contact', f, ip);
      if (stop) return stop.ok ? done('/contact/sent/') : stop;
      const name = oneLine(f.name, LIMITS.name);
      const email = checkEmail(f);
      const topic = CONTACT_TOPICS.includes(f.topic) ? f.topic : null;
      const msg = checkMessage(f.message);
      if (!name) return fail(422, 'Please tell us your name.');
      if (!email) return fail(422, 'That email address does not look right. Please check it and send again.');
      if (!topic) return fail(422, 'Please choose what your message is about.');
      if (msg.error) return fail(422, msg.error);
      await toStaff({ subject: `[Contact] ${topic}: ${name}`, replyTo: email, lines: ['A message from the website contact form.', '', `Name: ${name}`, `Email: ${email}`, `Topic: ${topic}`, '', msg.value] });
      return done('/contact/sent/');
    },

    async partner(f, ip) {
      const stop = await gate('partner', f, ip);
      if (stop) return stop.ok ? done('/partner/sent/') : stop;
      const org = oneLine(f.organisation, LIMITS.organisation);
      const name = oneLine(f.name, LIMITS.name);
      const email = checkEmail(f);
      const interest = PARTNER_INTERESTS.includes(f.interest) ? f.interest : null;
      const msg = checkMessage(f.message);
      if (!org) return fail(422, 'Please tell us the name of your organization.');
      if (!name) return fail(422, 'Please tell us your name.');
      if (!email) return fail(422, 'That email address does not look right. Please check it and send again.');
      if (!interest) return fail(422, 'Please choose how you would like to help.');
      if (msg.error) return fail(422, msg.error);
      await toStaff({ subject: `[Partner] ${interest}: ${org}`, replyTo: email, lines: ['A sponsor enquiry from the website.', '', `Organization: ${org}`, `Name: ${name}`, `Email: ${email}`, `Interest: ${interest}`, '', msg.value] });
      return done('/partner/sent/');
    },

    // Step 1 of double opt-in: email a link. Nothing is stored yet.
    async subscribe(f, ip) {
      const stop = await gate('newsletter', f, ip);
      if (stop) return stop.ok ? done('/newsletter/check-your-email/') : stop;
      const email = checkEmail(f);
      if (!email) return fail(422, 'That email address does not look right. Please check it and try again.');
      const already = store.data.subscribers.some((s) => s.email === email);
      // one email per address per ten minutes, and the same answer whether or not it is already subscribed
      if (!already && limiter.take(`confirm:${email}`, 1, 10 * 60e3)) {
        const link = `${siteUrl}/newsletter/confirm?token=${encodeURIComponent(token('confirm', email, now()))}`;
        await mail.send({
          to: email,
          from: mailFrom,
          subject: 'Please confirm your email address',
          text: `Someone, hopefully you, asked to get news from us at this address.\n\nTo confirm, open this link within 3 days:\n${link}\n\nIf it was not you, ignore this email. We will not write to you again.\n`,
        });
      }
      return done('/newsletter/check-your-email/');
    },

    // Step 2: the owner clicked the link.
    confirm(tok) {
      const email = readToken('confirm', tok, 3 * 24 * HOUR);
      if (!email) return fail(410, 'This confirmation link has expired or is not valid. Sign up again to get a new one.');
      if (!store.data.subscribers.some((s) => s.email === email)) {
        store.data.subscribers.push({ email, confirmedAt: new Date(now()).toISOString() });
        store.save();
      }
      return done('/newsletter/confirmed/');
    },

    // The link every newsletter email carries (also usable by hand).
    unsubscribeLink(email) {
      return `${siteUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token('unsub', email, 0))}`;
    },
    unsubscribe(tok) {
      const email = readToken('unsub', tok);
      if (!email) return fail(410, 'This unsubscribe link is not valid. Reply to any of our emails and we will remove you.');
      const before = store.data.subscribers.length;
      store.data.subscribers = store.data.subscribers.filter((s) => s.email !== email);
      if (store.data.subscribers.length !== before) store.save();
      return done('/newsletter/unsubscribed/');
    },

    subscribers: () => store.data.subscribers.map((s) => ({ ...s })),
  };
}
