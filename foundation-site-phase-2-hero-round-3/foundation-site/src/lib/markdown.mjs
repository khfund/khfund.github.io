import { Marked } from 'marked';
import { esc, markPlaceholders } from './html.mjs';

// Addresses staff may link to: this site (/…, #…, a bare relative path), https, http, email and phone.
const SAFE_HREF = /^(?![a-z][a-z0-9+.-]*:)|^(https?|mailto|tel):/i;

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

// Markdown for staff-written text. Raw HTML is shown as text, site links go through the page's
// link builder, headings can be pushed down so each page keeps one h1. Every h2 gets an id so the
// page can offer a contents list; `toc` lists them.
export function renderMarkdown(src, { link = (x) => x, offset = 0 } = {}) {
  const toc = [];
  const used = new Set();
  const m = new Marked({
    gfm: true,
    renderer: {
      html({ text }) {
        return esc(text);
      },
      heading({ tokens, depth }) {
        const d = Math.min(6, depth + offset);
        const inner = this.parser.parseInline(tokens);
        if (d === 2) {
          const plain = inner.replace(/<[^>]+>/g, '');
          let id = slugify(plain);
          for (let n = 2; used.has(id); n++) id = `${slugify(plain)}-${n}`;
          used.add(id);
          toc.push({ id, text: plain });
          return `<h2 id="${id}">${inner}</h2>\n`;
        }
        return `<h${d}>${inner}</h${d}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        // Only ordinary kinds of address become links. A "javascript:" address is shown as plain text.
        if (!SAFE_HREF.test(href)) return text;
        const target = href.startsWith('/') ? link(href) : href;
        const external = /^https?:/i.test(href);
        return `<a href="${esc(target)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noopener noreferrer"' : ''}>${text}</a>`;
      },
    },
  });
  const html = markPlaceholders(m.parse(src));
  return { html, toc: toc.map((t) => ({ ...t, text: t.text.replace(/<[^>]+>/g, '') })) };
}

// FAQ files: every "## Question" heading starts a new question; the text below is the answer.
export function splitFaq(src) {
  const items = [];
  let cur = null;
  for (const line of src.split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) {
      cur = { q: h[1].trim(), a: [] };
      items.push(cur);
    } else if (cur) cur.a.push(line);
  }
  return items.map((i) => ({ q: i.q, a: i.a.join('\n').trim() }));
}
