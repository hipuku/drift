# drift

A design-system auditor for live websites. Point it at a URL you don't control, and Drift
crawls the site and reports the design system that was *actually shipped* — every colour,
typeface, size, radius, shadow, border and spacing value in use, deduplicated, perceptually
grouped, and mapped to the pages where it appears. Built with Node, Playwright and React.

Live at [drift.hipuku.dev](https://drift.hipuku.dev).

![Drift](screenshots/overview.png)

## Features

- **The inventory.** The real token set, ranked by usage, deduplicated perceptually
  (CIEDE2000) and attributed to the pages it appears on. Colour, type, spacing, radius,
  shadow, border, z-index, opacity, blur, gradients, motion and breakpoints — plus the
  *authored* units read from the stylesheets, which `getComputedStyle` throws away.
- **The diagnosis.** Where the system has drifted, in one sentence: *7 of 29 colours are
  near-duplicates, 6 of 9 type sizes fall off the scale, and 14 of 21 spacing values miss the
  4px grid. Radius, shadows and contrast hold steady.*
- **A stated reference for every claim.** A named modular ratio for type, a 4px or 8px grid
  for spacing, CIEDE2000 for colour, WCAG 2.1 for contrast — and the reference is selectable,
  so you can ask "how far are we from a major third?" rather than only being told which scale
  you happen to sit on.
- **Contrast as measured, not as authored.** Every text/background pair is evaluated against
  the colour a reader actually sees — the resolved ancestor background, with alpha composited
  — so translucent text on a tinted panel is judged as it renders.
- **The export.** The whole audit as JSON, leading with the diagnosis (`health`, `findings[]`
  with severity and evidence, `verdicts`, `rules`) and carrying the full inventory underneath.
  Built for machines: assert on it in CI, diff two runs, or hand it to a model.
- **An API, not a UI helper.** Every screen is built on the same endpoints a CI job would use.

Nothing is invented and nothing is inferred by a model: the crawl, the aggregation and the
verdicts are all computed. No API key, no per-run cost, and no model in the loop.

## Install

Drift runs locally against any site. Redis must be reachable (defaults to
`redis://127.0.0.1:6379`; override with `REDIS_URL`), and Chromium comes from Playwright.

```bash
npm install
npx playwright install chromium
```

## Develop

Node 20.19+ or 22.12+, as the `engines` field says; `.nvmrc` pins 22. Two processes: the
backend owns the API, the WebSocket server and the crawl worker; the client proxies `/api`
and `/ws` to it.

```bash
npm run dev:server            # backend on :3001
npm --prefix client run dev   # client on :5173
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev:server` | Backend: API, WebSocket progress, crawl worker |
| `npm run crawl` | Crawl a URL to JSON, no queue and no server |
| `npm run capture` | Recapture the bundled demo audit, and print the figures the docs quote |
| `npm run discover` | Resolve a URL and list its candidate pages |
| `npm test` | Vitest over the service |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm run build` | `tsc` to `dist/` |

The client carries its own `dev`, `build`, `preview`, `test`, `test:watch` and
`typecheck` under `client/`. Linting runs once from the root across both halves.

## The deployed demo

Drift's engine is a Playwright crawler behind a Redis-backed queue — not something to leave
running on a public URL, and not free to host. So the deployed build ships a **real audit
captured from a real crawl** and replays it.

Everything downstream of the crawl is the genuine output, because it *is* the genuine output:
the inventory, the verdicts and the export all come from that capture. Only the network
round-trip is stubbed, and the UI says so rather than pretending to crawl on demand. Run it
locally to audit any site.

```bash
npm run capture                                    # recapture from picocss.com
VITE_DEMO_MODE=true npm --prefix client run build  # build the replaying bundle
```

## More

- [`DESIGN.md`](./DESIGN.md) covers the architecture, the service contract and its endpoints,
  the design system, and the decisions behind the build.
- [`openapi.yaml`](./openapi.yaml) is the full API contract, including the webhook callbacks
  (OpenAPI 3.1). Open it in any OpenAPI viewer.
- [drift-tests](https://github.com/hipuku/drift-tests) is the black-box acceptance suite that
  drives these endpoints over HTTP.

## Stack

Node · Express · Playwright · BullMQ on Redis · WebSockets · React · TypeScript · Vite ·
CSS Modules · `haus-colour-utils`
