// Link builder. "clean": root-relative URLs for a real host. "relative": document-relative links
// that end in index.html, so the same pages work from any folder, a preview host, or a local file.
export function makeLinker(style) {
  return (from, to) => {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(to)) return to;
    const m = /^([^?#]*)([?#].*)?$/.exec(to);
    const p = m[1];
    const rest = m[2] || '';
    if (style === 'clean') return p + rest;
    const target = p.endsWith('/') ? `${p}index.html` : p;
    const fromDir = (from.endsWith('/') ? from : from.slice(0, from.lastIndexOf('/') + 1)).split('/').filter(Boolean);
    const toParts = target.split('/').filter(Boolean);
    let i = 0;
    while (i < fromDir.length && i < toParts.length - 1 && fromDir[i] === toParts[i]) i++;
    const up = '../'.repeat(fromDir.length - i);
    return (up + toParts.slice(i).join('/') || toParts.at(-1)) + rest;
  };
}
