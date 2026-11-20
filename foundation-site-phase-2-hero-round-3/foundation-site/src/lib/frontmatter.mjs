// Front matter reader for the YAML subset used in content files:
//   key: value        (text, numbers, true/false; quote text that starts with a symbol)
//   key:              (followed by "  - item" lines for a list of text items)
//   key:              (or a list of small inline maps, one per line:)
//     - { date: 2025-12-18, direction: in, label: "Year-end appeal, online", amount: 24300 }
// Everything here is valid YAML, so a CMS that writes real YAML can edit the same files later.

function scalar(v) {
  if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// "{ a: 1, b: some text, c: "text, with a comma" }" becomes { a: 1, b: 'some text', c: 'text, with a comma' }.
// Returns null when the text is not shaped like that, so the caller can say which line is wrong.
function inlineMap(text) {
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const body = text.slice(1, -1);
  const out = {};
  let i = 0;
  while (i < body.length) {
    while (body[i] === ' ') i += 1;
    if (i >= body.length) break;
    const k = /^([A-Za-z][\w-]*)\s*:\s*/.exec(body.slice(i));
    if (!k) return null;
    i += k[0].length;
    let value;
    const q = body[i];
    if (q === '"' || q === "'") {
      let j = i + 1;
      let s = '';
      while (j < body.length && body[j] !== q) {
        if (q === '"' && body[j] === '\\' && body[j + 1] === '"') {
          s += '"';
          j += 2;
        } else {
          s += body[j];
          j += 1;
        }
      }
      if (j >= body.length) return null; // the quote is never closed
      value = s;
      i = j + 1;
    } else {
      let j = i;
      while (j < body.length && body[j] !== ',') j += 1;
      value = scalar(body.slice(i, j).trim());
      i = j;
    }
    out[k[1]] = value;
    while (body[i] === ' ') i += 1;
    if (i < body.length) {
      if (body[i] !== ',') return null;
      i += 1;
    }
  }
  return out;
}

export function parseFrontMatter(text, file = 'file') {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let key = null;
  m[1].split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    let mm = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (mm) {
      key = mm[1];
      const v = mm[2].trim();
      data[key] = v === '' ? [] : scalar(v);
      return;
    }
    mm = /^\s+-\s+(.*)$/.exec(line);
    if (mm && Array.isArray(data[key])) {
      const item = mm[1].trim();
      if (item.startsWith('{')) {
        const map = inlineMap(item);
        if (!map) throw new Error(`${file}: front matter line ${i + 2} is not understood: "${line}". Write an inline item as { key: value, key: value }, and put quotes around text that contains a comma.`);
        data[key].push(map);
      } else data[key].push(scalar(item));
      return;
    }
    throw new Error(`${file}: front matter line ${i + 2} is not understood: "${line}". Use "key: value" or "  - list item".`);
  });
  return { data, body: m[2] };
}
