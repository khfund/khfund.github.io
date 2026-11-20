// Icons for the page design. They are drawn by hand on a 24 x 24 grid with a 1.75 stroke and round ends, so they
// sit well beside the type. Every icon is decoration: it is hidden from screen readers (aria-hidden), and the
// words next to it carry the meaning. Colour and size come from the stylesheet (stroke is "currentColor").
import { raw } from './lib/html.mjs';

const DRAW = {
  // students
  cap: '<path d="M2.5 9.2 12 4.5l9.5 4.7-9.5 4.7z"/><path d="M6.5 11.7v4.1c0 1.4 2.6 3 5.5 3s5.5-1.6 5.5-3v-4.1"/><path d="M21.5 9.2v5.4"/>',
  hardhat: '<rect x="2.5" y="16" width="19" height="3.2" rx="1.2"/><path d="M5 16a7 7 0 0 1 14 0"/><path d="M9.8 9.4V16M14.2 9.4V16"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="9.8" y="9.8" width="4.4" height="4.4" rx=".8"/><path d="M9.5 6.5v-3M14.5 6.5v-3M9.5 20.5v-3M14.5 20.5v-3M6.5 9.5h-3M6.5 14.5h-3M20.5 9.5h-3M20.5 14.5h-3"/>',
  flask: '<path d="M9.5 3.5h5"/><path d="M10 3.5v5.2L4.9 17.4a2 2 0 0 0 1.7 3.1h10.8a2 2 0 0 0 1.7-3.1L14 8.7V3.5"/><path d="M7.3 14.5h9.4"/>',
  book: '<path d="M12 6.8C10.3 5.3 7.8 4.6 3.5 4.6v12.9c4.3 0 6.8.7 8.5 2.2 1.7-1.5 4.2-2.2 8.5-2.2V4.6c-4.3 0-6.8.7-8.5 2.2zM12 6.8v12.9"/>',
  // donors
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M14.9 9.3c-.3-1.2-1.4-1.9-2.9-1.9-1.7 0-2.9.9-2.9 2.2 0 1.4 1.3 1.9 2.9 2.3 1.7.4 2.9.9 2.9 2.3 0 1.3-1.3 2.2-2.9 2.2-1.6 0-2.8-.8-3.1-2.1M12 5.9v1.5M12 16.6v1.5"/>',
  heart: '<path d="M12 20.2C7.1 17.2 3.5 13.9 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3.2.9 4 2.3C12.8 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 4.3-3.6 7.6-8.5 10.6z"/>',
  donation: '<path d="M12 11.6C9.4 10.1 7.6 8.5 7.6 6.5 7.6 5.1 8.6 4.1 9.9 4.1c.9 0 1.7.5 2.1 1.2.4-.7 1.2-1.2 2.1-1.2 1.3 0 2.3 1 2.3 2.4 0 2-1.8 3.6-4.4 5.1z"/><rect x="2.5" y="14.5" width="2.8" height="6.5" rx="1"/><path d="M5.3 16.4l3-.8c.9-.2 1.7 0 2.4.4l1.1.7h2.5c.8 0 1.4.6 1.4 1.3s-.6 1.3-1.4 1.3h-3.2"/><path d="M8.6 19.8l3.9 1.1c.7.2 1.4.1 2-.2l5.8-3c.7-.4 1-1.2.6-1.9-.4-.7-1.2-1-1.9-.6l-3.7 1.8"/>',
  gift: '<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7.5h14V13M12 9v11.5"/><path d="M12 9C10.4 9 7.5 8.6 7.5 6.2 7.5 5 8.4 4 9.7 4 11.4 4 12 6.4 12 9zM12 9c1.6 0 4.5-.4 4.5-2.8C16.5 5 15.6 4 14.3 4 12.6 4 12 6.4 12 9z"/>',
  building: '<rect x="5" y="3.5" width="14" height="17" rx="1.6"/><path d="M9 8h1.6M13.4 8H15M9 12h1.6M13.4 12H15M10 20.5V17h4v3.5"/>',
  users: '<circle cx="9" cy="8.2" r="3.2"/><path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17.2" cy="9" r="2.4"/><path d="M17.2 14.2c2.4 0 3.8 1.7 3.8 4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><ellipse cx="12" cy="12" rx="4" ry="9"/>',
  // money moving: arrows slanted like a bank statement's, pointing into or out of the Foundation
  moneyIn: '<path d="M17 7 7 17"/><path d="M7 8.8V17h8.2"/>',
  moneyOut: '<path d="M7 17 17 7"/><path d="M8.8 7H17v8.2"/>',
};

export const ICON_NAMES = Object.keys(DRAW);

export function icon(name, cls = '') {
  const d = DRAW[name];
  if (!d) throw new Error(`There is no icon called "${name}". The icons are: ${ICON_NAMES.join(', ')}.`);
  return raw(`<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${d}</svg>`);
}
