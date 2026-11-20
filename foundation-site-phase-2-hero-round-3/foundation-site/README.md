# Foundation website: Phase 2 (public site)

The public website for a scholarship and financial-aid foundation: programs, how to apply, impact, financial transparency, news, partners, contact and newsletter.

This is **Phase 2** of the project plan: a staging site with the design, navigation, public pages and financial pages. It does not yet have the application portal (Phase 3), payments (Phase 4) or a no-code editor for staff (see "What is not built"). Everything on it that the Foundation must supply (name, numbers, dates, stories, legal text) is a clearly marked sample.

Start with [docs/status-phase-2.md](docs/status-phase-2.md). It lists every requirement, whether it is met, how that was checked, and what is still open.

## Quick start

You need Node.js 22 or newer.

```
npm install         # installs "marked" (needed to build) and "playwright" (only for the browser checks)
npm run build       # builds the staging site into dist/
npm start           # serves dist/ and the three forms at http://localhost:8080
```

Open http://localhost:8080. The strip at the top says "Staging preview". That is correct: the content is still sample text.

For the browser checks only: `npx playwright install chromium`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Staging build into `dist/`. Samples allowed. Search engines are asked to stay away. |
| `npm run build:preview` | Same, but links work from any folder or host (used for the shareable preview). Forms do not work in it. |
| `npm run build:production` | Refuses to build while any sample, stub, placeholder or missing site address remains. Writes nothing when it refuses, and exits with code 1. |
| `npm start` | Serves `dist/` plus the forms (`server/server.mjs`). |
| `npm test` | 243 automated tests: content rules, dates, forms, server, and the site checkers themselves. |
| `npm run check` | Reads the built pages and checks accessibility, links, forms, security policy, search and sharing, and page weight. |
| `npm run check:render` | Opens every page in Chromium at four widths, light and dark, and checks layout, keyboard use, contrast as drawn, speed, and the forms. About a minute. |
| `npm run check:all` | Build, then all of the above. |
| `npm run fonts`, `brand-images`, `samples` | Regenerate the font files, the two brand PNGs, and the sample report PDFs. Rarely needed. See the header of each script for what it needs. |

`build`, `build:preview` and `build:production` all accept `--out <folder>` to write somewhere other than `dist/`. `check` and `check:render` accept `--dist <folder>`.

## How it is put together

There is no web framework. A small Node program reads text files and writes plain HTML, one CSS file and one tiny script. A second small Node program serves the result and handles the forms.

```
content/          Everything staff write. Text files, one JSON settings file, images, PDFs.
  site.json       Name, contact details, menu, time zone, currency, colors (both themes)
  pages/          One file per fixed page (home, about, privacy, ...)
  programs/       One file per scholarship, award or grant
  stories/        Student stories (published only with recorded consent)
  news/           News posts (a future date waits until that day)
  data/           One file per year of impact figures
  reports/        One file per year: the money split and the annual report file
  files/          Downloadable files (annual report PDFs)
  images/         Pictures used by stories and news
  brand/mark.svg  The logo
src/              The site builder
  build.mjs       Entry point and the production gate
  content.mjs     Reads content/ and enforces the rules staff must follow
  pages.mjs       What each page contains
  components.mjs  Shared pieces (tables, the ruler, facts, badges)
  layout.mjs      Head, header, footer, staging strip
  styles.css      All styling; colors come from content/site.json
  site.js         The only script (menu, program state swap, form timer)
  lib/            Dates and time zones, Markdown, front matter, contrast, security headers, URLs
  assets/         Fonts (cut down to Latin) and two brand PNGs
server/           Static file server and the forms (contact, partner, newsletter)
scripts/          Tests and the two site checkers, plus generators
docs/             Design plan, status, decisions, operations, content guide, accessibility checklist
dist/             Build output. Never edit by hand. Safe to delete.
data/             Created by the server: outbox, held messages, subscribers, signing key. Keep private.
```

## Documents

| Document | For |
| --- | --- |
| [docs/status-phase-2.md](docs/status-phase-2.md) | Foundation leadership and whoever continues the work: what is done, what is not, how it was verified |
| [docs/content-guide.md](docs/content-guide.md) | The people who write and update the site's text |
| [docs/operations.md](docs/operations.md) | Whoever runs the site: settings, deploying, backups, the data folder, rebuild schedule |
| [docs/decisions.md](docs/decisions.md) | Developers: why things are built this way, and the rules that must not be broken |
| [docs/accessibility-checklist.md](docs/accessibility-checklist.md) | What is automated, and the manual checks that still have to be done before launch |
| [docs/design-plan.md](docs/design-plan.md) | The visual idea, colors, type, layout, and how the brand can be replaced |

## What is not built

Phase 2 is complete except for the items below. The full list, with reasons, is in the status document.

- **No-code editor (PUB-7).** Staff edit text files today. A browser-based editor needs a content-management package that could not be installed in the environment this was built in.
- **Site search (PUB-12)**, which the requirements rank "Later".
- **Real email.** Messages and confirmation emails are written to `data/outbox/` as files. Connecting a mail service is one small change (`server/mail.mjs`).
- **Application portal, accounts, review, payments, donations.** Phases 3 and 4. The Apply buttons go to a stand-in page and the Donate page is a stand-in.
- **Retention, export and deletion tools (NFR-2)**, the dependency vulnerability scan (NFR-5, needs network access), hosting, backups and uptime (NFR-7, NFR-9).
- **Testing in Safari and Firefox, and with a real screen reader.** Only Chromium was available.

## Licences

- Code: written for the Foundation. Dependencies: `marked` (MIT), `playwright` (Apache 2.0, development only).
- Fonts: Inter (SIL Open Font License 1.1), Regular and Bold, cut down to Latin. The licence text is in `src/assets/fonts/LICENSES.txt` and the recipe is in `scripts/make-fonts.py`.
