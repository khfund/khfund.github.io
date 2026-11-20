// Reads everything staff write (content/) and turns it into plain data the page builders use.
// Rules for staff live here too: what is required, what is held back, what stops a production build.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseFrontMatter } from './lib/frontmatter.mjs';
import { zonedToUtc, programState, makeFormatters } from './lib/dates.mjs';
import { checkBrand } from './lib/contrast.mjs';
import { ICON_NAMES } from './icons.mjs';

const read = (p) => readFileSync(p, 'utf8');
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const PLACEHOLDER = /\[\[(.+?)\]\]/g;

function readFolder(dir, rel, problems) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const file = `${rel}/${f}`;
      try {
        const raw = read(join(dir, f));
        const { data, body } = parseFrontMatter(raw, file);
        return { file, slug: basename(f, '.md'), data, body, raw };
      } catch (e) {
        problems.push(e.message);
        return null;
      }
    })
    .filter(Boolean);
}

export function loadContent(contentDir, { now = new Date() } = {}) {
  const problems = []; // stop every build
  const warnings = []; // reported, never stop a build
  const samples = []; // files marked sample: true (stop a production build)
  const stubs = []; // pages that stand in for something built later (stop a production build)
  const placeholders = []; // [[...]] left in text (stop a production build)

  const siteFile = join(contentDir, 'site.json');
  let site;
  try {
    site = JSON.parse(read(siteFile));
  } catch (e) {
    throw new Error(`content/site.json cannot be read: ${e.message}`);
  }
  for (const k of ['name', 'locale', 'timezone', 'currency']) {
    if (!isText(site[k])) problems.push(`content/site.json: "${k}" is missing.`);
  }
  site.nav ??= [];
  const fmt = makeFormatters({ locale: site.locale, timezone: site.timezone, currency: site.currency });

  for (const r of checkBrand(site.brand)) {
    if (!r.ok) {
      problems.push(
        r.note ? `content/site.json: ${r.note}.` : `Colors (${r.theme}): ${r.label}. ${r.fg} ${r.fgHex} on ${r.bg} ${r.bgHex} is ${r.ratio.toFixed(2)}:1 and needs ${r.min}:1.`,
      );
    }
  }
  scanPlaceholders('content/site.json', read(siteFile), placeholders);

  const need = (file, d, key, kind = 'text') => {
    const ok = kind === 'number' ? isNum(d[key]) : isText(d[key]);
    if (!ok) problems.push(`${file}: "${key}" is missing${kind === 'number' ? ' (write a number such as 120)' : ''}.`);
    return ok;
  };
  const track = (it) => {
    scanPlaceholders(it.file, it.raw, placeholders);
    if (it.data.sample === true) samples.push(it.file);
    if (it.data.stub === true) stubs.push(it.file);
  };
  const seen = new Set();
  const unique = (it, kind) => {
    const k = `${kind}/${it.slug}`;
    if (seen.has(k)) problems.push(`${it.file}: another ${kind} already uses the name "${it.slug}".`);
    seen.add(k);
  };
  const toUtc = (file, d, key) => {
    if (!d[key]) return null;
    try {
      return zonedToUtc(d[key], site.timezone);
    } catch (e) {
      problems.push(`${file}: "${key}": ${e.message}`);
      return null;
    }
  };

  // ---- pages
  const pages = {};
  for (const it of readFolder(join(contentDir, 'pages'), 'content/pages', problems)) {
    track(it);
    need(it.file, it.data, 'title');
    need(it.file, it.data, 'description');
    pages[it.slug] = { slug: it.slug, ...it.data, body: it.body, file: it.file };
  }

  // ---- programs
  const programs = readFolder(join(contentDir, 'programs'), 'content/programs', problems).map((it) => {
    track(it);
    unique(it, 'program');
    const d = it.data;
    need(it.file, d, 'title');
    need(it.file, d, 'summary');
    const rolling = d.rolling === true;
    const p = {
      slug: it.slug,
      file: it.file,
      title: d.title,
      summary: d.summary,
      level: d.level ?? '',
      amountMin: isNum(d.amountMin) ? d.amountMin : null,
      amountMax: isNum(d.amountMax) ? d.amountMax : null,
      rolling,
      eligibility: Array.isArray(d.eligibility) ? d.eligibility : [],
      order: isNum(d.order) ? d.order : 100,
      // The picture beside this program's figures on the home page. Any icon from src/icons.mjs.
      icon: ICON_NAMES.includes(d.icon) ? d.icon : 'book',
      body: it.body,
      sample: d.sample === true,
      opensAt: toUtc(it.file, d, 'opensAt'),
      deadlineAt: rolling ? null : toUtc(it.file, d, 'deadlineAt'),
    };
    if (d.icon !== undefined && !ICON_NAMES.includes(d.icon)) problems.push(`${it.file}: "icon" must be one of: ${ICON_NAMES.join(', ')}.`);
    if (!rolling && !d.deadlineAt) problems.push(`${it.file}: "deadlineAt" is missing. Add it, or write "rolling: true" for a program that is always open.`);
    // A date alone would mean the first minute of that day, which closes the program a day early. Make staff say the time.
    else if (!rolling && /^\d{4}-\d{2}-\d{2}$/.test(String(d.deadlineAt).trim())) {
      problems.push(`${it.file}: "deadlineAt" needs a time as well as a date, so there is no doubt about the last moment to apply. Write it as YYYY-MM-DD HH:mm, for example 2027-03-31 23:59.`);
      p.deadlineAt = null;
    }
    if (p.opensAt && p.deadlineAt && p.deadlineAt <= p.opensAt) problems.push(`${it.file}: the deadline is not after the opening date.`);
    if (p.amountMax == null) problems.push(`${it.file}: "amountMax" is missing (the most a student can receive, as a number).`);
    p.state = programState(p, now);
    return p;
  });
  const byState = (s) => programs.filter((p) => p.state === s);
  const farFuture = 8.64e15;
  programs.open = byState('open').sort((a, b) => (a.deadlineAt?.getTime() ?? farFuture) - (b.deadlineAt?.getTime() ?? farFuture) || a.order - b.order);
  programs.upcoming = byState('upcoming').sort((a, b) => a.opensAt - b.opensAt || a.order - b.order);
  programs.closed = byState('closed').sort((a, b) => b.deadlineAt - a.deadlineAt || a.order - b.order);

  // ---- impact figures (one file per year)
  const impacts = readFolder(join(contentDir, 'data'), 'content/data', problems)
    .filter((it) => /^impact-/.test(it.slug))
    .map((it) => {
      track(it);
      const d = it.data;
      for (const k of ['year', 'students', 'awarded', 'applications']) need(it.file, d, k, 'number');
      // How many of those students each program funded. Optional; the home page shows it when it is there.
      const byProgram = [];
      if (d.byProgram !== undefined) {
        if (!Array.isArray(d.byProgram)) problems.push(`${it.file}: "byProgram" must be a list, one program per line: - { program: undergraduate-award, students: 63 }`);
        else {
          const seen = new Set();
          d.byProgram.forEach((row, n) => {
            const at = `${it.file}: "byProgram" item ${n + 1}`;
            if (!row || typeof row !== 'object' || Array.isArray(row)) return problems.push(`${at} must look like { program: undergraduate-award, students: 63 }.`);
            if (!isText(row.program) || !programs.some((p) => p.slug === row.program)) return problems.push(`${at}: "program" must be the name of a file in content/programs/, for example undergraduate-award.`);
            if (seen.has(row.program)) return problems.push(`${at}: "${row.program}" is listed twice.`);
            if (!isNum(row.students) || !Number.isInteger(row.students) || row.students < 0) return problems.push(`${at}: "students" must be a whole number such as 63.`);
            seen.add(row.program);
            byProgram.push({ program: row.program, students: row.students });
          });
          const total = byProgram.reduce((s, r) => s + r.students, 0);
          if (isNum(d.students) && byProgram.length && total !== d.students) problems.push(`${it.file}: the programs in "byProgram" add up to ${total}, but "students" says ${d.students}. They must match.`);
        }
      }
      return { file: it.file, year: d.year, students: d.students, awarded: d.awarded, applications: d.applications, byProgram, body: it.body, sample: d.sample === true };
    })
    .sort((a, b) => b.year - a.year);

  // ---- reports and where the money goes (one file per year)
  const reports = readFolder(join(contentDir, 'reports'), 'content/reports', problems)
    .map((it) => {
      track(it);
      const d = it.data;
      for (const k of ['year', 'students', 'operations', 'fundraising', 'spent']) need(it.file, d, k, 'number');
      need(it.file, d, 'title');
      const sum = (d.students ?? 0) + (d.operations ?? 0) + (d.fundraising ?? 0);
      if (isNum(d.students) && isNum(d.operations) && isNum(d.fundraising) && sum !== 100) {
        problems.push(`${it.file}: students, operations and fundraising must add up to 100. They add up to ${sum}.`);
      }
      for (const k of ['students', 'operations', 'fundraising']) {
        if (isNum(d[k]) && (!Number.isInteger(d[k]) || d[k] < 0)) problems.push(`${it.file}: "${k}" must be a whole number from 0 to 100.`);
      }
      let size = null;
      if (isText(d.file)) {
        const path = join(contentDir, 'files', d.file);
        if (!existsSync(path)) problems.push(`${it.file}: the report file "${d.file}" is not in content/files/.`);
        else size = statSync(path).size;
      } else warnings.push(`${it.file}: no report file is attached, so there is nothing to download for ${d.year}.`);
      // Individual money in and out, newest first. The home page shows the latest few next to the total received.
      const transactions = [];
      if (d.transactions !== undefined) {
        if (!Array.isArray(d.transactions)) problems.push(`${it.file}: "transactions" must be a list, one line each: - { date: 2025-12-18, direction: in, label: Year-end appeal, amount: 24300 }`);
        else {
          d.transactions.forEach((row, n) => {
            const at = `${it.file}: "transactions" item ${n + 1}`;
            if (!row || typeof row !== 'object' || Array.isArray(row)) return problems.push(`${at} must look like { date: 2025-12-18, direction: in, label: Year-end appeal, amount: 24300 }.`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date ?? '')) || Number.isNaN(Date.parse(row.date))) return problems.push(`${at}: "date" must be written YYYY-MM-DD.`);
            if (row.direction !== 'in' && row.direction !== 'out') return problems.push(`${at}: "direction" must be "in" (money received) or "out" (money paid).`);
            if (!isText(row.label)) return problems.push(`${at}: "label" is missing (a few words on what the money was for).`);
            if (!isNum(row.amount) || row.amount <= 0) return problems.push(`${at}: "amount" must be a number above zero. "direction" says whether it came in or went out.`);
            transactions.push({ date: String(row.date), direction: row.direction, label: row.label, amount: row.amount });
          });
          transactions.sort((a, b) => b.date.localeCompare(a.date));
          if (transactions.length && !isNum(d.income)) problems.push(`${it.file}: "transactions" are listed, so "income" (the total donations received that year) is needed too. It is the heading of the card.`);
        }
      }
      return {
        file: it.file,
        year: d.year,
        title: d.title,
        pdf: isText(d.file) ? d.file : null,
        size,
        students: d.students,
        operations: d.operations,
        fundraising: d.fundraising,
        spent: d.spent,
        income: isNum(d.income) ? d.income : null,
        transactions,
        audited: d.audited === true,
        body: it.body,
        sample: d.sample === true,
      };
    })
    .sort((a, b) => b.year - a.year);

  // ---- stories: published only when consent is recorded
  const stories = [];
  for (const it of readFolder(join(contentDir, 'stories'), 'content/stories', problems)) {
    track(it);
    unique(it, 'story');
    const d = it.data;
    need(it.file, d, 'title');
    need(it.file, d, 'student');
    if (d.consent !== true || !isText(d.consentRecorded)) {
      warnings.push(`${it.file}: not published. Consent is not recorded. Add "consent: true" and "consentRecorded: YYYY-MM-DD" once the signed consent is on file.`);
      continue;
    }
    stories.push({ slug: it.slug, file: it.file, title: d.title, student: d.student, program: d.program ?? '', year: d.year ?? null, quote: d.quote ?? '', image: d.image ?? null, imageAlt: d.imageAlt ?? '', body: it.body, sample: d.sample === true });
  }
  stories.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.slug.localeCompare(b.slug));

  // ---- news: a post with a future date waits until that day
  const today = now.toLocaleDateString('en-CA', { timeZone: site.timezone });
  const news = [];
  for (const it of readFolder(join(contentDir, 'news'), 'content/news', problems)) {
    track(it);
    const d = it.data;
    need(it.file, d, 'title');
    need(it.file, d, 'summary');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date ?? ''))) {
      problems.push(`${it.file}: "date" must look like 2026-09-01.`);
      continue;
    }
    if (d.date > today) {
      warnings.push(`${it.file}: scheduled for ${d.date}, so it is not on the site yet.`);
      continue;
    }
    const slug = it.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    news.push({ slug, file: it.file, title: d.title, summary: d.summary, date: d.date, image: d.image ?? null, imageAlt: d.imageAlt ?? '', body: it.body, sample: d.sample === true });
  }
  news.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

  // every image needs a description for people who cannot see it
  for (const [kind, list] of [['story', stories], ['news item', news]]) {
    for (const x of list) {
      if (x.image && !x.imageAlt) problems.push(`${x.file}: this ${kind} has an image but no "imageAlt". Describe the picture in a short sentence for people who cannot see it.`);
    }
  }

  return { site, fmt, now, pages, programs, impacts, reports, stories, news, samples, stubs, placeholders, warnings, problems };
}

function scanPlaceholders(file, text, out) {
  const found = [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
  if (found.length) out.push({ file, items: found });
}
