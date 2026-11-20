# Design plan (Phase 2, restyled November 2026)

Status: built to this plan. The first plan (a "student's marked-up page": serif type, ruled lists, no cards) was replaced after the Foundation supplied a mockup of the home page's top section and asked for that look on every page. A second round of feedback (14 and 15 November) changed the top of the home page again: the students, flow and donors picture became quiet background texture with no words, the "Transparent" card and the figure line were removed, two figure cards and the decoration lines were added, and the figure cards were then made as quiet as the picture. A third round (15 November) rearranged the top once more, after the Foundation sent a photo of another landing page to borrow three things from and nothing else: the arrangement of four cards, the placement and size of the headline, and the way its connecting line is drawn. The four cards are now in the corners around a large, centred headline; the two figure cards are smaller and quieter and match the other two cards in size; and the lines join only the students picture, the connector and the donors picture, never the figure cards. This document describes the site as it is now. The last section says what changed and why.

## What the site is for

A scholarship and financial-aid foundation collects donations and spends them on students. Two groups decide whether the site works:

- **Students and families** need to find a program, see in seconds whether they qualify, see the deadline, and start applying. Many will be on a phone.
- **Donors and partners** need to believe their money reaches students. That is a question about numbers, so the site has to make the numbers easy to read and easy to check.

## Idea: calm cards, one blue, and a marker for what matters

A pale page with white cards, pill-shaped buttons and one blue for everything you can act on. Icons stand in for photos, because the Foundation has none yet and student photos need consent. The one thing that is not calm is the **marker**: a highlighter-yellow chip that appears only on a deadline, an amount, or the share of money that reaches students.

## What came from the mockup and what was decided on top of it

| Mockup | Built | Why |
| --- | --- | --- |
| Photos of people | Icons: graduation cap, hard hat, chip, flask for the students; gift, building, people, globe and dollar for the donors, with a hand holding a heart in the middle | The Foundation's request. Icons need no consent and cannot go stale. In the second round the whole picture became quiet background texture, and in the third it was split into two cards, one in each lower corner (see "Layout"). |
| A toggle card | Dropped | "Irrelevant" (the Foundation). |
| "Secure & Transparent" card | Removed | First cut down to one dim "Transparent" card (the Foundation asked to drop "Secure"); then removed altogether in the second round. Its place is taken by the two figure cards in the upper corners. The Finances page is still where the Foundation's openness can be checked. |
| Three icons on the flow between students and donors | Removed. A small dashed panel (the connector) with a tile carrying the logo mark, between two dashed lines that each have a dot at one end and an arrowhead at the other. No words. | The Foundation's request. The arrowheads were added in the third round because the line in the reference photo has them. They point from the donors to the connector (which carries the Foundation's mark) and from the connector to the students. |
| Labels on the picture ("Students", "Individual donor", "Corporate donor", "Together for Education" and so on) | Removed. Icons only. | The Foundation's request: the picture is texture and should not draw the eye. |
| (new) Two cards of figures in the upper corners | Left: students funded in the newest year, with a line for each program. Right: total donations in the newest report, with its four newest transactions, money in and money out. Both are drawn as part of the background and are the same width as the pictures below them. | The Foundation's request. The numbers come from the content files, never typed into the page. See "The two figure cards". |
| (new) Lines | Two pale lines down the sides of the page; from each, a branch turns in under the students or donors picture; a dashed line with a dot and an arrowhead joins each picture to the connector. None of them touches a figure card. | The Foundation's request: the connecting line from the reference photo, used between students, connector and donors, and not on the figure cards. The two side lines lead the eye down the page. See "The lines". |
| One figure under the buttons ("1,240 students funded since 2012") | Removed | The Foundation's request. The students card now says this with figures from the content files. |
| "Get started" and "Learn more" | **Donate** (filled) and **Apply for a scholarship** (outlined) | The Foundation's request. |
| Menu with a sign-in button | The six original items (Programs, How to apply, Impact, Finances, News, About) and a Donate button. No sign-in. | The Foundation's request. Accounts belong to a later phase. |
| Example address ending in `.af`, money figures, claims, language switch | Not built. | Examples, to be settled later; the text will be improved by the Foundation; Pashto and Dari come later. See "Right-to-left" below. |

The name **Khwarizmi Scholarship & Financial Aid** comes from the mockup. The logo is a redraw of the mockup's mark (`content/brand/mark.svg`) and stands in until the Foundation supplies the real artwork.

## Tokens

### Colour (light; the dark theme has its own steps in `content/site.json`)

| Name | Hex | Job |
| --- | --- | --- |
| paper | `#F7F8FD` | Page |
| card | `#FFFFFF` | Cards, rows, the header |
| surface | `#EDF1FB` | Fields, table stripes, quiet panels |
| line | `#DDE3F3` | One-pixel card edges and dividers |
| ink | `#0A1033` | Text |
| inkSoft | `#475C8B` | Secondary text |
| brand / link | `#1F5FE0` | Buttons, links, the focus ring |
| band | `#0E1A4B` | The finances band |
| marker | `#FFEF5C` | Deadlines, amounts, the students' share. Nothing else. |
| warm | `#F4A81D` (`#FFF0CC` tile, `#7A4200` ink) | Donors and giving only |
| deco, decoSoft | `#D0DFFF`, `#D4E1FF` (dark: `#1D2858`, `#222D61`) | The lines. `deco` is the solid ones (the two lines down the sides of the page, the branches, the connector's two short rules, and the dashed lines inside the donors picture); `decoSoft` is the dashed stretches between the pictures and the connector. The build refuses a `deco` that is less than 1.15 : 1 against the page, so the lines cannot be set so pale that they vanish. |

Status badges (open, opening soon, closed) use their own pairs and always carry a word, never colour alone.
Every text and graphic pair is checked at build time against WCAG 2.2 AA (35 pairs, in both themes), and again as drawn in a browser (`npm run check:render`, 1,136 pieces of text per theme and width).

### Type

- **Inter** (SIL Open Font License 1.1) for everything. Regular 400 and Bold 700 only; there is no italic file, so the design avoids italics. The mockup's face looks like Inter, so Inter is the nearest free match; if the Foundation owns a different face, replace the two files and the `font-family` token.
- Body 17 px / 1.65. Headings bold with tight tracking (-0.035 em at display sizes, less on small headings). The home headline is 2.25 to 3.4 rem on a phone or tablet, and 2.75 to 4 rem from 64 rem up, where it has the room. Headings inside running text are 1.45 to 1.85 rem, so a long page does not shout.
- Self-hosted, cut to Latin (about 55 KB for both files). Pashto and Dari need new font files; see "Right-to-left".
- Reading text is held to about 38 rem (60 to 70 characters). Left aligned, ragged right. No justified text. Hero text is centred, as in the mockup.

### Shape

- Four radii (12, 16, 24 and 32 px) are picked by the size of the shape: the bigger the surface, the rounder the corner. Buttons, badges, the header and the menu are pills.
- A card is a white surface, a 1 px `line` edge and a soft two-layer shadow (`--lift`, `--lift-lg`). Cards are used where a thing is a unit: a program row, a step, a story, a table, the donors group. Running text on article pages is not carded.
- The header is a floating white pill at the top of the page. It scrolls away with the page (it is not sticky), so it never covers content or the keyboard focus ring.
- Icons are hand-drawn SVG on a 24 grid (`src/icons.mjs`), stroke 1.75, round ends, always `aria-hidden`; the words next to them carry the meaning. A page check fails the build if an inline picture is neither hidden nor named.

### Layout

**Hero** (home page). A large, centred headline: the name on its own line, "Scholarship & Financial Aid", one sentence, then Donate and Apply for a scholarship. **Four cards sit around it, one in each corner**, with the connector between the two lower ones and lines joining the three lower things. The four-card arrangement (the lower two set in a little from the edge) and the size and placement of the headline come from a reference photo the Foundation supplied. Nothing else in that photo was copied.

- **Upper corners: the two figure cards** (left: students funded; right: total donations). Small, quiet, and the same width as the pictures below them. See "The two figure cards".
- **Lower corners: the two pictures.** The **students** picture (a three-by-three set of tiles, four of them holding the icons for the fields the Foundation funds) on the left, and the **donors** picture (five donor icons around a centre tile holding a hand with a heart) on the right. They have **no words at all** and are hidden from screen readers.
- **Lower middle: the connector**, a small dashed panel with a tile carrying the logo mark, under the buttons and on the line between the two pictures.
- **The lines** are described under "The lines" below.
- **Sizes of screen.** The corner arrangement starts at 64 rem (1024 px), and the headline is bigger there too (up to 4 rem). Below 64 rem only the headline and the two figure cards remain: side by side from 40 rem (640 px), stacked on a phone. The pictures, the connector, the branches and the dashed stretches are left out there, because they carry no content and there is no room to spare; only the two side lines remain.

```
wide screen (1024px and up)
|  +-------------+             Khwarizmi              +-------------+  |
|  | 142         |    Scholarship & Financial Aid     | $702,000    |  |
|  | students    |            one sentence            | donations   |  |
|  | by program  |      [Donate] [Apply for ...]      | 4 newest    |  |
|  +-------------+                                    +-------------+  |
|                                                                      |
|                                                                      |
|     +-----------+                                  +-----------+     |
|     | students  |            +--------+            | donors    |     |
+-----| picture   |<- - - - -o-| (mark) |<- - - - - o| picture   |-----+
|     |           |            +--------+            |           |     |
|     +-----------+                                  +-----------+     |
|                                                                      |
```

The two lines at the edges run the length of the page. From each one a branch turns in and passes under its picture (the picture is opaque, so the branch is hidden there), then comes out as a dashed stretch with a dot at one end and an arrowhead at the other, to the connector. The figure cards have no line touching them.

**Home page, top to bottom:**

```
header      mark + name       Programs  How to apply  Impact  Finances  News  About   [Donate]
hero        headline and two buttons in the middle; a figure card in each upper corner, a quiet picture in each lower corner, the connector between those two; lines joining the three
open now    cards: program | amount | closing date (marked) | state
band        "Of every $100 you give, $86 pay for students."  + the ruler
steps       how applying works (a real sequence, so it is numbered)
story       one student's words, shown only with recorded consent
news        two latest items
newsletter  sign-up (in the footer on every page)
footer
```

#### The two figure cards

They show real numbers, so they are content, but they are drawn as part of the background: the same surface as the pictures (the page colour, a pale one-pixel edge, no shadow), small type (0.75 rem), soft icon tiles, no rules between the lines. All of the text, the total included, is in the secondary ink; the total is picked out only by being bold and a little larger (1.25 rem). The headline and the buttons are the loudest things in the hero.

**Size.** From 64 rem a card is 14.5 rem (232 px) wide, the same as the students picture, so the four corner cards read as a set. At the sample figures the four cards are between 213 and 257 px tall (a label that wraps onto another line makes a card taller). The donors picture is a little wider than the others (15 rem, and 16.25 rem from 80 rem), and everything inside it scales with that width. Below 64 rem there are no pictures to match: a card is at most 18 rem wide when the two sit side by side (from 40 rem), and at most 20 rem wide on a phone.

| | Students card (left) | Donations card (right) |
| --- | --- | --- |
| Heading | The total: "142 students funded in 2025" | The total: "$702,000 total donations in 2025" |
| Lines | One per program: its icon, its name, its number. Four lines. With more than four programs, the three biggest and one "Other programs" line, so the lines always add up to the total. | The four newest transactions, newest first: an arrow, what it was, its date, and the amount with + or −. |
| Source | `byProgram` in the newest `content/data/impact-YYYY.md` | `income` and `transactions` in the newest `content/reports/YYYY.md` |
| Leads to | Impact | Finances |

- **Left out when there is nothing to show.** A card is left out if its source has no list, and the page still builds. The donations card never falls back to an older year: if the newest report has no `transactions`, there is no card, so old figures cannot pass for current ones.
- **In and out are said four ways**, so colour is never the only signal: the arrow's direction, a filled tile for money in and an outlined tile for money out, the + or − before the amount, and the words "Received" or "Paid out" for screen readers.
- **Each card is one link** (the heading is the link, and it is stretched over the whole card). A screen reader announces the heading, then the list. The cards never say "sample": the staging strip at the top of the page says so, and the production build refuses sample files.
- **No sign in the data.** An amount is written as a plain number; the card adds the sign from `direction`.

#### The lines

The reference photo draws a thin line that leaves a card, turns in a quarter circle, runs straight, and ends in a dot and an arrowhead. The Foundation asked for that line **between the students picture, the connector and the donors picture, and not on the figure cards**. It is drawn in the page itself, in HTML and CSS, with no image file. (The weaving lines from the SVG the Foundation supplied in the second round are no longer on the page.) It has four parts:

- **Two side lines** (`.home-page::before` and `::after`) run the whole height of the home page, 2 rem outside the text on each side (`--rail-out`). They are solid, 1.4 px, in `deco`. They carry on past the hero down the page and into the footer, so the eye has a track to follow while scrolling; the dark band and the footer are opaque and simply cover them. Below 64 rem they sit half a rem in from the edge.
- **Two branches** (`.branch`). From each side line a quarter circle turns in and the line runs straight on, under the picture. The shape is one small inline SVG (`BRANCH` in `src/pages.mjs`), mirrored in the stylesheet for the other side. The picture is opaque, so the end of the branch is hidden under it, and the line seems to go into the picture.
- **Two dashed stretches** (`.link`), from the inner edge of each picture to the connector, in `decoSoft`. Each has a dot at one end and an arrowhead at the other, so the line reads **donors, then the connector, then students**: on the donors side the dot is amber (the colour of giving) and the arrowhead points to the connector; on the students side the dot is blue and the arrowhead points to the students.
- **The connector** (`.flow`), a small dashed panel holding a tile with the logo mark and a short rule on each side, on the line between the two stretches.

How they line up. The connector is `--track × 2` tall and sits at the bottom of the hero, so its middle is `--track` (2.5 rem) above the bottom; the branches and the stretches are placed the same distance above the bottom. All of them use `--track`, so changing it moves the whole line up or down together. Each stretch starts at the inner edge of its picture by calculation (`--edge-s` and `--edge-d`, from the column width, the picture's width and the inset), so a picture can be resized and its line stays attached. `npm run check:render` measures this at twelve widths from 320 to 1920 px, in light and dark: every stretch runs from its picture to the connector and is level with both; the branches meet the pictures and the side lines; every line is behind the cards and ignores the pointer; and **no line touches a figure card**.

- **Colour** comes from `deco` and `decoSoft` in `content/site.json` (see Tokens), light and dark.
- **Not shown** in high-contrast mode (the system's colours are for content) or in print. **Mirrored** for right-to-left languages (the branches and the arrowheads turn round). Hidden from screen readers and made of no text. They ignore the pointer.
- **Hidden below 64 rem.** Only the two side lines remain, half a rem in from each edge.
- **On the home page only.** The request was for the landing page. Another page would need its own arrangement, because the branches and stretches are placed for these three cards.

#### Adjusting the size and quietness of the top of the home page

All of these are in `src/styles.css`, in the hero block, at 64 rem and wider unless it says otherwise.

| To change | Edit | Notes |
| --- | --- | --- |
| The size of the two figure cards | `.stat { width: 14.5rem }` in the 64 rem block | Keep it equal to `--pic-s`, the students picture's width, or the corner cards stop matching (a test fails if they differ). |
| The size of the pictures | `--pic-s` (students, 14.5 rem) and `--pic-d` (donors, 15 rem; 16.25 rem from 80 rem), on `.hero-grid` | The donors picture scales everything inside it from `--pic-d`. A picture plus `--inset` must fit inside `--side`, or widen `--side` too. |
| The width of each corner column | `--side` (16 rem; 19 rem from 80 rem) | |
| How far the lower cards are set in from the edge | `--inset` (.75 rem; 2 rem from 80 rem) | The reference photo sets its lower cards in a little. |
| The connector's width | `--panel` (11 rem) | Its height is `--track × 2`. |
| How high the line runs above the pictures' lower edge | `--track` (2.5 rem) | The connector, the branches and the stretches all follow it. |
| The size of the headline | `.hero h1 { font-size }` in the 64 rem block (`clamp(2.75rem, 4.4vw, 4rem)`) | A check fails if the headline overlaps a card at any of twelve widths. |
| How quiet the figure cards are | In `.stat`: `font-size` (.75 rem), `.stat .big` (bold, 1.25 rem), `border` (the pale `--line`) | The text is in the secondary ink on purpose: anything paler fails the contrast check. Tried: mixing that ink 60/40 with the page colour gives 2.65 : 1 in light mode and 4.24 : 1 in dark, and 4.5 : 1 is needed. To make a card quieter, make it smaller, give it fewer lines (below) or lighten its edge, not its text. |
| How many lines a card shows | `CARD_LINES` in `src/pages.mjs` (4) | With more programs than this, the smallest are added into one "Other programs" line. |
| The colour of the lines | `deco` and `decoSoft` in `content/site.json` | Light and dark. The build refuses a `deco` that is too pale to see. |

After any of these, run `npm run build`, `npm run check` and `npm run check:render`. The hero checks fail if cards overlap, a card grows bigger than the pictures, or a line stops meeting its picture.

**Article pages** (a program, a news item, a report) keep the Phase 2 structure: one reading column with a **margin column** to its left on wide screens that holds the facts, such as amount, deadline and eligibility. On a phone the margin folds above the text.

### Principles

1. **One bold thing: the ruler.** A strip of 100 ticks, one per unit of every 100 given, in a rounded navy panel. Students' ticks are tall and yellow; running costs and fundraising are shorter and in quieter blues. Height and labels carry the meaning as well as colour. A table with exact amounts sits under it.
2. **Everything else is quiet.** No photos are required, no counters, no carousels. Soft cards and spacing do the separating.
3. **The marker means something.** If it is yellow, a student or a donor should read it. The warm amber of the donor tiles is a separate accent for giving and is never used for deadlines.
4. **Say what happens.** Buttons say "Apply for the Undergraduate Award", not "Learn more". Deadlines always name their time zone.
5. **No motion** except what a person triggers (opening the menu, expanding an answer). Reduced motion is respected.
6. **Light and dark themes**, each checked for contrast.
7. **High-contrast mode keeps its shapes.** Windows high-contrast (forced colours) removes background colours, so every card keeps a border, and the bars, legend swatches, the connector's rules and the lines inside the donors picture use the system's colours. The lines between the cards (the two side lines, the branches and the dashed stretches) are decoration and are left out in this mode. `npm run check:render` fails if any of these disappears or comes back.
8. **Right-to-left ready.** Spacing, alignment and positions use logical properties (start and end, not left and right), so Pashto and Dari can be added without restyling. Not built yet: the language switch, translated text and right-to-left font files. The pictures hold no words, so nothing in them needs translating; the lines are mirrored (the branches turn the other way and the arrowheads point the other way).
9. **Background is background.** The hero's two pictures, its two figure cards and the lines are one quiet layer: the page's own colour with a little blue (or amber, for donors) mixed in, a pale edge, no shadows, no words in the pictures. They are opaque so the lines pass behind them, and they cost nothing for someone who cannot see them (the pictures and the lines are hidden from screen readers; the cards are an ordinary heading and list).

## Review against the brief

Two reviews, one for each version of the design.

**First version.** I listed what a stranger would get by default: navy and gold, a serif headline with one word picked out, a graduation photo, three icon cards, a row of counting statistics. I replaced navy and gold with ink and a highlighter (yellow means "read this"), replaced the statistics row with the ruler, and chose a school-reader serif over Inter.

**This version.** The Foundation's mockup is, on its face, the common look for a modern web product: pale page, white rounded cards, blue pill buttons, soft shadows. That is their direction, so the design follows it rather than competing with it. What keeps it specific to this site:

- **The marker and the ruler stay.** The yellow chip and the 100-tick strip are the two things no other site of this kind has, and both answer a real question ("when is the deadline?", "what share reaches students?").
- **Cards only where a thing is a unit.** The first pass wrapped everything in the same card. Article text and the legal pages are not carded, and corner radii change with the size of the shape instead of being one value everywhere.
- **The pictures are texture, on purpose.** The Foundation asked for them to recede, so they have no words and almost no contrast, and the two figure cards, now the same size as the pictures, carry the real numbers in the same quiet style. The one loud thing in the hero is the large headline with its two buttons.
- **A borrowed arrangement, with limits.** Four cards around a large centred headline is a common landing-page layout. The Foundation asked for exactly that arrangement, and for the headline's placement and size, from a reference photo, and nothing else was copied from it (not its colours, type, wording, card contents or imagery). What keeps the top of this page specific to the Foundation is what is in the cards: figures read from its own records, and a picture of students, the Foundation and donors with no words.
- **Dropped:** all-caps labels above headings, arrows on links, middle-dot meta strings, accenting one word of a headline, entrance animations, gradient washes as decoration (the one gradient is the logo).

Where it still sits close to a default: blue on a pale page with white cards. It stays because it is the Foundation's own direction.

## Replacing the brand

The palette is in `content/site.json`, the mark is `content/brand/mark.svg`, and both can be replaced without touching code. The build refuses a palette that fails contrast. After replacing the mark, run `npm run brand-images` (it needs `rsvg-convert`) to redraw the home-screen icon and the share image, or replace those two PNGs with real brand art. A replaced font file needs a new file name, because fonts are cached for a year.
