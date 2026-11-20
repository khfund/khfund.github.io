// Every page of the site. Each one is { path, title, description, render(p) } where render builds the
// <main> content. Text comes from content/; structure and wording of buttons and labels is here.
import { html, raw, ph } from './lib/html.mjs';
import { icon } from './icons.mjs';
import { renderMarkdown, splitFaq } from './lib/markdown.mjs';
import { closesAt } from './lib/dates.mjs';
import {
  plain, mdHtml, badge, button, amountText, whenText, whenMarked, programRow, noneOpen, sampleNote, facts, tocNav,
  article, listPage, figure, ruler, legend, splitAmounts, fileSize, SPLIT, dataTable, contactForm, partnerForm, STATE_LABEL,
} from './components.mjs';

export const REQUIRED_PAGES = ['home', 'programs', 'apply', 'apply-faq', 'apply-start', 'impact', 'finances', 'news', 'about', 'partner', 'contact', 'donate', 'privacy', 'terms', 'accessibility'];

const stubNotice = (c, pg) => (c.staging && pg.stub ? html`<p class="notice">This page stands in for something built in a later phase. A production build refuses it.</p>` : '');
const markdownOf = (p, pg) => renderMarkdown(pg.body ?? '', { link: p.L });
const programTitle = (c, slug) => c.programs.find((x) => x.slug === slug)?.title;

// A reading page made from one Markdown file, with a contents list in the margin.
function textPage(c, slug, path, { extra, extraToc = [], margin, noindex = false } = {}) {
  const pg = c.pages[slug];
  return {
    path,
    title: pg.title,
    description: pg.description,
    noindex: noindex || pg.noindex === true,
    render: (p) => {
      const { html: body, toc } = markdownOf(p, pg);
      const fullToc = [...toc, ...extraToc];
      const side = margin ? margin(p, fullToc, pg) : tocNav(fullToc);
      return article({ title: pg.title, lede: pg.lede, margin: side, body: html`${stubNotice(c, pg)}${raw(body)}${extra ? extra(p) : ''}` });
    },
  };
}

// ---- the ruler band (home and finances) --------------------------------------------------------
function bandSection(c, p, report) {
  const { fmt } = c;
  return html`<section class="band" aria-labelledby="band-h">
  <div class="wrap">
    <h2 id="band-h">Of every ${fmt.money(100)} you give, <span class="hl">${fmt.money(report.students)}</span> pay for students.</h2>
    ${ruler(c, report)}
    ${legend(c, report)}
    <p class="band-note">Figures for ${report.year}${report.audited ? ', audited' : ''}. <a href="${p.L('/finances/')}">See the exact amounts and every annual report</a> ${sampleNote(c, report.sample)}</p>
  </div>
</section>`;
}

// ---- the home page hero -------------------------------------------------------------------------
// The headline and the two buttons are the point of this section, centred, with a card in each corner around them (as in
// the reference the Foundation supplied): two small cards with figures from the latest report at the top (students funded;
// money in and out), and two quiet pictures at the bottom, students on one side and donors on the other, with the
// Khwarizmi connector between them. Lines join those three pictures and nothing else: they never touch the figure cards.
// The pictures are made only of icons and lines so they need no words in any language, and are hidden from screen readers.
// A 3 x 3 grid. A name is an icon on a tile; null is an empty cell that only keeps the pattern.
const STUDENT_CELLS = [null, 'cap', null, 'hardhat', null, 'chip', null, 'flask', null];
// Where the five donor icons go around the centre (n1 to n5 are positioned in the stylesheet).
const DONOR_ICONS = [['n1', 'gift'], ['n2', 'building'], ['n3', 'users'], ['n4', 'globe'], ['n5', 'dollar']];
// Lines on each card. More programs than this are added together on the last line, so the lines still add up.
const CARD_LINES = 4;

// The elbow where a line leaves the rail down the side of the page and turns in towards the pictures: a quarter circle, then
// straight on (under the picture, which is opaque and hides the end). Drawn in px at 16 px to the rem, so it scales with the
// page. The mirror image for the other side is made in the stylesheet.
const BRANCH = raw('<svg viewBox="0 0 112 48" focusable="false" aria-hidden="true"><path d="M.7 0A47.3 47.3 0 0 0 48 47.3H112"/></svg>');

// Students funded in the latest year, and how many each program funded.
function studentsCard(c, p) {
  const y = c.impacts[0];
  if (!y?.byProgram?.length) return '';
  const sorted = [...y.byProgram].sort((a, b) => b.students - a.students || a.program.localeCompare(b.program));
  const rows = sorted.length > CARD_LINES
    ? [...sorted.slice(0, CARD_LINES - 1), { program: null, students: sorted.slice(CARD_LINES - 1).reduce((s, r) => s + r.students, 0) }]
    : sorted;
  const line = (r) => {
    const pr = r.program ? c.programs.find((x) => x.slug === r.program) : null;
    return html`<li><span class="tile">${icon(pr ? pr.icon : 'users')}</span><span class="name">${pr ? ph(pr.title) : 'Other programs'}</span><span class="val">${c.fmt.number(r.students)}</span></li>`;
  };
  return html`<section class="stat stat-students" aria-labelledby="stat-students-h">
  <h2 id="stat-students-h" class="stat-h"><a href="${p.L('/impact/')}"><span class="big">${c.fmt.number(y.students)}</span> <span class="what">students funded in ${y.year}</span></a></h2>
  <ul class="stat-lines">${rows.map(line)}</ul>
</section>`;
}

// Total donations in the latest report, and its most recent money in and out. Direction is shown three ways (an arrow, a
// + or − sign, and words for screen readers) so no one has to tell it from colour.
function moneyCard(c, p) {
  const r = c.reports[0];
  if (!r?.transactions?.length || r.income == null) return '';
  const line = (t) => {
    const incoming = t.direction === 'in';
    return html`<li class="${t.direction}"><span class="tile">${icon(incoming ? 'moneyIn' : 'moneyOut')}</span><span class="name">${ph(t.label)}<time class="when" datetime="${t.date}">${c.fmt.isoShort(t.date)}</time></span><span class="val"><span class="sr-only">${incoming ? 'Received' : 'Paid out'} </span><span aria-hidden="true">${incoming ? '+' : '−'}</span>${c.fmt.money(t.amount)}</span></li>`;
  };
  return html`<section class="stat stat-money" aria-labelledby="stat-money-h">
  <h2 id="stat-money-h" class="stat-h"><a href="${p.L('/finances/')}"><span class="big">${c.fmt.money(r.income)}</span> <span class="what">total donations in ${r.year}</span></a></h2>
  <ul class="stat-lines">${r.transactions.slice(0, CARD_LINES).map(line)}</ul>
</section>`;
}

function hero(c, p, pg) {
  const name = c.site.shortName;
  return html`<section class="hero" aria-labelledby="hero-h">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1 id="hero-h"><span class="h1-name">${ph(name)}</span> ${ph(pg.headline)}</h1>
      <div class="lede prose">${mdHtml(p, pg.body)}</div>
      <p class="actions">${button(p.L('/donate/'), html`${icon('heart')}Donate`)} ${button(p.L('/apply/'), 'Apply for a scholarship', 'secondary')}</p>
    </div>
    <div class="hero-side hero-side-start">
      ${studentsCard(c, p)}
      <div class="students" aria-hidden="true"><div class="cells">${STUDENT_CELLS.map((n) => (n ? html`<span class="cell on">${icon(n)}</span>` : html`<span class="cell"></span>`))}</div></div>
    </div>
    <div class="hero-side hero-side-end">
      ${moneyCard(c, p)}
      <div class="donors" aria-hidden="true">
        <div class="net">
          <div class="board">
            <svg class="net-lines" viewBox="0 0 17.5 15.2" width="17.5" height="15.2" aria-hidden="true" focusable="false"><path d="M8.75 6.55 3.1 3.225M8.75 6.55l5.65-3.325M8.75 6.55 4.1 10.225M8.75 6.55l4.65 3.675M8.75 6.55v6.475"/></svg>
            <span class="net-core">${icon('donation')}</span>
            <ul class="nodes">${DONOR_ICONS.map(([k, glyph]) => html`<li class="node ${k}"><span class="tile warm">${icon(glyph)}</span></li>`)}</ul>
          </div>
        </div>
      </div>
    </div>
    <span class="branch branch-start" aria-hidden="true">${BRANCH}</span>
    <span class="branch branch-end" aria-hidden="true">${BRANCH}</span>
    <span class="link link-start" aria-hidden="true"></span>
    <div class="flow" aria-hidden="true">
      <span class="rail"></span>
      <span class="hub"><img src="${p.L('/assets/mark.svg')}?v=${c.assetVersion}" alt="" width="28" height="28"></span>
      <span class="rail"></span>
    </div>
    <span class="link link-end" aria-hidden="true"></span>
  </div>
</section>`;
}

// ---- home -------------------------------------------------------------------------------------
function home(c) {
  const pg = c.pages.home;
  const report = c.reports[0];
  const story = c.stories[0];
  const steps = c.pages.apply.steps ?? [];
  const jsonLd = c.siteUrl
    ? { '@context': 'https://schema.org', '@type': 'NGO', name: plain(c.site.name), url: c.siteUrl, logo: `${c.siteUrl}/assets/mark.svg`, description: plain(c.site.description) }
    : null;
  return {
    path: '/',
    title: pg.title,
    description: pg.description,
    jsonLd,
    render: (p) => html`<div class="home-page">
${hero(c, p, pg)}
<section class="section" aria-labelledby="open-h">
  <div class="wrap">
    <h2 id="open-h">Open for applications</h2>
    ${c.programs.open.length ? html`<ul class="rows">${c.programs.open.map((pr) => programRow(c, p, pr))}</ul>` : noneOpen(c, p)}
    <p class="more"><a href="${p.L('/programs/')}">See every program</a></p>
  </div>
</section>
${report ? bandSection(c, p, report) : ''}
${steps.length ? html`<section class="section" aria-labelledby="steps-h">
  <div class="wrap">
    <h2 id="steps-h">How applying works</h2>
    <ol class="steps">${steps.map((s) => html`<li>${ph(s)}</li>`)}</ol>
    <p class="more"><a href="${p.L('/apply/')}">Read the full guide to applying</a></p>
  </div>
</section>` : ''}
${story ? html`<section class="section" aria-labelledby="story-h">
  <div class="wrap">
    <h2 id="story-h">In a student's words</h2>
    <figure class="quote">
      <blockquote><p>${ph(story.quote || story.title)}</p></blockquote>
      <figcaption>${ph(story.student)}${story.program ? html`, ${ph(programTitle(c, story.program) ?? story.program)}` : ''}${story.year ? `, ${story.year}` : ''}</figcaption>
    </figure>
    <p class="more"><a href="${p.L('/impact/#stories')}">Read more student stories</a></p>
  </div>
</section>` : ''}
${c.news.length ? html`<section class="section" aria-labelledby="news-h">
  <div class="wrap">
    <h2 id="news-h">Latest news</h2>
    <ul class="rows news">${c.news.slice(0, 2).map((n) => newsRow(c, p, n))}</ul>
    <p class="more"><a href="${p.L('/news/')}">All news</a></p>
  </div>
</section>` : ''}
</div>`,
  };
}

// `tag` is the heading level: h3 under a section heading (home page), h2 straight under the page title.
function newsRow(c, p, n, tag = 'h3') {
  return html`<li class="row news-row">
    <p class="row-date"><time datetime="${n.date}">${c.fmt.isoDate(n.date)}</time></p>
    <div class="row-main">${raw(`<${tag}>`)}<a href="${p.L(`/news/${n.slug}/`)}">${ph(n.title)}</a>${raw(`</${tag}>`)}<p>${ph(n.summary)}</p></div>
  </li>`;
}

// ---- programs ---------------------------------------------------------------------------------
function programsIndex(c) {
  const pg = c.pages.programs;
  const group = (p, id, heading, list, note) =>
    list.length ? html`<section class="group" aria-labelledby="${id}"><h2 id="${id}">${heading}</h2>${note ? html`<p class="note">${note}</p>` : ''}<ul class="rows">${list.map((pr) => programRow(c, p, pr))}</ul></section>` : '';
  return {
    path: '/programs/',
    title: pg.title,
    description: pg.description,
    render: (p) => listPage({
      title: pg.title,
      lede: pg.lede,
      body: html`
        ${c.programs.open.length ? group(p, 'open', 'Open for applications', c.programs.open) : html`<section class="group"><h2>Open for applications</h2>${noneOpen(c, p)}</section>`}
        ${group(p, 'soon', 'Opening soon', c.programs.upcoming)}
        ${group(p, 'closed', 'Closed', c.programs.closed, 'Closed rounds stay here for reference. Dates for the next round are posted on this page and in the newsletter.')}`,
    }),
  };
}

function whenFacts(c, pr) {
  const t = (d) => html`<time datetime="${d.toISOString()}">${c.fmt.instantShort(d)}</time>`;
  if (pr.rolling) return [['Deadline', html`<span class="hl">Open all year</span>`]];
  if (pr.state === 'upcoming') return [['Opens', t(pr.opensAt)], ['Closes', t(pr.deadlineAt)]];
  if (pr.state === 'closed') return [['Closed', t(pr.deadlineAt)]];
  return [['Closes', html`<span class="hl">${t(pr.deadlineAt)}</span>`]];
}

function applyBox(c, p, pr) {
  const iso = (d) => (d ? d.toISOString() : '');
  const shown = (s) => (pr.state === s ? '' : raw(' hidden'));
  const title = ph(pr.title);
  return html`<section class="apply-box" id="apply" data-opens="${iso(pr.opensAt)}" data-closes="${iso(closesAt(pr))}">
    <div data-when="open"${shown('open')}>
      <h2>Apply for the ${title}</h2>
      <p>${pr.rolling ? 'You can apply at any time of year.' : html`Applications close on <span class="hl"><time datetime="${pr.deadlineAt.toISOString()}">${c.fmt.instant(pr.deadlineAt)}</time></span>.`}</p>
      <p>${button(p.L('/apply/start/'), html`Apply for the ${title}`)}</p>
    </div>
    <div data-when="upcoming"${shown('upcoming')}>
      <h2>Applications are not open yet</h2>
      <p>${pr.opensAt ? html`Applications open on <time datetime="${pr.opensAt.toISOString()}">${c.fmt.instant(pr.opensAt)}</time>.` : ''} Read how applying works now, so you are ready.</p>
      <p>${button(p.L('/apply/'), 'How to apply', 'secondary')}</p>
    </div>
    <div data-when="closed"${shown('closed')}>
      <h2>Applications are closed</h2>
      <p>This round closed${pr.deadlineAt ? html` on <time datetime="${pr.deadlineAt.toISOString()}">${c.fmt.instant(pr.deadlineAt)}</time>` : ''}. Dates for the next round will be posted on the <a href="${p.L('/programs/')}">programs page</a> and in the newsletter.</p>
    </div>
  </section>`;
}

function programPage(c, pr) {
  return {
    path: `/programs/${pr.slug}/`,
    title: pr.title,
    description: pr.summary,
    ogType: 'article',
    render: (p) => {
      const { html: body } = renderMarkdown(pr.body, { link: p.L });
      const margin = facts([
        ['Status', badge(pr.state, pr.rolling && pr.state === 'open' ? 'Open' : undefined)],
        ['Amount', html`<span class="hl">${amountText(c, pr)}</span>`],
        ...whenFacts(c, pr),
        pr.level ? ['Level', ph(pr.level)] : null,
        pr.eligibility.length ? ['Who can apply', html`<ul>${pr.eligibility.map((e) => html`<li>${ph(e)}</li>`)}</ul>`] : null,
      ]);
      return article({ title: pr.title, lede: pr.summary, margin, body: html`${raw(body)}${applyBox(c, p, pr)}` });
    },
  };
}

// ---- how to apply -----------------------------------------------------------------------------
function applyPage(c) {
  const pg = c.pages.apply;
  const faq = splitFaq(c.pages['apply-faq'].body);
  return {
    path: '/apply/',
    title: pg.title,
    description: pg.description,
    render: (p) => {
      const { html: body, toc } = markdownOf(p, pg);
      const fullToc = [{ id: 'open-now', text: 'Open now' }, ...toc, ...(faq.length ? [{ id: 'faq', text: 'Questions and answers' }] : [])];
      return article({
        title: pg.title,
        lede: pg.lede,
        margin: tocNav(fullToc),
        body: html`
          <h2 id="open-now">Open now</h2>
          ${c.programs.open.length ? html`<ul class="rows">${c.programs.open.map((pr) => programRow(c, p, pr))}</ul>` : noneOpen(c, p)}
          ${raw(body)}
          ${faq.length ? html`<h2 id="faq">Questions and answers</h2><div class="faq">${faq.map((f) => html`<details><summary>${ph(f.q)}</summary><div class="prose">${mdHtml(p, f.a, 2)}</div></details>`)}</div>` : ''}`,
      });
    },
  };
}

// ---- impact -----------------------------------------------------------------------------------
function impactPage(c) {
  const pg = c.pages.impact;
  return {
    path: '/impact/',
    title: pg.title,
    description: pg.description,
    render: (p) => {
      const { html: body } = markdownOf(p, pg);
      const notes = c.impacts.filter((i) => i.body.trim());
      return listPage({
        title: pg.title,
        lede: pg.lede,
        body: html`
          <section class="group" aria-labelledby="years-h">
            <h2 id="years-h">Year by year ${sampleNote(c, c.impacts.some((i) => i.sample))}</h2>
            ${c.impacts.length ? dataTable({
              labelledBy: 'years-h',
              cols: [{ label: 'Year', rowHeader: true }, { label: 'Students funded', num: true }, { label: 'Total awarded', num: true }, { label: 'Applications received', num: true }],
              rows: c.impacts.map((i) => [i.year, c.fmt.number(i.students), c.fmt.money(i.awarded), c.fmt.number(i.applications)]),
            })
            : html`<p class="empty">Yearly figures will appear here after the first annual report.</p>`}
            ${notes.map((i) => html`<div class="year-note prose"><h3>${i.year}</h3>${mdHtml(p, i.body, 2)}</div>`)}
          </section>
          <section class="group" id="stories" aria-labelledby="stories-h">
            <h2 id="stories-h">In their words</h2>
            ${c.stories.length ? c.stories.map((s) => html`<article class="story">
              <h3>${ph(s.title)}</h3>
              ${s.quote ? html`<blockquote class="pull"><p>${ph(s.quote)}</p></blockquote>` : ''}
              ${figure(c, p, s)}
              <div class="prose">${mdHtml(p, s.body, 2)}</div>
              <p class="who">${ph(s.student)}${s.program ? html`, <a href="${p.L(`/programs/${s.program}/`)}">${ph(programTitle(c, s.program) ?? s.program)}</a>` : ''}${s.year ? `, ${s.year}` : ''}</p>
            </article>`) : html`<p class="empty">Student stories appear here once each student has agreed in writing to share theirs.</p>`}
          </section>
          ${body ? html`<section class="group prose">${raw(body)}</section>` : ''}`,
      });
    },
  };
}

// ---- finances ---------------------------------------------------------------------------------
function financesPage(c) {
  const pg = c.pages.finances;
  const report = c.reports[0];
  return {
    path: '/finances/',
    title: pg.title,
    description: pg.description,
    render: (p) => {
      const { html: body } = markdownOf(p, pg);
      const amounts = report ? splitAmounts(report) : [];
      return html`
<div class="wrap listpage head-only"><header class="l-head"><h1>${ph(pg.title)}</h1>${pg.lede ? html`<p class="lede">${ph(pg.lede)}</p>` : ''}</header></div>
${report ? bandSection(c, p, report) : ''}
<div class="wrap listpage cont">
  ${report ? html`<section class="group" aria-labelledby="exact-h">
    <h2 id="exact-h">Exact amounts for ${report.year}</h2>
    ${dataTable({
      caption: html`Where ${c.fmt.money(report.spent)} went in ${report.year}${report.audited ? ' (audited)' : ''} ${sampleNote(c, report.sample)}`,
      cols: [{ label: 'Spent on', rowHeader: true }, { label: `Share of every ${c.fmt.money(100)}`, num: true }, { label: 'Amount', num: true }],
      rows: SPLIT.map(([k, , name], i) => [name, report[k], c.fmt.money(amounts[i])]),
      foot: ['Total spent', 100, c.fmt.money(report.spent)],
    })}
  </section>` : ''}
  <section class="group prose">${raw(body)}</section>
  <section class="group" aria-labelledby="reports-h">
    <h2 id="reports-h">Every year, and the reports to download</h2>
    ${c.reports.length ? html`${dataTable({
      caption: `Share of every ${c.fmt.money(100)} spent on each group, and the total spent, by year`,
      cols: [{ label: 'Year', rowHeader: true }, { label: 'Students', num: true }, { label: 'Running the foundation', num: true }, { label: 'Raising money', num: true }, { label: 'Total spent', num: true }, { label: 'Report' }],
      rows: c.reports.map((r) => [r.year, r.students, r.operations, r.fundraising, c.fmt.money(r.spent), r.pdf ? html`<a href="${p.L(`/files/${r.pdf}`)}" download>${ph(r.title)} (PDF, ${fileSize(r.size)})</a>` : 'Not yet published']),
    })}
    ` : html`<p class="empty">The first annual report will be published here as a PDF.</p>`}
  </section>
</div>`;
    },
  };
}

// ---- news -------------------------------------------------------------------------------------
function newsIndex(c) {
  const pg = c.pages.news;
  return {
    path: '/news/',
    title: pg.title,
    description: pg.description,
    render: (p) => listPage({
      title: pg.title,
      lede: pg.lede,
      body: c.news.length ? html`<ul class="rows news">${c.news.map((n) => newsRow(c, p, n, 'h2'))}</ul><p class="more"><a href="${p.L('/feed.xml')}">Follow by news feed</a></p>` : html`<p class="empty">No news yet. Sign up below and we will email you when there is some.</p>`,
    }),
  };
}

function newsPage(c, n) {
  return {
    path: `/news/${n.slug}/`,
    title: n.title,
    description: n.summary,
    ogType: 'article',
    render: (p) => article({
      title: n.title,
      lede: n.summary,
      margin: facts([['Published', html`<time datetime="${n.date}">${c.fmt.isoDate(n.date)}</time>`]]),
      body: html`${figure(c, p, n)}${mdHtml(p, n.body)}<p class="more"><a href="${p.L('/news/')}">Back to all news</a></p>`,
    }),
  };
}

// ---- reading pages ----------------------------------------------------------------------------
function legalPage(c, slug, path) {
  return textPage(c, slug, path, {
    margin: (p, toc, pg) => html`${pg.updated ? facts([['Last updated', c.fmt.isoDate(String(pg.updated))]]) : ''}${tocNav(toc)}`,
  });
}

// ---- small pages the forms lead to ------------------------------------------------------------
function simplePage(path, title, text, links = [], extra = {}) {
  return {
    path,
    title,
    description: text,
    noindex: true,
    ...extra,
    render: (p) => listPage({
      title,
      body: html`<div class="prose"><p>${text}</p>${links.length ? html`<p class="actions">${links.map(([to, label, kind]) => html`${button(p.L(to), label, kind)} `)}</p>` : ''}</div>`,
      cls: 'narrow',
    }),
  };
}

export function buildPages(c) {
  const pages = [];
  const add = (...x) => pages.push(...x);

  add(home(c), programsIndex(c), ...c.programs.map((pr) => programPage(c, pr)), applyPage(c));
  add({ ...textPage(c, 'apply-start', '/apply/start/', { noindex: true }) });
  add(impactPage(c), financesPage(c), newsIndex(c), ...c.news.map((n) => newsPage(c, n)));
  add(textPage(c, 'about', '/about/'));
  add({
    path: '/partner/',
    title: c.pages.partner.title,
    description: c.pages.partner.description,
    render: (p) => {
      const pg = c.pages.partner;
      const { html: body, toc } = markdownOf(p, pg);
      return article({ title: pg.title, lede: pg.lede, margin: tocNav([...toc, { id: 'enquiry', text: 'Send us an enquiry' }]), body: html`${stubNotice(c, pg)}${raw(body)}<h2 id="enquiry">Send us an enquiry</h2>${partnerForm(c, p)}` });
    },
  });
  add({
    path: '/contact/',
    title: c.pages.contact.title,
    description: c.pages.contact.description,
    render: (p) => {
      const pg = c.pages.contact;
      const { site } = c;
      const { html: body } = markdownOf(p, pg);
      const mailbox = /\[\[/.test(site.staffEmail) ? ph(site.staffEmail) : html`<a href="mailto:${site.staffEmail}">${site.staffEmail}</a>`;
      return article({
        title: pg.title,
        lede: pg.lede,
        margin: facts([['Email', mailbox], ['Post', ph(site.postalAddress)], pg.reply ? ['Replies', ph(pg.reply)] : null]),
        body: html`${raw(body)}<h2 id="send-a-message">Send us a message</h2>${contactForm(c, p)}`,
      });
    },
  });
  add(textPage(c, 'donate', '/donate/'), legalPage(c, 'privacy', '/privacy/'), legalPage(c, 'terms', '/terms/'), legalPage(c, 'accessibility', '/accessibility/'));

  add(
    simplePage('/contact/sent/', 'Message sent', 'Thank you. We have your message and will reply to the email address you gave.', [['/', 'Back to the home page']]),
    simplePage('/partner/sent/', 'Enquiry sent', 'Thank you. We have your enquiry and will reply to the email address you gave.', [['/', 'Back to the home page']]),
    simplePage('/newsletter/check-your-email/', 'Check your email', 'We sent you a link. Click it to confirm that you want our news. Until you do, we will not email you again. If nothing arrives within a few minutes, check your spam folder.', [['/', 'Back to the home page']]),
    simplePage('/newsletter/unsubscribed/', 'You are unsubscribed', 'We have removed your email address from our news list. You will not hear from us again unless you sign up again.', [['/', 'Back to the home page']]),
    simplePage('/newsletter/confirmed/', 'You are signed up', 'Thank you. Your email address is confirmed. You can unsubscribe from any email we send.', [['/news/', 'Read our latest news']]),
  );
  add({
    path: '/form-error/',
    title: 'The form could not be sent',
    description: 'The form could not be sent.',
    noindex: true,
    render: (p) => listPage({
      title: 'The form could not be sent',
      body: html`<div class="prose"><p class="notice error" role="alert">${raw('<!--message-start-->')}Something went wrong and the form was not sent.${raw('<!--message-end-->')}</p><p>Use your browser's back button to return to the form. What you typed is usually still there. Fix it and send it again.</p><p class="actions">${button(p.L('/contact/'), 'Contact us another way', 'secondary')}</p></div>`,
      cls: 'narrow',
    }),
  });
  add({
    path: '/404.html',
    title: 'Page not found',
    description: 'This page does not exist.',
    noindex: true,
    rootLinks: true,
    render: (p) => listPage({
      title: 'Page not found',
      body: html`<div class="prose"><p>The page you are looking for is not here. It may have moved, or the address may have a typo.</p><p class="actions">${button('/', 'Go to the home page')} ${button('/programs/', 'See the programs', 'secondary')}</p></div>`,
      cls: 'narrow',
    }),
  });
  return pages;
}
