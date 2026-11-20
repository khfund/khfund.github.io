# Phase 2 status: foundation and public site

Written 10 November 2026; restyled 14 November 2026; top of the home page revised 15 November 2026. Phase 2 of the project plan: a staging site with the design, navigation, public pages, financial pages and impact pages. The gate is **"Public site approved"** by the Foundation.

## In one paragraph

A working staging site of 28 pages is built and checked. It has the home page, scholarship and aid programs (with open, upcoming and closed states), how to apply, FAQ, financial transparency, impact figures and stories, news, partner page, contact, newsletter sign-up, and the legal and accessibility pages. All the text is **sample text** to be replaced by the Foundation's own, and the build refuses to publish to the public while any sample remains. Two things the plan called for are **not** built: a no-code editor for staff (PUB-7) and site search (PUB-12, marked "Later"). Email is not connected, so form messages are saved as files rather than sent. Safari, Firefox and screen-reader testing still have to be done by a person.

## Changes since 10 November: the new design

The whole site now follows the Foundation's mockup (pale page, white cards, pill buttons, Inter, one blue), on the home page and on every other page. The hero is built from the mockup with the Foundation's changes: icons instead of people photos, no toggle card, no icons on the flow line, **Donate** and **Apply for a scholarship** buttons, the six original menu items and no sign-in button. The rest of the home page keeps its content and order and takes the new look. [The design plan](design-plan.md) has the details and the reasons.

**Second round (14 and 15 November).** The Foundation's feedback on the first version changed the top of the home page again:

- The picture of students, the Foundation and donors is now **quiet background texture**: icons only, no labels, pale, opaque, hidden from screen readers, and left out on screens narrower than 64 rem.
- **Decoration lines** (built from the SVG the Foundation supplied) came down both sides of the hero and behind the cards. *Replaced in the third round, below.*
- The "Transparent" card and the figure line under the buttons are **removed**.
- Two **figure cards**, drawn in the same quiet style as the picture: **students funded** (the total, then a line for each program) and **total donations** (the total, then the four newest transactions, money in and out). Both are read from the newest content files, so nothing is typed into the page. The numbers are sample figures until the Foundation supplies its own. *Moved to the upper corners, smaller and quieter, in the third round.*

**Third round (15 November).** The Foundation sent a photo of another landing page and asked for three things from it, and nothing else: the arrangement of four cards, the placement and size of the headline, and the style of its connecting line, used between the students, connector and donors cards and not on the figure cards.

- **Four cards in the corners around a large, centred headline.** The two figure cards are at the top; the students picture and the donors picture are at the bottom, set in a little from the edge, as in the photo; the connector is between those two, under the buttons.
- **Figure cards smaller and quieter.** 14.5 rem (232 px) wide, the same as the students picture; small type (0.75 rem) all in the secondary ink; no rules between the lines; the same pale surface as the pictures. The [design plan](design-plan.md) lists the exact values to change if they should be bigger, smaller or quieter.
- **Lines only between the students picture, the connector and the donors picture.** Two lines run down the sides of the page; from each, a quarter-circle branch turns in under its picture; a dashed stretch with a dot and an arrowhead runs from each picture to the connector, so the line reads donors, then the connector, then students. No line touches a figure card. The second round's weaving lines are gone.
- **From 64 rem (1024 px).** Below that, the pictures, connector and branches are left out, and the headline and the two figure cards remain (side by side from 640 px, stacked on a phone).

The new content details are `byProgram` (yearly figures), `transactions` and `income` (reports) and `icon` (programs); see the [content guide](content-guide.md).

For the Foundation to confirm:

1. **The name.** "Khwarizmi Scholarship & Financial Aid" is taken from the mockup, and "Khwarizmi" is used as the short name in the header and the browser tab.
2. **The logo.** The site uses a redraw of the mockup's mark. It needs the real artwork.
3. **The figures on the two home page cards** (142 students funded by program; $702,000 total donations and five transactions in 2025) are sample numbers, marked `sample: true`, like the rest. A production build refuses them until the Foundation supplies its own.
4. **Arrowheads on the lines** (third round, chosen without being asked). The photo's line ends in an arrowhead, so the two dashed lines now point from the donors to the connector and from the connector to the students. The first version had none on purpose, so that the page would not say which way money moves. Say if they should go.
5. **Where the pieces sit** (third round, chosen without being asked). The connector is at the bottom centre, under the buttons, between the two pictures; the students picture is at the lower left and the donors picture at the lower right, each under its figure card (students funded on the left, donations on the right).
6. **Small type on the figure cards** (third round). The type is 12 px in the secondary ink so the cards stay quiet. It passes the contrast rules (6.2 : 1 in the light theme, 9.9 : 1 in the dark), but it is small; say if it should be larger.

Not built, on purpose: Pashto and Dari (the stylesheet is right-to-left ready), money amounts and claims (the Foundation will supply them), and anything with the example `.af` address.

## Requirements

Status: **Done** = built and verified. **Done, with limits** = built and verified, with a stated limit. **Open** = not built.

### Public site

| Req | Status | What exists | Verified by | What remains |
| --- | --- | --- | --- | --- |
| PUB-1 Home | Done, with limits | Mission sentence, Donate and Apply buttons, a card of students funded by program and a card of total donations with the newest transactions (both read from the newest content files), the quiet students and donors pictures with the connector between them, and the lines that join those three | Page checks; unit tests of the card data and markup; browser checks at 12 widths from 320 to 1920, light and dark | The figures on the two cards are sample numbers until the Foundation supplies its own. Donate leads to a stand-in page until payments (Phase 4). |
| PUB-2 Program pages | Done | Eligibility, amount, deadline; Apply button replaced by a "closed" notice after the deadline; "not open yet" before the opening; always-open programs | Unit tests of every boundary; real-browser test with the clock set to a minute before opening, the last second before closing, one second after, and a year later | The Apply button leads to a stand-in page until Phase 3. A deadline must be written with its time. |
| PUB-3 About | Done (sample text) | Story, mission, leadership, contact | Page checks | The Foundation's own text |
| PUB-4 Financial transparency | Done (sample figures) | Annual reports as downloadable files with their size; "where your money goes" in plain words, with a ruler of 100 ticks and a table by year | Page checks; the build refuses a money split that does not add to 100 and a missing PDF | The Foundation's real reports and figures; definitions of "students", "operations", "fundraising" |
| PUB-5 Impact | Done (sample figures) | Yearly figures table and stories | Tests: a story with no recorded consent never appears | Real figures and stories. Consent must be on file before each story is published. |
| PUB-6 Contact form | Done, with limits | Form with a topic, spam protection, delivery to the staff mailbox | Tests and a real-browser run: valid, invalid, too fast, hidden trap | **Email is not connected.** Messages are saved in `data/outbox/`. See "Not done". |
| PUB-7 No-code editing | **Open** | Staff edit plain-text files using the [content guide](content-guide.md). The build explains every mistake in plain words. | The rules are tested | A browser-based editor. It needs a content-management package, which could not be installed here. |
| PUB-8 FAQ and step-by-step guide | Done (sample text) | "How to apply" with numbered steps, and an FAQ whose questions open and close | Page checks; works with scripts off | The Foundation's own answers |
| PUB-9 Partner page and sponsor enquiry | Done, with limits | Page and enquiry form | As PUB-6 | As PUB-6 |
| PUB-10 News | Done | News list and posts, an Atom feed, future-dated posts wait for their day | Tests; feed entry count checked against the pages | Staff add a post by adding a file until PUB-7 exists |
| PUB-11 Newsletter double opt-in | Done, with limits | Footer sign-up; a confirmation email with a link valid for 3 days; only confirmed addresses are kept, with the time they confirmed; one-click unsubscribe | Tests and a real-browser run of the whole flow | Email not connected. Make the links two-step when it is, because email scanners open links. |
| PUB-12 Site search (Later) | Not built | | | |

### Non-functional

| Req | Status | Evidence | What remains |
| --- | --- | --- | --- |
| NFR-1 Accessibility, WCAG 2.2 AA (Must) | **Partly verified** | Automated: 19 page rules and 16 browser checks, including contrast as drawn (1,136 pieces of text per theme and width), keyboard focus, target size, text spacing, reflow at 320 px, high-contrast (forced colours) mode, no motion, works without scripts. See the [accessibility checklist](accessibility-checklist.md). | **Screen-reader testing and Safari and Firefox testing have not been done.** They are needed before the gate. |
| NFR-2 Privacy (Must) | **Partly** | Newsletter consent is recorded with its time. Stories need recorded consent. A sample privacy notice exists. Only what is needed is collected. | Retention periods, and a tested way to give someone their data, correct it, or delete it (today: find and edit or delete the file by hand). A privacy notice written for the Foundation's country and legal entity. |
| NFR-3 No tracking before consent (Must) | Done | The site sets no cookies and loads nothing from other sites. Analytics are off. If enabled, nothing loads until the visitor agrees. | **Before enabling analytics, add a visible way to change the choice later.** |
| NFR-4 Security (Must) | Done for this stage | Strict content policy; HTTPS-ready headers; same-origin check on forms; rate limits; private files created readable by the server only; Markdown cannot carry scripts. Roles and encrypted private uploads arrive with accounts in Phase 3. | Hosting over HTTPS. Rate limiting on sign-in (Phase 3). |
| NFR-5 Dependency scan before release (Must) | **Not done** | The running server uses only Node's built-in features. `marked` is used only while building. | Run `npm audit --omit=dev` (needs network access) and make it part of each release. |
| NFR-6 Speed (Should) | Done | Home first screen about 0.7 s on an emulated mid-range phone over a slow connection (target 2.5 s); layout shift 0.000; after compression styles 7.6 KB, script 1.1 KB, fonts 55 KB; heaviest first view 68 KB. | A measurement on a real device and on the real host |
| NFR-7 99.9% availability (Should) | Not set up | `/healthz` is ready for a monitor | Hosting, monitoring |
| NFR-8 Browsers and 320 px (Must) | **Partly verified** | Chromium at 320, 390, 768, 1280 px, both themes | Safari, Firefox, Edge on real devices |
| NFR-9 Daily backups, tested restore (Must) | Not set up | The [operations guide](operations.md) says what to back up and how to test a restore | Hosting and the backup job |
| NFR-10 Documented for a new developer (Must) | Done | README and the documents in `docs/`; 243 tests; checks that explain failures in plain words | Keep them current |
| NFR-11 Titles, descriptions, sitemap, share previews (Should) | Done | Checked on every page. The sitemap and canonical links appear in production builds. | Set `siteUrl` |

## Verification, honestly stated

Run on 15 November 2026 (after the third round of feedback), all passing:

- **243 automated tests.** They cover the content rules, the home page cards and lines, dates and the deadline boundary, the forms and the server, the production gate, and the checkers themselves: the page checker is shown to fail on 66 deliberately broken builds, because a check that cannot fail proves nothing.
- **Page checks** (`npm run check`): 19 rules over 28 pages.
- **Browser checks** (`npm run check:render`): 16 groups, in Chromium, at four widths, in light and dark. The top of the home page is checked at 12 widths from 320 to 1920 (just either side of each layout change): the headline, the four corner cards and the connector never overlap; the figure cards are no bigger than the pictures; no word in a card or in the headline is broken in the middle; the pictures have no words; the cards are opaque; and the lines join the three pictures and the two side lines, run behind the cards, and never touch a figure card. High-contrast mode is emulated. Each of these checks was shown to fail on a deliberately broken copy of the site (17 such copies this round, among them oversized cards, see-through cards, a line drawn over a card, a line that stops short of its picture, and a headline that grows into the cards).

Not covered: Safari, Firefox, real phones, any screen reader, real email, a real host, and the dependency scan. The page and browser checks found real faults along the way (a skipped heading level, a form label pointing at the wrong element, a table with no name, low-contrast skip link, long words overflowing at 320 px, layout shift while fonts loaded, an oversized form dropping the connection) and all are fixed and now guarded by tests. Two more were found while writing these documents and also fixed: a deadline written as a date alone would have closed a program at the start of that day, and a replaced logo would have been shown from cache for up to a year.

## Not done, and what it takes

| Item | Why | Next step |
| --- | --- | --- |
| No-code editor (PUB-7) | A content-management package could not be installed here | In a session with package installs allowed, add one that reads and writes the existing content files, or use an existing editor such as a Git-based CMS. The files are already Markdown with simple details. |
| Real email | No mail provider chosen | Choose a provider; replace the outbox in `server/mail.mjs`; test; then announce the contact form. **Until then, a visitor's message is saved but nobody is told.** |
| Site search (PUB-12) | Ranked "Later" | A small search over the built pages when wanted |
| Application portal, accounts, review, payments | Phases 3 and 4 | The Apply buttons already lead to the stand-in `/apply/start/` |
| Retention, export, deletion (NFR-2) | Needs the Foundation's retention decisions | Decide periods; build a small tool; test it |
| Dependency scan (NFR-5) | Needs network access | `npm audit --omit=dev` in the release routine |
| Hosting, uptime, backups (NFR-7, NFR-9) | Not chosen | See the operations guide |
| Safari, Firefox, screen reader | Not available here | Use the checklist |
| Fonts for other scripts; WOFF2 | Fonts are cut to Latin, as WOFF | Re-run `npm run fonts` with the needed characters when other languages are added |
| Change-the-choice control for analytics | Analytics are off | Add before enabling them |

## What the Foundation must supply

A production build currently refuses with **51 things to fix**. They fall into these groups:

- **Settings** in `content/site.json`: the legal line, postal address, staff mailbox and the public address (`siteUrl`). The name and tagline are set (the name is from the mockup) but the Foundation should confirm them. The time zone, locale and currency are still placeholders (UTC, `en-US`, USD).
- **Files marked `sample: true`** (27): eleven pages (home, about, how to apply, FAQ, finances, partner, contact, donate, privacy, terms, accessibility), the four programs, three stories, three news posts, three yearly figures and three annual reports. The sample PDFs are placeholders.
- **Two stand-in pages** (`stub: true`): Donate, and the start of the application. They are replaced in Phases 3 and 4.
- **Every `[[placeholder]]`** inside those files.
- **The logo and colors**, which are a redraw of the mockup's mark and the blue and amber of the mockup. Replacing `content/brand/mark.svg` and the `brand` colors in `site.json` re-colors everything, and the build refuses combinations that are hard to read. After that, run `npm run brand-images` (it needs `rsvg-convert`) to redraw the home-screen icon and the share image.
- **Real photographs**, if wanted. There are none today, deliberately: no stock images and no student photos without consent.

## Questions for the Foundation

These could not be decided from what was given and nothing was assumed. Each affects content or Phase 3.

1. **Country and legal entity.** This decides the privacy law that applies, the wording of the privacy and terms pages, the registration details in the footer, tax-receipt rules, and the currency, locale and time zone (now UTC, `en-US`, USD as placeholders).
2. **Brand.** The name and look come from the mockup. Is the logo final (the site uses a redraw), and are the blue and the amber the brand colors? Both can be changed in one place.
3. **Languages.** One language today. Pashto and Dari are planned. The stylesheet is already right-to-left ready, but translated pages, fonts that cover the script and a language switch are not built.
4. **Payment provider and donation rules** (Phase 4): one-off and monthly gifts, receipts, which countries, which payment methods.
5. **Applicants under 18.** Is parental consent needed, and where does the applicant's age come from? It changes the application form and the stories rule.
6. **Sign-in method for applicants and staff** (Phase 3): email link, password, or a sign-in provider; and a way to sign in without a cognitive test.
7. **Reviewers.** How many people review each application, and what do they see?
8. **Retention.** How long are applications, messages and newsletter addresses kept, and who may ask for deletion?
9. **Who answers the contact form**, and how fast. The page promises a reply time (`reply` on the contact page).

## Before the gate "Public site approved"

1. The Foundation reads the staging preview and replaces the sample text and settings (the [content guide](content-guide.md) explains how). `npm run build:production` succeeds.
2. Email is connected and the contact form is tested end to end.
3. The checklist in [accessibility-checklist.md](accessibility-checklist.md) is completed on at least two screen readers and in Safari and Firefox, and the accessibility statement is written from the result.
4. Hosting over HTTPS, an hourly rebuild, daily backups with a tested restore ([operations](operations.md)).
5. `npm audit --omit=dev` is clean.
6. The Foundation signs off.
