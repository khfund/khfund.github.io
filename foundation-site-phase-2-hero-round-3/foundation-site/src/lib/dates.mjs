// Dates are written by staff as local time in the foundation's time zone ("2027-03-31 23:59").
// These helpers turn them into exact instants and into readable text that always names the zone.

function offsetMs(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const v = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs;
}

export function zonedToUtc(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(String(local).trim());
  if (!m) throw new Error(`"${local}" is not a date. Write it as YYYY-MM-DD HH:mm, for example 2027-03-31 23:59.`);
  const [, y, mo, d, h = '0', mi = '0'] = m;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const next = wall - offsetMs(guess, tz);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

// A deadline written as 23:59 means applications are accepted until the end of that minute. So a student who
// is still typing at 23:59:30 is not turned away by a page that said "23:59". The program's application form
// (Phase 3) must use the same rule.
export const closesAt = (p) => (p.deadlineAt ? new Date(p.deadlineAt.getTime() + 60_000) : null);

export function programState(p, now) {
  if (p.opensAt && now < p.opensAt) return 'upcoming';
  if (p.deadlineAt && now >= closesAt(p)) return 'closed';
  return 'open';
}

export function makeFormatters({ locale, timezone, currency }) {
  const nf = new Intl.NumberFormat(locale);
  const mf = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const dateInZone = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric' });
  const timeInZone = new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const zoneName = new Intl.DateTimeFormat(locale, { timeZone: timezone, timeZoneName: 'long' });
  const dateUtc = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const monthUtc = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const shortUtc = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const zoneShort = new Intl.DateTimeFormat(locale, { timeZone: timezone, timeZoneName: 'short' });
  const tzLong = (d) => zoneName.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? timezone;
  const tzShort = (d) => zoneShort.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? timezone;
  const fromIsoDate = (iso) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  return {
    number: (n) => nf.format(n),
    money: (n) => mf.format(n),
    day: (d) => dateInZone.format(d),
    // "31 March 2027, 23:59 Central European Summer Time"
    instant: (d) => `${dateInZone.format(d)}, ${timeInZone.format(d)} ${tzLong(d)}`,
    // "March 31, 2027, 23:59 UTC" for lists where space is tight; the time zone is still named
    instantShort: (d) => `${dateInZone.format(d)}, ${timeInZone.format(d)} ${tzShort(d)}`,
    isoDate: (iso) => dateUtc.format(fromIsoDate(iso)),
    isoMonth: (iso) => monthUtc.format(fromIsoDate(iso)),
    // "Dec 18": for a list where the year is already stated nearby
    isoShort: (iso) => shortUtc.format(fromIsoDate(iso)),
    tzLong,
    tzShort,
  };
}
