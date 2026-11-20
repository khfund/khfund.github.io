// A small, tolerant reader for the HTML this site produces. It is not a general HTML parser: it knows
// enough about tags, attributes and text for the checks to look at structure (headings, links, labels).
// It also reports tags that are not closed properly, which usually means a template has a typo.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// HTML allows these to end without a closing tag. The site's own templates always close them.
const OPTIONAL_END = new Set(['li', 'p', 'td', 'th', 'tr', 'thead', 'tbody', 'tfoot', 'option', 'dt', 'dd', 'colgroup']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decode = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });

const TAG = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(src) {
  const attrs = {};
  for (const m of src.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function parseHtml(src) {
  const root = { type: 'root', tag: '#root', attrs: {}, children: [], parent: null };
  const problems = [];
  let cur = root;
  let last = 0;
  const lower = src.toLowerCase();
  const text = (s) => {
    if (s) cur.children.push({ type: 'text', text: s, parent: cur });
  };
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(src))) {
    text(src.slice(last, m.index));
    last = TAG.lastIndex;
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n !== root && n.tag !== tag) n = n.parent;
      if (n === root) {
        problems.push(`</${tag}> closes something that was never opened`);
        continue;
      }
      for (let open = cur; open !== n; open = open.parent) {
        if (!OPTIONAL_END.has(open.tag)) problems.push(`<${open.tag}> is not closed before </${tag}>`);
      }
      cur = n.parent;
      continue;
    }
    const tag = m[2].toLowerCase();
    const el = { type: 'el', tag, attrs: attributes(m[3] ?? ''), children: [], parent: cur };
    cur.children.push(el);
    if (VOID.has(tag) || m[4]) continue;
    if (tag === 'script' || tag === 'style') {
      const close = lower.indexOf(`</${tag}`, last);
      const end = close === -1 ? src.length : close;
      el.children.push({ type: 'text', text: src.slice(last, end), parent: el });
      TAG.lastIndex = last = close === -1 ? src.length : src.indexOf('>', close) + 1;
      continue;
    }
    cur = el;
  }
  text(src.slice(last));
  for (let open = cur; open !== root; open = open.parent) {
    if (!OPTIONAL_END.has(open.tag)) problems.push(`<${open.tag}> is never closed`);
  }
  return { root, problems };
}

export function* walk(node) {
  for (const c of node.children ?? []) {
    yield c;
    if (c.type === 'el') yield* walk(c);
  }
}

export const find = (node, test) => {
  const match = typeof test === 'string' ? (n) => n.tag === test : test;
  return [...walk(node)].filter((n) => n.type === 'el' && match(n));
};

export const ancestors = (node) => {
  const out = [];
  for (let n = node.parent; n && n.type !== 'root'; n = n.parent) out.push(n);
  return out;
};

export const clean = (s) => decode(s).replace(/\s+/g, ' ').trim();

// Visible text of a node (script, style and hidden parts left out).
export function textOf(node) {
  if (node.type === 'text') return node.text;
  if (node.tag === 'script' || node.tag === 'style' || 'hidden' in (node.attrs ?? {})) return '';
  return (node.children ?? []).map(textOf).join('');
}

// What a screen reader would call this link or button: its label, else its text, else an image's alt text.
export function nameOf(node) {
  if (node.type === 'text') return node.text;
  const a = node.attrs ?? {};
  if (a['aria-label']?.trim()) return a['aria-label'];
  if (node.tag === 'img') return a.alt ?? '';
  if (node.tag === 'script' || node.tag === 'style' || 'hidden' in a || a['aria-hidden'] === 'true') return '';
  return (node.children ?? []).map(nameOf).join('');
}

export const inHidden = (node) => [node, ...ancestors(node)].some((n) => n.attrs && ('hidden' in n.attrs || n.attrs['aria-hidden'] === 'true'));

// The exact text inside an element, scripts and styles included (textOf leaves those out on purpose).
export const rawText = (node) => (node.type === 'text' ? node.text : (node.children ?? []).map(rawText).join(''));
