// WCAG 2.x contrast math and the palette rules the build enforces (NFR-1).
export function hex2rgb(h) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(h));
  if (!m) throw new Error(`"${h}" is not a 6-digit hex color such as #0B5D5E.`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex) {
  const [r, g, b] = hex2rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground token, background token, minimum ratio, what it protects]
export const PAIRS = [
  ['ink', 'paper', 7, 'body text on the page'],
  ['ink', 'surface', 7, 'body text on panels and fields'],
  ['inkSoft', 'paper', 4.5, 'secondary text on the page'],
  ['inkSoft', 'surface', 4.5, 'secondary text on panels'],
  ['ink', 'card', 7, 'text on cards'],
  ['inkSoft', 'card', 4.5, 'secondary text on cards'],
  ['link', 'paper', 4.5, 'links on the page'],
  ['link', 'surface', 4.5, 'links on panels'],
  ['link', 'card', 4.5, 'links on cards'],
  ['iconInk', 'tint', 4.5, 'blue icons on their tinted tiles'],
  ['ink', 'tint', 7, 'the current page in the menu'],
  ['warmInk', 'warmBg', 4.5, 'warm icons on their tinted tiles'],
  ['onBrand', 'brand', 4.5, 'button text'],
  ['onBrand', 'brandHover', 4.5, 'button text on hover'],
  ['brand', 'paper', 3, 'button edge against the page'],
  ['brand', 'card', 3, 'button edge against cards'],
  ['onBand', 'band', 4.5, 'text on the dark band'],
  ['onBandSoft', 'band', 4.5, 'secondary text on the dark band'],
  ['marker', 'band', 3, 'highlight on the dark band'],
  ['tickStudents', 'band', 3, 'ruler marks: students'],
  ['tickOperations', 'band', 3, 'ruler marks: running costs'],
  ['tickFundraising', 'band', 3, 'ruler marks: fundraising'],
  ['onMarker', 'marker', 4.5, 'text on a highlight'],
  ['fieldBorder', 'surface', 3, 'form field edge'],
  ['fieldBorder', 'paper', 3, 'form field edge against the page'],
  ['fieldBorder', 'card', 3, 'form field and secondary button edge against cards'],
  ['focus', 'paper', 3, 'keyboard focus ring on the page'],
  ['focus', 'surface', 3, 'keyboard focus ring on panels'],
  ['focus', 'card', 3, 'keyboard focus ring on cards'],
  ['focusOnBand', 'band', 3, 'keyboard focus ring on the dark band'],
  ['openInk', 'openBg', 4.5, '"Open" badge'],
  ['upcomingInk', 'upcomingBg', 4.5, '"Opening soon" badge'],
  ['closedInk', 'closedBg', 4.5, '"Closed" badge'],
  ['errorInk', 'errorBg', 4.5, 'error messages'],
  // decoration only, so no text rule applies; this keeps the lines from being set so pale they disappear
  ['deco', 'paper', 1.15, 'the decoration lines stay faintly visible'],
];

export function checkBrand(brand) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    const t = brand?.[theme];
    if (!t) {
      results.push({ theme, label: 'palette', ok: false, note: `brand.${theme} is missing in content/site.json` });
      continue;
    }
    for (const [fg, bg, min, label] of PAIRS) {
      if (!t[fg] || !t[bg]) {
        results.push({ theme, fg, bg, min, label, ok: false, note: `brand.${theme}.${!t[fg] ? fg : bg} is missing` });
        continue;
      }
      const r = ratio(t[fg], t[bg]);
      results.push({ theme, fg, bg, min, label, ratio: r, ok: r >= min, fgHex: t[fg], bgHex: t[bg] });
    }
  }
  return results;
}
