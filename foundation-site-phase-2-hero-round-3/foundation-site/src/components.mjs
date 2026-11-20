// Small reusable pieces of page. Each returns html`` (already escaped) so they can be nested freely.
// `c` is the loaded content, `p` is the page being built ({ path, L }), where p.L() makes a link that
// works from that page whatever link style the build uses.
import { html, raw, ph } from './lib/html.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { CONTACT_TOPICS, PARTNER_INTERESTS, LIMITS } from './lib/formspec.mjs';

export const plain = (s) => String(s ?? '').replace(/\[\[(.+?)\]\]/g, '$1');
export const mdHtml = (p, src, offset = 0) => raw(renderMarkdown(src, { link: p.L, offset }).html);
export const mdToc = (p, src) => renderMarkdown(src, { link: p.L }).toc;

export const STATE_LABEL = { open: 'Open', upcoming: 'Opening soon', closed: 'Closed' };

export const badge = (state, label) => html`<span class="badge ${state}">${label ?? STATE_LABEL[state]}</span>`;

export function button(href, label, kind = '') {
  return html`<a class="btn ${kind}" href="${href}">${label}</a>`;
}

export function amountText(c, pr) {
  const { amountMin: lo, amountMax: hi } = pr;
  if (lo != null && lo !== hi) return `${c.fmt.money(lo)} to ${c.fmt.money(hi)}`;
  return lo === hi ? c.fmt.money(hi) : `Up to ${c.fmt.money(hi)}`;
}

// "Closes <date>" or "Opens <date>" or "Closed <date>". The time zone is always named.
export function whenText(c, pr, { long = false } = {}) {
  const f = long ? c.fmt.instant : c.fmt.instantShort;
  const t = (d) => html`<time datetime="${d.toISOString()}">${f(d)}</time>`;
  if (pr.state === 'upcoming') return html`Opens ${t(pr.opensAt)}`;
  if (pr.rolling) return html`Open all year`;
  if (pr.state === 'closed') return html`Closed ${t(pr.deadlineAt)}`;
  return html`Closes ${t(pr.deadlineAt)}`;
}

// The date a student must not miss gets the highlighter. Only an open, dated program has one.
export const whenMarked = (c, pr, opts) =>
  pr.state === 'open' && !pr.rolling ? html`<span class="hl">${whenText(c, pr, opts)}</span>` : whenText(c, pr, opts);

export function programRow(c, p, pr) {
  return html`<li class="row">
    <div class="row-main">
      <h3><a href="${p.L(`/programs/${pr.slug}/`)}">${ph(pr.title)}</a></h3>
      <p>${ph(pr.summary)}</p>
    </div>
    <p class="row-amount">${amountText(c, pr)}</p>
    <p class="row-when">${whenMarked(c, pr)}</p>
    <p class="row-state">${badge(pr.state, pr.rolling && pr.state === 'open' ? 'Open' : undefined)}</p>
  </li>`;
}

export function noneOpen(c, p) {
  const next = c.programs.upcoming[0];
  return html`<p class="empty">No applications are open right now.${next ? html` <a href="${p.L(`/programs/${next.slug}/`)}">${ph(next.title)}</a> opens ${c.fmt.day(next.opensAt)}.` : ' Dates for the next round will be posted here.'}</p>`;
}

export const sampleNote = (c, flag, text = 'Sample figures') => (c.staging && flag ? html`<span class="sample-tag">${text}</span>` : '');

// Margin column: facts (dl) or a contents list.
export function facts(items) {
  return html`<dl class="facts">${items.filter(Boolean).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export function tocNav(toc) {
  if (!toc || toc.length < 2) return null;
  return html`<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${toc.map((t) => html`<li><a href="#${t.id}">${t.text}</a></li>`)}</ul></nav>`;
}

// The page frame for reading pages: title and lede, a margin for facts or contents, then the text.
export function article({ title, lede, margin, body, cls = '' }) {
  return html`<div class="wrap">
    <article class="article ${margin ? '' : 'no-margin'} ${cls}">
      <header class="a-head">
        <h1>${ph(title)}</h1>
        ${lede ? html`<p class="lede">${ph(lede)}</p>` : ''}
      </header>
      ${margin ? html`<div class="a-margin">${margin}</div>` : ''}
      <div class="a-body prose">${body}</div>
    </article>
  </div>`;
}

// The page frame for list and table pages: title and lede, then full-width sections.
export function listPage({ title, lede, body, cls = '' }) {
  return html`<div class="wrap listpage ${cls}">
    <header class="l-head">
      <h1>${ph(title)}</h1>
      ${lede ? html`<p class="lede">${ph(lede)}</p>` : ''}
    </header>
    ${body}
  </div>`;
}

export function figure(c, p, item) {
  if (!item.image) return '';
  return html`<figure class="fig"><img src="${p.L(`/images/${item.image}`)}" alt="${item.imageAlt ?? ''}" loading="lazy" decoding="async"></figure>`;
}

// ---- the ruler: 100 ticks for every 100 given -------------------------------------------------
export const SPLIT = [
  ['students', 's', 'Students'],
  ['operations', 'o', 'Running the foundation'],
  ['fundraising', 'f', 'Raising money'],
];

export function ruler(c, report) {
  const ticks = SPLIT.flatMap(([k, cls]) => Array.from({ length: report[k] }, () => `<i class="${cls}"></i>`)).join('');
  const label = `Of every ${c.fmt.money(100)} given in ${report.year}, ${c.fmt.money(report.students)} go to students, ${c.fmt.money(report.operations)} to running the foundation and ${c.fmt.money(report.fundraising)} to raising money.`;
  const scale = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => `<span>${n}</span>`).join('');
  return html`<div class="ruler" role="img" aria-label="${label}">${raw(ticks)}</div><div class="scale" aria-hidden="true">${raw(scale)}</div>`;
}

export function legend(c, report) {
  return html`<ul class="legend">${SPLIT.map(([k, cls, name]) => html`<li><i class="key ${cls}" aria-hidden="true"></i><span class="pct">${report[k]}</span><span class="lab">${name}</span></li>`)}</ul>`;
}

// Exact amounts per group that always add up to the total (largest remainder).
export function splitAmounts(report) {
  const raws = SPLIT.map(([k]) => (report.spent * report[k]) / 100);
  const floors = raws.map(Math.floor);
  let left = report.spent - floors.reduce((a, b) => a + b, 0);
  const order = raws.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

// A data table that turns into stacked "label: value" rows on a phone, so nothing hides off-screen.
// Explicit ARIA roles keep it a table for screen readers when the stacked layout changes its display.
export function dataTable({ caption, labelledBy, cols, rows, foot }) {
  const cell = (col, v) =>
    col.rowHeader
      ? html`<th scope="row" role="rowheader">${v}</th>`
      : html`<td class="${col.num ? 'num' : ''}" role="cell" data-label="${col.label}">${v}</td>`;
  const body = (list) => list.map((r) => html`<tr role="row">${cols.map((col, i) => cell(col, r[i]))}</tr>`);
  return html`<div class="table-wrap stack"><table role="table"${labelledBy ? raw(` aria-labelledby="${labelledBy}"`) : ''}>
    ${caption ? html`<caption>${caption}</caption>` : ''}
    <thead role="rowgroup"><tr role="row">${cols.map((col) => html`<th scope="col" role="columnheader" class="${col.num ? 'num' : ''}">${col.label}</th>`)}</tr></thead>
    <tbody role="rowgroup">${body(rows)}</tbody>
    ${foot ? html`<tfoot role="rowgroup">${body([foot])}</tfoot>` : ''}
  </table></div>`;
}

export const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// ---- forms ------------------------------------------------------------------------------------
export function field({ id, name = id, label, type = 'text', required = false, hint, autocomplete, rows, maxlength, options }) {
  const hintId = hint ? `${id}-hint` : null;
  const attrs = html`id="${id}" name="${name}"${required ? raw(' required') : ''}${autocomplete ? raw(` autocomplete="${autocomplete}"`) : ''}${maxlength ? raw(` maxlength="${maxlength}"`) : ''}${hintId ? raw(` aria-describedby="${hintId}"`) : ''}`;
  let control;
  if (options) control = html`<select ${attrs}><option value="">Choose one</option>${options.map((o) => html`<option>${o}</option>`)}</select>`;
  else if (rows) control = html`<textarea ${attrs} rows="${rows}"></textarea>`;
  else control = html`<input ${attrs} type="${type}">`;
  return html`<div class="field"><label for="${id}">${label}${required ? '' : html` <span class="opt">(optional)</span>`}</label>${hint ? html`<p class="hint" id="${hintId}">${hint}</p>` : ''}${control}</div>`;
}

// Spam protection that costs real people nothing: a field only bots fill in, and (with scripts on)
// a timestamp so a form posted within seconds of loading is turned away.
export const trap = () => html`<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><input type="hidden" name="ts" value="">`;

export function form(p, { action, id, className = '', children }) {
  return html`<form class="form ${className}" method="post" action="${p.L(action)}" id="${id}">${children}${trap()}</form>`;
}

export function contactForm(c, p) {
  return form(p, {
    action: '/api/contact',
    id: 'contact-form',
    children: html`
      ${field({ id: 'name', label: 'Your name', required: true, autocomplete: 'name', maxlength: LIMITS.name })}
      ${field({ id: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email', maxlength: LIMITS.email, hint: 'We reply to this address. We do not share it.' })}
      ${field({ id: 'topic', label: 'What is this about?', required: true, options: CONTACT_TOPICS })}
      ${field({ id: 'message', label: 'Your message', required: true, rows: 7, maxlength: LIMITS.message })}
      <button class="btn" type="submit">Send message</button>`,
  });
}

export function partnerForm(c, p) {
  return form(p, {
    action: '/api/partner',
    id: 'partner-form',
    children: html`
      ${field({ id: 'organisation', label: 'Organization', required: true, autocomplete: 'organization', maxlength: LIMITS.organisation })}
      ${field({ id: 'name', label: 'Your name', required: true, autocomplete: 'name', maxlength: 120 })}
      ${field({ id: 'email', label: 'Work email', type: 'email', required: true, autocomplete: 'email', maxlength: 200 })}
      ${field({ id: 'interest', label: 'How would you like to help?', required: true, options: PARTNER_INTERESTS })}
      ${field({ id: 'message', label: 'Tell us a little more', required: true, rows: 6, maxlength: LIMITS.message })}
      <button class="btn" type="submit">Send enquiry</button>`,
  });
}

export function newsletterForm(c, p) {
  return html`<form class="form news-form" method="post" action="${p.L('/api/newsletter')}" id="newsletter-form">
    ${field({ id: 'nl-email', name: 'email', label: 'Email address for news', type: 'email', required: true, autocomplete: 'email', maxlength: 200, hint: 'We email you a link to confirm. Nothing is sent until you click it.' })}
    <button class="btn small" type="submit">Sign up for news</button>
    ${trap()}
  </form>`;
}
