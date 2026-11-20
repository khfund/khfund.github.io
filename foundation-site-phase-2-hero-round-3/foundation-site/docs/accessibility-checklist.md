# Accessibility checklist (NFR-1: WCAG 2.2 AA)

Automated checks catch a lot but not everything. The requirement asks for keyboard and screen-reader checks, and **the screen-reader checks and the Safari and Firefox checks have not been done**: the environment this was built in had only Chromium and no screen reader. The tables below say what is proven and what a person still has to do before launch.

## Proven by automated checks

Run `npm run check` (reads the built pages) and `npm run check:render` (opens each page in Chromium at 320, 390, 768 and 1280 px wide, light and dark).

| Area | What is checked | By |
| --- | --- | --- |
| Language, titles | Page language is declared; each page has its own title and description | check |
| Structure | One `h1` per page, no skipped heading levels, one `main`, a skip link that lands on it, navigation areas have distinct names | check |
| Valid markup | Every tag opened and closed; no repeated ids; every `for`, `aria-labelledby` and `#fragment` finds its target | check |
| Images | Every image has `alt`; the text is not a file name; a picture in a figure is never empty | check |
| Icons | Every inline icon is `aria-hidden` (or has a role and a name), so decoration is never read out | check |
| Links | Every link has a name; every internal link and file exists; external links use https; new-tab links carry `rel="noopener"`; vague link text is flagged | check |
| Forms | Every field has a label; email fields use `autocomplete`; forms post to the server; spam traps present | check, and a real browser fills and sends them |
| Tables | Each has a caption or name and header cells; on phones they stack as "label: value" with explicit roles | check |
| Dates | Every date is machine-readable; every clock time names its time zone | check |
| Contrast | 35 color pairs in both themes at build time; **1,136 pieces of text per theme and width** as drawn in the browser (142 on gradients or hatching are covered by the pair check) | build, render |
| Keyboard | On the home, a program, contact and finances pages (the first 18 Tab stops of each): the skip link is first and works, every focused item shows a visible ring and stays on screen, and the hidden spam-trap field is never reached. On every page: the menu opens, closes with Escape and returns focus. | render |
| Target size | Buttons and links are at least 24 px or have the room around them (WCAG 2.5.8) | render |
| Reflow and spacing | No sideways scrolling at 320 px in either theme; the text-spacing overrides of WCAG 1.4.12 do not break the layout | render |
| Top of the home page | At 12 widths from 320 to 1920 px (just either side of each layout change) and in both themes: the headline, the four corner cards and the connector never overlap; on wide screens the figure cards are in the upper corners, level with the top of the headline, and are no wider than the pictures (nor much taller); the two pictures and the connector end on the same line, with the connector between them; no long word in a card or in the headline is broken in the middle; the pictures have no words in them and are hidden from screen readers; every icon stays inside its card; the cards are opaque; the lines join the pictures, the connector and the two side lines, are drawn behind the cards, ignore the pointer and never touch a figure card; below 64 rem the pictures, connector and branches do not show | render |
| High contrast | With forced colors emulated: the finances bars, legend swatches and the connector's rules are visible, and cards (the figure cards too), buttons and the logo tile keep an edge. The lines between the cards (the two side lines, the branches and the dashed stretches) are left out in this mode. | render |
| Motion | Nothing moves by itself. The only animation is smooth scrolling, and it is off when the visitor asks for reduced motion. | render, styles |
| Without scripts | Every page works, all links visible, no overflow | render |
| Themes | Light and dark follow the visitor's setting | render |
| Errors | A wrong address shows the site's own 404 page; form mistakes show a plain message and keep what was typed (usually) | render, tests |
| Speed and stability | On an emulated mid-range phone (slow 4× CPU, 1.6 Mbps, 150 ms) the first screen draws in about 0.7 s and nothing jumps (CLS 0.000) | render |

## Still to do by a person before launch

Mark each with a date and who did it.

### Screen readers (not yet done)

Test with at least two of: NVDA with Firefox or Chrome (Windows), VoiceOver with Safari (macOS and iPhone), TalkBack with Chrome (Android), JAWS if the audience uses it. On each, go through the pages listed below and confirm you can do the task without seeing the screen.

- [ ] **Home**: the mission sentence and the Donate and Apply buttons come first, then the two figure cards in a sensible order: "142 students funded in 2025" with each program and its number, and "$702,000 total donations in 2025" with each transaction (its label, its date, "Received" or "Paid out", then the amount). Each card is one link, to Impact or to Finances, and is announced once, not once per line. The arrows and the + and − signs are not read out as symbols. The two pictures (students and donors), the connector and the lines are skipped: they carry no words and no meaning.
- [ ] **A program page**: the facts (amount, deadline with its time zone, level, who can apply) are announced with their labels. An open program offers an Apply button; a closed one announces the closed notice instead.
- [ ] **How to apply and FAQ**: the questions open and close, and the open state is announced.
- [ ] **Finances**: the "of every 100" ruler is understood from its text (the picture is decorative); the report table reads as label and value pairs on a phone and as a table on a desktop; the download links say what they download and its size.
- [ ] **Impact**: the yearly table has a name and its columns read correctly; each story reads in order with the student's name, program and year.
- [ ] **Contact and newsletter forms**: each field's label and hint is read; an error is announced and focus reaches it; the confirmation page is announced.
- [ ] **Menu on a phone**: the button announces expanded or collapsed; focus moves into the menu and back.
- [ ] The decorative parts (the logo, the icons, the two home pictures and the connector, the lines, the ruler ticks, the hatching) are skipped, not read as noise.

### Browsers (not yet done)

Safari (macOS and iOS), Firefox, Edge and Chrome on a real phone. NFR-8 asks for the current versions of all four.

- [ ] Layout at 320 px with nothing cut off or sideways-scrolling.
- [ ] Fonts load and nothing jumps. (The fonts are `font-display: optional`: on a first slow visit a system sans-serif is expected.)
- [ ] The dark theme follows the system setting.
- [ ] Forms send and the confirmation pages show.
- [ ] Date and time display correctly. (The server and the build are in the site's time zone; a visitor's browser may be in another, and every time names its zone.)

### Zoom, text size and contrast by eye

- [ ] Browser zoom to 200% and 400%: still usable without sideways scrolling.
- [ ] Larger default text size set in the browser or the phone: nothing overlaps.
- [ ] **The two figure cards on the home page use small type** (0.75 rem, 12 px) in the secondary ink, because the Foundation asked for them to be quiet. The contrast passes (6.2 : 1 in the light theme, 9.9 : 1 in the dark), but read them at 100% and at 200% zoom, ideally with someone who has low vision. If they are hard to read, raise `font-size` in `.stat` (the [design plan](design-plan.md) lists the values) rather than darkening the text.
- [ ] Windows High Contrast themes: logo, buttons, cards, the finances bars and focus rings remain visible. (The rules for this mode are in the `forced-colors` block of `src/styles.css`, and `npm run check:render` emulates the mode. Look at it on real Windows themes too.)
- [ ] Printing a program page and the Finances page: readable, with links shown or understandable.

### Content that automation cannot judge

- [ ] **Plain language** on every page, at a reading level students and parents can follow without help.
- [ ] **Image descriptions** say what a person would want to know, not just what is in the frame.
- [ ] **Link text** reads well out of context ("Download the 2025 annual report (PDF, 1.2 MB)", not "Click here").
- [ ] **PDFs** (annual reports) are tagged and have a text layer. The sample PDFs are not representative.
- [ ] **Translations**, if added, set the page language and, for right-to-left languages, the direction. The builder supports one language today.

## When Phase 3 adds the application and sign-in

The application form, accounts, uploads and the review screens are new interfaces. Repeat the whole checklist for them. Pay particular attention to: error handling on long forms, session timeouts (WCAG 2.2.1: warn and allow extending), the sign-in method (WCAG 3.3.8: no cognitive test to sign in), file upload by keyboard, and status messages that a screen reader announces.

## Recording the result

Fix what a test finds, then add a check to `scripts/check-site.mjs` or `scripts/check-render.mjs` (and a case to `scripts/check.test.mjs` that breaks it) so it cannot return. Publish an accessibility statement that names the standard, the date tested, the tools and browsers used, known gaps, and how to ask for help or report a problem. The page `content/pages/accessibility.md` is the place; it is a sample until this testing is done.
