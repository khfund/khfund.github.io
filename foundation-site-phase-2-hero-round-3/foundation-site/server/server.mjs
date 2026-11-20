#!/usr/bin/env node
// Serves the built site (dist/) and the three forms. No framework: one file, Node's own http module.
//
//   PORT=8080 HOST=127.0.0.1        where to listen
//   DIST_DIR=dist DATA_DIR=data     the built site, and where forms keep mail and subscribers (keep it private)
//   SITE_URL=https://example.org    public address, used in confirmation emails (default: "siteUrl" in content/site.json)
//   STAFF_EMAIL=staff@example.org   who receives contact and partner messages (default: "staffEmail" in content/site.json)
//   MAIL_FROM=no-reply@example.org
//   HTTPS=1                         the site is served over HTTPS (adds the HSTS header)
//   TRUST_PROXY=1                   behind a reverse proxy: read the visitor's address from X-Forwarded-For
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { securityHeaders } from '../src/lib/security.mjs';
import { createForms } from './forms.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.ico': 'image/x-icon',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml)|image\/svg)/;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createServer(opts = {}) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const env = process.env;
  const dist = resolve(opts.dist ?? env.DIST_DIR ?? join(root, 'dist'));
  const dataDir = resolve(opts.dataDir ?? env.DATA_DIR ?? join(root, 'data'));
  // One place for each fact by default: the settings file the site was built from (content/site.json).
  // An environment variable, if set, overrides it. A value still in [[brackets]] counts as not set.
  const settings = (() => {
    try {
      return JSON.parse(readFileSync(opts.siteFile ?? join(root, 'content', 'site.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const real = (v) => (typeof v === 'string' && v.trim() && !/\[\[/.test(v) ? v.trim() : undefined);
  const siteUrl = (opts.siteUrl ?? real(env.SITE_URL) ?? real(settings.siteUrl) ?? 'http://localhost:8080').replace(/\/+$/, '');
  const https = opts.https ?? env.HTTPS === '1';
  const trustProxy = opts.trustProxy ?? env.TRUST_PROXY === '1';
  const staffEmail = opts.staffEmail ?? real(env.STAFF_EMAIL) ?? real(settings.staffEmail) ?? 'staff@example.invalid';
  const mailFrom = opts.mailFrom ?? env.MAIL_FROM ?? 'no-reply@example.invalid';
  const analyticsSrc = opts.analyticsSrc ?? '';
  const log = opts.log ?? ((line) => console.log(line));
  const forms = opts.forms ?? createForms({ dataDir, staffEmail, mailFrom, siteUrl, mail: opts.mail, held: opts.held, now: opts.now, minFillMs: opts.minFillMs });
  const headers = securityHeaders({ https, analyticsSrc });
  const cache = new Map();

  const sweeper = setInterval(() => forms.limiter?.sweep(), 10 * 60e3);
  sweeper.unref();

  const sendHeaders = (res, extra = {}) => {
    for (const [k, v] of Object.entries({ ...headers, ...extra })) res.setHeader(k, v);
  };

  function send(req, res, status, body, type, extra = {}, cacheKey = null) {
    sendHeaders(res, extra);
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const accept = String(req.headers['accept-encoding'] ?? '');
    let out = buf;
    if (COMPRESSIBLE.test(type) && buf.length > 512) {
      const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
      if (enc) {
        const squeeze = () => (enc === 'br' ? zlib.brotliCompressSync(buf) : zlib.gzipSync(buf));
        if (cacheKey) {
          const k = `${enc}:${cacheKey}`;
          if (!cache.has(k)) cache.set(k, squeeze());
          out = cache.get(k);
        } else out = squeeze();
        res.setHeader('Content-Encoding', enc);
      }
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.setHeader('Content-Length', out.length);
    res.end(req.method === 'HEAD' ? undefined : out);
  }

  function fileFor(pathname) {
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    if (rel.includes('\0')) return null;
    let file = resolve(join(dist, rel));
    if (file !== dist && !file.startsWith(dist + sep)) return null;
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    return existsSync(file) && statSync(file).isFile() && !file.endsWith('build-report.json') && !file.endsWith('_headers') ? file : null;
  }

  function sendFile(req, res, file, status = 200) {
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const extra = /[\\/]assets[\\/]/.test(file) ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : { 'Cache-Control': 'no-cache' };
    send(req, res, status, readFileSync(file), type, extra, `${file}:${statSync(file).mtimeMs}`);
  }

  function notFound(req, res) {
    const page = join(dist, '404.html');
    if (existsSync(page)) return sendFile(req, res, page, 404);
    return send(req, res, 404, 'Not found', 'text/plain; charset=utf-8');
  }

  function errorPage(req, res, status, message) {
    const page = join(dist, 'form-error', 'index.html');
    if (!existsSync(page)) return send(req, res, status, message, 'text/plain; charset=utf-8');
    const html = readFileSync(page, 'utf8').replace(/<!--message-start-->[\s\S]*?<!--message-end-->/, esc(message));
    return send(req, res, status, html, TYPES['.html'], { 'Cache-Control': 'no-store' });
  }

  const redirect = (res, to) => {
    sendHeaders(res, { Location: to, 'Cache-Control': 'no-store' });
    res.statusCode = 303;
    res.end();
  };

  function clientIp(req) {
    if (trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  // Forms must come from this site's own pages. Behind a trusted proxy the visitor's host is in X-Forwarded-Host.
  function sameOrigin(req) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    const origin = req.headers.origin;
    if (!origin || origin === 'null') return !origin;
    const forwarded = trustProxy ? String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim() : '';
    try {
      return new URL(origin).host === (forwarded || req.headers.host);
    } catch {
      return false;
    }
  }

  // Reads a form. A body over the limit is answered with a clear message, so the visitor sees why, rather than
  // a dropped connection. The rest of an oversized upload is read and thrown away; a client that keeps sending
  // far past the limit is cut off.
  const BODY_LIMIT = 32 * 1024;
  function readBody(req, limit = BODY_LIMIT) {
    return new Promise((resolveBody, reject) => {
      let size = 0;
      let failed = false;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          if (!failed) reject(Object.assign(new Error('too large'), { status: 413 }));
          failed = true;
          if (size > limit + 1024 * 1024) req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const FORMS = { '/api/contact': 'contact', '/api/partner': 'partner', '/api/newsletter': 'subscribe' };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (path === '/healthz') return send(req, res, 200, 'ok', 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store' });

    if (FORMS[path]) {
      if (req.method !== 'POST') return send(req, res, 405, 'Use the form on the page.', 'text/plain; charset=utf-8', { Allow: 'POST' });
      if (!sameOrigin(req)) return errorPage(req, res, 403, 'This form can only be sent from this site.');
      let fields;
      try {
        if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) throw Object.assign(new Error('too large'), { status: 413 });
        const raw = await readBody(req);
        const type = String(req.headers['content-type'] ?? '');
        fields = type.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      } catch (e) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        return errorPage(req, res, e.status ?? 400, e.status === 413 ? 'That is too much text for this form.' : 'The form could not be read.');
      }
      const result = await forms[FORMS[path]](fields, clientIp(req));
      return result.ok ? redirect(res, result.redirect ?? '/') : errorPage(req, res, result.status, result.message);
    }

    if (path === '/newsletter/confirm' || path === '/newsletter/unsubscribe') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
      const token = url.searchParams.get('token');
      const result = path.endsWith('confirm') ? forms.confirm(token) : forms.unsubscribe(token);
      return result.ok ? redirect(res, result.redirect) : errorPage(req, res, result.status, result.message);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD, POST' });
    const file = fileFor(path);
    if (file) {
      // "/about" -> "/about/" so relative links keep working
      if (!path.endsWith('/') && file.endsWith('index.html') && !extname(path)) return redirect(res, `${path}/${url.search}`);
      return sendFile(req, res, file);
    }
    return notFound(req, res);
  }

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      await handle(req, res);
    } catch (e) {
      log(`error ${req.method} ${req.url}: ${e.stack ?? e}`);
      if (!res.headersSent) send(req, res, 500, 'Something went wrong on our side. Please try again.', 'text/plain; charset=utf-8');
      else res.end();
    }
    log(`${req.method} ${new URL(req.url, 'http://x').pathname} ${res.statusCode} ${Date.now() - started}ms`);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, forms, dist, dataDir, staffEmail, siteUrl };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '127.0.0.1';
  const { server, dist, dataDir, staffEmail } = createServer();
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`Nothing to serve: ${dist}/index.html does not exist. Run "npm run build" first.`);
    process.exit(1);
  }
  if (staffEmail.endsWith('@example.invalid')) console.warn('No staff mailbox is set (staffEmail in content/site.json, or the STAFF_EMAIL variable). Contact messages are written to the outbox folder and addressed to staff@example.invalid.');
  server.listen(port, host, () => console.log(`Serving ${dist} at http://${host}:${port}  (forms keep data in ${dataDir})`));
}
