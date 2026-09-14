# drift

Drift crawls a website and reports the design values it ships: every colour, typeface, size,
radius, shadow, border and spacing value in use, grouped perceptually, ranked by usage and
attributed to the pages it appears on. Node, Express, Playwright, BullMQ on Redis, React and
TypeScript.

Live at [drift.hipuku.dev](https://drift.hipuku.dev), replaying a captured audit of picocss.com.

![Drift](screenshots/dashboard.png)

## Features

- **Inventory.** Colour, type, spacing, radius, shadow, border, z-index, opacity, blur,
  gradients, motion and breakpoints, ranked by usage. Colours are grouped by CIEDE2000
  distance. The units authored in the stylesheets are read from the CSSOM, because
  `getComputedStyle` returns resolved pixels.
- **Health line.** One sentence per audit. For the demo capture: *7 of 29 colours are
  near-duplicates, 6 of 9 type sizes fall off the scale, and 14 of 21 spacing values miss the
  4px grid. Radius, shadows, and contrast hold steady.*
- **Stated references.** Type is measured against a named modular ratio, spacing against a 4px
  or 8px grid, colour against CIEDE2000 ΔE and contrast against WCAG 2.1. The ratio and the grid
  can be changed on their tabs. The Overview stays on the automatic fit.
- **Composited contrast.** Each text colour is composited over the nearest ancestor background
  before the WCAG ratio is taken, so text with alpha is measured as it renders.
- **JSON export.** `health`, `findings[]` with severity and evidence, `verdicts`, the `rules`
  each count was measured against, then the full inventory. The client builds it. No endpoint
  serves it: [issue #3](../../issues/3) was closed under the decision to keep the public
  deployment a replay.
- **HTTP API.** The client uses the same endpoints a CI job would. The contract is
  [`openapi.yaml`](./openapi.yaml).

Every figure is computed from the crawl. Drift calls no model API and needs no key.

## Install

Redis must be reachable, at `redis://127.0.0.1:6379` unless `REDIS_URL` says otherwise.
Chromium comes from Playwright.

```bash
npm install
npx playwright install chromium
```

## Develop

Node 22.12 or later (`engines`); `.nvmrc` pins 22. The backend process owns the API, the
WebSocket server and the crawl worker. The client dev server proxies `/api` and `/ws` to it.

```bash
npm run dev:server
```

```bash
npm --prefix client run dev
```

The backend listens on :3001 and the client on :5173.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev:server` | Backend: API, WebSocket progress, crawl worker |
| `npm run crawl` | Crawl a URL to JSON, without the queue or the server |
| `npm run capture` | Recapture the bundled demo audit and print the figures the docs quote |
| `npm run discover` | Resolve a URL and list its candidate pages |
| `npm test` | Vitest over the service |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint and react-hooks) over the service and the client |
| `npm run lint:css` | Stylelint, including the hardcoded-value gate |
| `npm run lint:prose` | Fails on a new em dash in any tracked file |
| `npm run build` | `tsc` to `dist/` |

`client/` has its own `dev`, `build`, `build:demo`, `preview`, `test`, `typecheck`, `e2e` and
`screenshots`.

## The deployed demo

The public build does not run the crawler. It ships an audit captured from a real crawl of
picocss.com and replays it, and the configure screen says so. The inventory, verdicts and export
are computed from that capture. To audit another site, run Drift locally.

```bash
npm run capture
```

```bash
npm --prefix client run build:demo
```

## More

- [`FEATURE.md`](./FEATURE.md): screenshots of each report tab.
- [`DESIGN.md`](./DESIGN.md): architecture, the service contract, the token layer, decisions
  and known gaps.
- [`openapi.yaml`](./openapi.yaml): the API contract, including the webhook callbacks
  (OpenAPI 3.1).
- [drift-tests](https://github.com/hipuku/drift-tests): acceptance tests that drive these
  endpoints over HTTP.

## Stack

Node · Express · Playwright · BullMQ on Redis · WebSockets · React · TypeScript · Vite ·
CSS Modules · `haus-colour-utils` · `haus-style-probe`
