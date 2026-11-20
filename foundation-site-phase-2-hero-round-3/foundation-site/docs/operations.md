# Operations guide

For whoever runs the site. Hosting, backups and uptime are **not set up yet** (NFR-7, NFR-9); this guide says what they need to cover.

## What runs

Two things:

1. **The built site** in `dist/`: plain HTML, one stylesheet, one small script, fonts, PDFs. Any web server can host it.
2. **`server/server.mjs`**: a small Node program that serves `dist/` and receives the three forms (contact, partner enquiry, newsletter). One process. No database yet: confirmed newsletter subscribers are kept in one JSON file. Phase 3 brings a database.

The forms **only work through this server**. If `dist/` is placed on a plain static host, the pages work and the forms fail. (The shareable preview is like that on purpose; it says so at the top.)

## Settings

Set by environment variables. Defaults are for a laptop.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to listen on. Leave it so only the proxy in front can reach it. |
| `DIST_DIR` | `dist` | The built site to serve |
| `DATA_DIR` | `data` | Where messages, subscribers and the signing key are kept. **Keep private.** |
| `SITE_URL` | `siteUrl` in `content/site.json` | The public address (`https://…`), used in confirmation emails |
| `STAFF_EMAIL` | `staffEmail` in `content/site.json` | Who receives contact and partner messages |
| `MAIL_FROM` | `no-reply@example.invalid` | The "from" address on confirmation emails. **Set it.** |
| `HTTPS` | off | `1` adds the strict-transport header. Set it once the site is served over HTTPS. |
| `TRUST_PROXY` | off | `1` when a reverse proxy sits in front. See below. |

A value still in `[[brackets]]` in `site.json` counts as not set. With no staff mailbox the server warns at start and addresses messages to `staff@example.invalid` so none is mistaken for delivered.

## Serving it on the internet

Put a reverse proxy (Caddy or nginx) in front for HTTPS, and let it send traffic to `127.0.0.1:8080`. Then:

- Set `HTTPS=1`.
- Set `TRUST_PROXY=1` **only** if the proxy overwrites the `X-Forwarded-For` and `X-Forwarded-Host` headers rather than passing along what a visitor sent. With it on, the server takes the visitor's address from the last `X-Forwarded-For` entry (for the rate limits) and the public host from `X-Forwarded-Host` (for the same-origin check on form posts). With it on and no proxy, anyone could fake both.
- Forms refuse a post whose origin differs from the site's own. If every form fails with "This form can only be sent from this site.", the proxy is not passing the host through.
- `/healthz` answers `ok` for an uptime monitor.

The server adds the security headers itself (strict content policy, no framing, no sniffing, referrer and permissions policies, HSTS when `HTTPS=1`). The build also writes the same rules into `dist/_headers` for static hosts that read that file (Netlify, Cloudflare Pages).

## Deploying a change

Do not edit `dist/` by hand. Build, check, then swap:

```
set -e
cd /srv/foundation
npm run build:production -- --out dist-next     # refuses, changes nothing, and stops here if content is not ready
npm run check -- --dist dist-next               # accessibility, links, forms, security, weight
rm -rf dist-old; mv dist dist-old; mv dist-next dist
```

The server reads files per request, so no restart is needed. **Deploy only when the build command succeeds** (exit code 0). A refused production build leaves any older `dist/` untouched, and an older staging `dist/` must never be taken for a finished one.

Restart the server (`npm start`) after changing code in `server/` or any environment variable.

## Rebuild schedule

Which programs are open or closed is decided **at build time**. A program page also re-checks the clock in the visitor's browser each time it loads (for visitors with JavaScript), so it is right to the second even from an old build. The home page and program lists show the state as of the last build. A page already open when a deadline passes does not change until it is reloaded, so the application form built in Phase 3 must check the deadline itself. So:

- Rebuild **every hour** (a cron job running the deploy steps above), or at least a minute after each deadline and each opening time.
- News with a future date, and stories whose consent was just recorded, also appear only on a rebuild.

## What is in `data/`

Created on first use. The folder is created readable by the server only (`0700`); private files are `0600`.

| Path | What it holds |
| --- | --- |
| `data/outbox/*.json` | One file per email to send: contact and partner messages for staff, newsletter confirmations. **Nothing sends them yet.** See below. |
| `data/held/*.json` | Messages caught by the hidden spam-trap field. **Never emailed.** A real person whose browser auto-filled the hidden field would land here, so look through this folder now and then. Capped at 100 an hour; no address or time of day is stored. |
| `data/newsletter.json` | Confirmed subscribers only: address and the time they confirmed (that is the consent record). |
| `data/secret.key` | Signs the confirm and unsubscribe links. Created on first use. **If it is replaced, links already emailed stop working,** including old unsubscribe links. Back it up with the rest. |

Nothing in `data/` may ever be served to the public or committed to a code repository. Anything with a name, address or message in it is personal data: see "Privacy" in the status document.

### Email is not connected

Forms write what they would send as JSON files in `data/outbox/`: `to`, `from`, `replyTo`, `subject`, `text`. To send real email, replace the `fileOutbox` in `server/mail.mjs` with a function that hands each message to your mail provider (SMTP or an API), and delete a file once it is sent. Everything else, including the confirmation flow, is already built and tested against the outbox. Until then, a visitor's message sits in a file and **nobody is told**. Do not announce the contact form until this is connected.

When it is connected, make the newsletter confirm and unsubscribe links two-step (a page with a button that posts), because email security scanners open links in messages and can confirm or unsubscribe on someone's behalf.

## Backups (NFR-9)

Not set up. Back up at least once a day, off the server:

- `data/` (the subscribers and the signing key)
- `content/` (all of the site's text, images and files)

`dist/` can be rebuilt from `content/` at any time and needs no backup. **A backup counts only after a restore has been tried:** restore to a spare machine, run `npm install`, build, start, and check the home page, one program page and a form.

## Limits that protect the forms

You do not need to set these; they are here so a failure makes sense.

- A form body larger than 32 KB gets a plain "too large" page.
- Each visitor address may send 5 per hour per form (2 if the browser did not report how long the form was open). All visitors together: 300 per hour per form. Beyond that, a "try again in an hour" page.
- A form sent less than 3 seconds after the page loaded is refused with a message asking the person to wait a moment and send it again.
- A message with more than two links is refused with a message asking the person to remove some.
- A form with the hidden field filled in is told it worked, but nothing is emailed; a copy goes to `data/held/`.
- Confirm links last 3 days. Unsubscribe links do not expire.

## If something goes wrong

| Sign | Likely cause |
| --- | --- |
| `Nothing to serve` at start | `npm run build` has not been run, or `DIST_DIR` is wrong |
| A production build says "N things to fix" | Sample content, placeholders or `siteUrl` still in place. The list names every file. Nothing was changed. |
| Every form fails with "This form can only be sent from this site." | The proxy is not passing the host (`TRUST_PROXY`), or the site is opened from a different address than the one the proxy serves |
| The home page still lists a program as open after its deadline | No rebuild since the deadline |
| People say they received no reply | Email is not connected, or the message is in `data/held/` |
| The old logo or colors show after a change | Rebuild and deploy. The addresses of the stylesheet, script, logo and share images change with their contents, so a rebuilt site is picked up. |
