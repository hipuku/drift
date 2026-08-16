# drift

A design-system auditor for live websites. Point it at a URL you don't control,
and Drift crawls the site and reports the design system that was *actually
shipped* — every colour, typeface, size, radius, shadow, border, and spacing
value in use, deduplicated, perceptually grouped, and mapped to the pages where
it appears.

Live at [drift.hipuku.dev](https://drift.hipuku.dev).

Nothing is invented and nothing is inferred by a model: the crawl, the
aggregation, and the verdicts are all computed. No API key, no per-run cost, and
no model in the loop.

## What it reports

**The inventory** — the real token set, ranked by usage, deduplicated
perceptually (CIEDE2000), and attributed to the pages it appears on. Colour,
type, spacing, radius, shadow, border, z-index, opacity, blur, gradients,
motion, and breakpoints, plus the *authored* units read from the stylesheets
(which `getComputedStyle` throws away).

**The diagnosis** — where the system has drifted, in plain terms:

> 3 of 7 text/background pairs fail WCAG AA, 1 of 6 colours are near-duplicates,
> 6 of 10 type sizes fall off the scale, and 9 of 17 spacing values miss the 4px
> grid. Radius holds steady.

Every claim is measured against a stated reference — a named modular ratio for
type, a 4px or 8px grid for spacing, CIEDE2000 for colour, WCAG 2.1 for
contrast — and the reference is selectable, so you can ask "how far are we from
a major third?" rather than only being told which scale you happen to sit on.

**The export** — the whole audit as JSON, leading with the diagnosis
(`health`, `findings[]` with severity and evidence, `verdicts`, `rules`) and
carrying the full inventory underneath. Built for machines: assert on it in CI,
diff two runs, or hand it to a model and ask what to fix first.

## How it works

```
discover (sitemap / links)    resolve the host, list candidate pages
  → crawl (Playwright)        same-origin, picked pages or capped BFS
  → extract                   computed styles per element, in-page
  → normalise                 raw CSS strings → typed values, Node-side, pure
  → aggregate                 fold pages into token tallies (counts, roles, pages)
  → audit                     inventory + contrast + authored units + verdicts
```

Crawls run as **BullMQ jobs on Redis** with **WebSocket** progress, because a
multi-page Playwright crawl is far too long for a request/response cycle.

## API

The backend is a standalone service. Every screen in the client is built on
these endpoints, and they are equally usable from CI or a script.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/discover` | Resolve a URL and list candidate pages (sitemap, else links). |
| `POST` | `/crawl` | Enqueue a crawl. Returns `202 { jobId }`. |
| `GET` | `/crawl/:jobId/result` | Job status and the raw crawl result. |
| `GET` | `/crawl/:jobId/audit` | The audit for a completed crawl. |
| `GET` | `/crawl/:jobId/typography` | Typography inventory only. |
| `GET` | `/crawl/:jobId/colours` | Colour clusters only. |
| `WS` | `/` | Live crawl progress for a job. |

A crawl runs for minutes, so a caller that isn't a browser has two options: poll
`/crawl/:jobId/result`, or pass a `callbackUrl` and be told when it's done.

### Discover

```http
POST /discover
{ "url": "stripe.com" }
```

```json
{
  "rootUrl": "https://stripe.com/",
  "host": "stripe.com",
  "via": "sitemap",
  "pages": [{ "path": "/", "url": "https://stripe.com/" }]
}
```

`rootUrl` is the *resolved* origin — follow it rather than the string you sent,
since a host may only serve `www`. Invalid or unreachable URLs return `422` with
a human-readable `error`.

### Crawl

```http
POST /crawl
{
  "url": "https://stripe.com/",
  "pages": ["https://stripe.com/", "https://stripe.com/pricing"],
  "maxPages": 2
}
```

Page URLs must be **absolute and same-origin**; relative paths are ignored and
the crawler falls back to a breadth-first walk from the root. Omit `pages`
entirely for that BFS. The page ceiling is enforced server-side.

Returns `202 { "jobId": "24" }`. An unusable URL is rejected at the edge with
`422` rather than queueing a job that can only fail.

### Polling a job

```http
GET /crawl/:jobId/result
→ { "status": "completed", "result": { "rootUrl": "…", "pages": [ … ] } }
```

`status` is BullMQ's: `queued` · `active` · `completed` · `failed`. A crawl that
reached **zero** pages is a **failure**, not an empty success, and carries the
reason:

```json
{ "status": "failed", "error": "Couldn't read any pages — the site may be slow to load, blocking automated visits, or the selected pages may no longer exist." }
```

`GET /crawl/:jobId/audit` returns `409` until the crawl has finished.

### Webhooks

Pass a `callbackUrl` and Drift POSTs the finished audit to it — no polling.

```http
POST /crawl
{ "url": "https://stripe.com/", "callbackUrl": "https://ci.example.com/drift" }
```

```json
{
  "event": "crawl.completed",
  "jobId": "24",
  "site": "https://stripe.com/",
  "audit": { "summary": { "pages": 6, "contrastFailingAA": 40, "…": "…" }, "colourFamilies": [ … ], "contrast": [ … ] }
}
```

A crawl that fails delivers `crawl.failed` with an `error` instead, so the
receiver always hears back either way. Headers carry `x-drift-event`, and
`x-drift-signature` (`sha256=…`, HMAC of the raw body) when
`DRIFT_WEBHOOK_SECRET` is set — verify it before trusting the payload.

The URL is validated when you enqueue the crawl, not at delivery time, so a
mistake is a `422` while you're still on the line. It must be public http(s):
loopback, private ranges, and link-local addresses are refused, and the host is
resolved before the check, since a public name can still point somewhere
private. Delivery is retried on a network error or a `5xx` and given up on after
a `4xx`; it is best-effort, and never fails a crawl that succeeded — the audit
is on the API regardless.

The audit's `summary` counts (e.g. `contrastFailingAA`) and per-pair `contrast`
verdicts close the CI loop: crawl on deploy, receive the audit, and fail the
build when a threshold is crossed. (The plain-language `health` / `findings`
diagnosis is assembled in the app when you open or export a run, not in this
payload.)

### Live progress

Connect a WebSocket to the backend and you receive progress frames as pages land
— `pagesCrawled`, `maxPages`, `lastUrl`, `lastTitle`, `elementsTotal`. The
client uses the socket for liveness and the `result` endpoint as the
authoritative source of completion, so a dropped socket degrades to polling
rather than hanging.

## Running it

Redis must be reachable (defaults to `redis://127.0.0.1:6379`; override with
`REDIS_URL`). Chromium is installed via Playwright.

```bash
npm install
npx playwright install chromium
npm run dev:server          # backend on :3001
npm --prefix client run dev # client on :5173, proxies /api and /ws
```

```bash
npm test          # unit tests
npm run typecheck # tsc, no emit
```

## The deployed demo

Drift's engine is a Playwright crawler behind a Redis-backed queue — not
something to leave running on a public URL, and not free to host. So the
deployed build ships a **real audit captured from a real crawl** and replays it.

Everything downstream of the crawl is the genuine output, because it *is* the
genuine output: the inventory, the verdicts and the export all come from that
capture. Only the network round-trip is stubbed, and the UI says so rather than
pretending to crawl on demand. Run it locally to audit any site.

```bash
VITE_DEMO_MODE=true npm --prefix client run build
```

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node + Express (standalone, long-lived process) |
| Crawler | Playwright (headless Chromium) |
| Job queue | BullMQ on Redis |
| Real-time | WebSockets (live crawl progress) |
| Colour maths | `@haus/colour-utils` |

See [DESIGN.md](DESIGN.md) for the architecture, the audit model, and the
reasoning behind each engineering choice.
