# Content guide

For the people who write and update the site's text. You do not need to write code. You do need to be careful with a few punctuation marks, and the site will tell you in plain words when something is wrong.

> **Today** the text lives in files in the `content/` folder, and a build turns them into the website. A no-code editing screen (requirement PUB-7) is not built yet. Until it is, a developer or another person comfortable with files makes the edits using this guide. Nothing here will be wasted when the editor arrives: it will edit these same files.

## The shape of a content file

Every page, program, story and news post is one text file. It has two parts:

```
---
title: Undergraduate Award
summary: Help with tuition, books and living costs.
amountMax: 5000
deadlineAt: 2027-03-31 23:59
---
## What it covers

The text of the page, written in plain text with a few simple marks.
```

- The block between the two `---` lines is the **details**: one `name: value` per line.
- Everything below is the **text**.
- A list in the details looks like this, with two spaces before each dash:

  ```
  eligibility:
    - Enrolled in a first degree
    - Household income below the limit
  ```
- If a value starts with a symbol (a quote, a bracket, `#`, `@`) or contains a colon followed by a space, put it in double quotes: `title: "Open to all: apply now"`.
- Numbers are plain: `amountMax: 5000`, not `$5,000`.
- Yes or no values are `true` or `false`.

## Marks you can use in the text

| You write | You get |
| --- | --- |
| `## A heading` | A section heading. Sections on a page also become its contents list. |
| `### A smaller heading` | A subheading |
| a blank line between blocks | A new paragraph |
| `- one` on separate lines | A bulleted list |
| `1. one` on separate lines | A numbered list |
| `**bold**` | **bold** |
| `[our programs](/programs/)` | A link inside the site |
| `[the ministry](https://example.org)` | A link to another site |
| `[write to us](mailto:name@example.org)` | An email link |

Do not use a single `#` heading: the page title already is the main heading, and `npm run check` fails if a page has two. Do not type HTML; it is shown as text. Links that are not `/…`, `https://`, `http://`, `mailto:` or `tel:` are shown as plain text on purpose.

Pictures go in the details of a story or news post (`image` and `imageAlt`, below), not in the text.

## Placeholders and samples

The first version has sample text. Two markers show what the Foundation still has to supply:

- **`[[like this]]`** marks a gap. On the staging site it is shown with a hatched background so nobody mistakes it for real text. Replace the whole thing, brackets included.
- **`sample: true`** in a file's details means "this file is still an example". Delete that line once the text is the Foundation's own.
- **`stub: true`** marks a page that stands in for something built later (the application start page, the Donate page).

A **production build refuses** to build while any of these remain, or while `siteUrl` is empty. It lists every file to fix and writes nothing, so the live site is never overwritten with sample text.

## Site settings: `content/site.json`

| Setting | What it is |
| --- | --- |
| `name`, `shortName` | The Foundation's full and short name, in the header, footer and page titles |
| `tagline`, `description` | The line under the name, and the sentence search engines show |
| `locale` | Language and region for dates and numbers, for example `en-US` or `en-GB`. **Placeholder: confirm.** |
| `timezone` | The time zone every date you write is in, for example `Europe/Berlin`. Deadlines always show it. **Placeholder (UTC): confirm.** |
| `currency` | The currency code for amounts, for example `USD`, `EUR`. **Placeholder: confirm.** |
| `siteUrl` | The public address, starting `https://`. Required for a production build. The server uses it in confirmation emails. |
| `staffEmail` | The mailbox shown on the contact page. The server delivers contact and partner messages to the same address (an environment variable can override it; see [operations](operations.md)). |
| `postalAddress`, `legalLine` | The Foundation's legal name and registration number, and its address. Shown in the footer; the address is also on the contact page. The privacy and terms pages carry their own placeholders for the same details. |
| `nav` | The menu: a `label` and a `to` address for each item |
| `analytics` | Off. See "Analytics" in [decisions](decisions.md). |
| `brand` | The colors, for light and dark. The build refuses colors that are hard to read. |

## Programs: `content/programs/<name>.md`

| Detail | Needed | Meaning |
| --- | --- | --- |
| `title` | yes | Program name |
| `summary` | yes | One sentence for lists |
| `amountMax` | yes | The most a student can receive, as a number |
| `amountMin` | no | The least, if there is a range |
| `level` | no | For example `Undergraduate`, `Any level` |
| `opensAt` | no | When applications open. Date, or date and time. Before this the page says "Opening soon". |
| `deadlineAt` | yes, unless `rolling: true` | The last minute to apply. **Must include the time**: `2027-03-31 23:59`. |
| `rolling` | no | `true` for a program that is open all year |
| `order` | no | Smaller numbers come first in lists |
| `eligibility` | no | A list. Shown in the margin beside the page text under "Who can apply". |
| `icon` | no | The small picture beside this program on the home page's students card. One of `cap`, `hardhat`, `chip`, `flask`, `book`, `dollar`, `heart`, `donation`, `gift`, `building`, `users`, `globe`, `moneyIn`, `moneyOut`. Without one, a book. A name that is not on this list stops the build, and the message lists them. |

Dates and times are in the site's time zone (`timezone` in `site.json`) and are written `YYYY-MM-DD HH:mm`.

**How the deadline works.** A deadline of `23:59` stays open until 23:59:59 and closes at the next minute, so someone still typing at 23:59:30 is not turned away. After that, the Apply button on the program page is replaced by a notice that applications are closed, and the program moves to "Closed" on lists. The application form built in Phase 3 must use the same rule.

**Open and closed are decided when the site is built**, and again in the visitor's browser each time a program page loads. A page that nobody rebuilds will still show an old list on the home page. See "Rebuild schedule" in [operations](operations.md).

Suggested sections in the text: `## What it covers`, `## Who can apply`, `## How we choose`, `## What you need to apply`.

## Fixed pages: `content/pages/<name>.md`

The fifteen pages the site needs (`home`, `programs`, `apply`, `apply-faq`, `apply-start`, `impact`, `finances`, `news`, `about`, `partner`, `contact`, `donate`, `privacy`, `terms`, `accessibility`) must exist. Each needs `title` and `description` (a sentence for search results). Optional details:

| Detail | Used by |
| --- | --- |
| `lede` | The larger introduction line under the title |
| `headline` | Home page only: the headline. It is shown after the short name on its own line, so with the name "Khwarizmi" and the headline "Scholarship & Financial Aid" the page reads "Khwarizmi / Scholarship & Financial Aid". The one-sentence text under it is the body of `home.md`. (The figure line that used to sit under the buttons is gone; the two figure cards on the home page take their numbers from the yearly figures and the newest report, see below.) |
| `steps` | How to apply: the numbered steps (a list) |
| `reply` | Contact page: how fast the Foundation replies |
| `updated` | Privacy, terms: the "last updated" date, `YYYY-MM-DD` |
| `noindex: true` | Ask search engines to skip this page |

`apply-faq.md`: each `## Question` heading starts a question and the text below it is the answer. Questions open and close on the page.

## Stories: `content/stories/<name>.md`

A story appears on the site **only when consent is recorded**:

```
consent: true
consentRecorded: 2026-06-12
```

Without both lines the file stays off the site and the build prints a warning naming it. Never set these until the student (or a parent or guardian, if the student is under 18) has given consent in writing and it is on file.

Other details: `title`, `student` (the name as the student agreed to be shown), `program` (the name of a program file, for example `undergraduate-award`), `year`, `quote`, `image` (a file in `content/images/`), `imageAlt` (**required** with an image: one sentence describing the picture for people who cannot see it).

## News: `content/news/YYYY-MM-DD-name.md`

Details: `title`, `date` (`YYYY-MM-DD`), `summary` (one sentence for lists), optional `image` and `imageAlt`. The page address is the name without the date. A post dated in the future waits and appears once that day arrives and the site is rebuilt.

## Yearly figures: `content/data/impact-YYYY.md`

`year`, `students` (how many were funded), `awarded` (total amount) and `applications` (how many were received). All four are required numbers. Text below the details is a short note shown under that year.

Optional: **`byProgram`**, how many of those students each program funded, one program per line. It feeds the **students card** on the home page: the total on top ("142 students funded in 2025"), the programs below it.

```
byProgram:
  - { program: undergraduate-award, students: 63 }
  - { program: emergency-fund, students: 20 }
```

- `program` is the name of a file in `content/programs/`, each program once. Its title and its `icon` are used on the card.
- `students` is a whole number. The numbers **must add up to `students`**. If they do not, the build stops and says what they add up to.
- Write each line as `{ key: value, key: value }`; put quotes around any text that contains a comma.
- The card always shows the **newest year's file**. It has four lines. With more than four programs the three biggest are shown and the rest are added into one "Other programs" line, so the lines still add up to the total.
- Leave `byProgram` out and the card is left out; nothing else changes.

## Money and annual reports: `content/reports/YYYY.md`

| Detail | Meaning |
| --- | --- |
| `year`, `title` | For example `2025`, `Annual report 2025` |
| `file` | The PDF in `content/files/`. The build fails if it is missing. |
| `students`, `operations`, `fundraising` | Whole numbers that **add up to 100**: of every 100 received, how many went to students, to running the Foundation, and to raising money. Define each in the "How we count" text on the Finances page. |
| `spent` | Total spent that year, as a number |
| `income` | Total donations received that year, as a number. It is the heading of the **donations card** on the home page ("$702,000 total donations in 2025"). Required whenever `transactions` is listed. |
| `transactions` | Optional. Individual money in and out, one per line (see below). |
| `audited` | `true` if the accounts were audited |

The newest report drives the "Of every 100 you give" ruler on the home and finances pages, and the **donations card** on the home page.

```
transactions:
  - { date: 2025-12-18, direction: in, label: Year-end appeal, amount: 24300 }
  - { date: 2025-12-15, direction: out, label: Undergraduate Award, amount: 61000 }
```

- `date` is `YYYY-MM-DD`. `direction` is `in` (a donation received) or `out` (money paid to students or programs). `label` is a few words on what it was; quote it if it has a comma. `amount` is a number above zero, **without a sign**: the card adds the + or − from `direction`.
- The card shows the **four newest**, newest first, whatever order you write them in. Each line shows an arrow, the label, the date, and the amount with + or −; a screen reader is told "Received" or "Paid out".
- If the newest report has no `transactions`, the card is left out. It never falls back to an older year's list, so it cannot quietly show old figures as current.
- While `sample: true` is in `content/data/impact-YYYY.md` or `content/reports/YYYY.md`, a production build refuses, like any sample file. The cards themselves never say "sample"; the staging strip at the top of the page does.

## Changing the site today

1. Edit the files in `content/`.
2. `npm run build` and read what it prints. Fix anything it lists.
3. `npm run check` to confirm accessibility, links and forms are still sound.
4. Look at it with `npm start`.
5. For the live site: `npm run build:production`. If it refuses, it lists what to fix and the live site is not touched. Deploy only when it succeeds (see [operations](operations.md)).

## What stops a build, and what only warns

| Stops every build | Only warns | Stops a production build |
| --- | --- | --- |
| A missing required detail | A story without recorded consent (left out) | `sample: true`, `stub: true` |
| A date in the wrong shape; a deadline without a time | A news post dated in the future (waits) | Any `[[placeholder]]` left |
| Money split not adding to 100; students by program not adding up to the total; a transaction with no date, direction, label or amount | A report with no PDF attached | An empty or non-https `siteUrl` |
| A report PDF or image that is not in its folder | | |
| An image with no `imageAlt` | | |
| Colors that fail the contrast rules | | |
