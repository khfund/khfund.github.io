// Tiny HTML builder. Every interpolated value is escaped unless it was made by html`` or raw().
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const str = (v) => render(v);

// Text that may contain [[placeholder]] markers written by staff. Escaped, then marked up.
export const markPlaceholders = (s) => s.replace(/\[\[(.+?)\]\]/g, '<mark class="placeholder">$1</mark>');
export const ph = (s) => raw(markPlaceholders(esc(s ?? '')));
