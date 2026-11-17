# Drift: workflow

How changes get into Drift: branches, pull requests, the checks that gate them, review, keeping
Figma and code in step, and releases.

## Contents

- [Branches and pull requests](#branches-and-pull-requests)
- [Checks](#checks)
- [Review](#review)
- [Dependencies](#dependencies)
- [Design sync](#design-sync)
- [Deployment](#deployment)
- [Releases](#releases)

---

## Branches and pull requests

Nothing is committed to `main` directly. Every change goes through a branch named
`<type>/<short-name>` (`feat`, `fix`, `design`, `a11y`, `docs`, `refactor`, `chore`, `deps`) and a
pull request that uses the template, carries one type label, and is squash merged. The pull request
title becomes the commit on `main`, and labels group the release notes.

The `main` ruleset requires a pull request, the checks below, branches up to date with `main`,
resolved conversations and a linear history, and it applies to the owner too.

A change to the API changes `openapi.yaml` and `client/src/lib/api.ts` together. drift-tests
generates its types from `openapi.yaml` and fails when they fall behind, so a contract change is
followed by a drift-tests pull request that regenerates them.

Every pull request also runs drift-tests' scenarios against its own server (the `Acceptance`
check). A change that alters behaviour a scenario asserts carries the scenario change in a
drift-tests branch with the same name as the drift branch; the check picks that branch up, and
the drift-tests pull request merges right after the drift one.

## Checks

| Check        | Workflow           | Runs                                                                                                                                                                    | Required |
| ------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Lint         | `ci.yml`           | `npm run lint` (ESLint: import layers, JSX accessibility, type-checked promises), `lint:css` (Stylelint), `lint:prose`, `lint:api` (the contract), `lint:md` and `knip` | Yes      |
| Links        | `ci.yml`           | lychee, offline: every relative link and heading anchor in the Markdown resolves                                                                                        | Yes      |
| Format       | `ci.yml`           | `npm run format:check`                                                                                                                                                  | Yes      |
| Typecheck    | `ci.yml`           | `npm run typecheck` for the service and for the client                                                                                                                  | Yes      |
| Test         | `ci.yml`           | `npm test` for the service and for the client                                                                                                                           | Yes      |
| Build        | `ci.yml`           | `npm run build` for the service and for the client, after Lint, Format, Typecheck and Test pass                                                                         | Yes      |
| End to end   | `ci.yml`           | `npm run e2e` in `client/`, against the demo build, after Build passes                                                                                                  | Yes      |
| Acceptance   | `ci.yml`           | [drift-tests](https://github.com/hipuku/drift-tests) against a running server, Redis and Chromium: its `main`, or its branch named as this one                          | Yes      |
| Figma parity | `figma-parity.yml` | `npm run figma:check`: tokens and components against the Figma file ([Design sync](#design-sync))                                                                       | Yes      |

CodeQL scans every pull request as well, and Cloudflare Pages builds a preview of it. Neither is a
required check. What each suite covers is in
[ARCHITECTURE.md § Testing and CI](./ARCHITECTURE.md#testing-and-ci).

## Review

CodeRabbit reviews every pull request that is not a draft. Its configuration, `.coderabbit.yaml`,
gives it this repo's rules by path:

- **Component stylesheets:** role tokens only, no raw colour, length, radius, shadow, duration or
  font value, and no primitive where a role exists.
- **Components and screens:** interactive elements have an accessible name and keyboard handling.
- **The service:** every new outbound request checks its protocol and the private-address rule in
  `src/net/publicUrl.ts`, a browser context is created guarded, callbacks go through
  `assertDeliverable`, and a crawl stays on the root's origin and under `MAX_CRAWL_PAGES`.
- **The contract:** a field the service sends or accepts is declared in `openapi.yaml` and
  `client/src/lib/api.ts` in the same change.
- **Markdown:** Australian English, topic-label headings, and claims the code supports.

It is not a required check. Each comment is applied in a commit or answered with a reason, then
resolved; the ruleset will not merge a pull request with an open conversation.

## Dependencies

Dependabot opens grouped pull requests every Monday, one manifest at a time: the service at the
root and the client in `client/`, plus GitHub Actions monthly. Each carries the `deps` label.
Grouping keeps the runtime (BullMQ, Playwright, Express, `ws`), the tests and the linters apart, so
one major update does not hold the others back. Major updates to TypeScript, and to `@types/node`
at the root, are deferred, with the reason in `.github/dependabot.yml`.

A major update that needs a code or config change is replaced by a pull request of its own that
makes both, as Stylelint 18 was. An advisory in a dependency that ships nothing is still cleared,
by an `overrides` entry if the fix is not yet released upstream, so a new finding stands out.

## Design sync

Drift's design file is [drift on Figma](https://www.figma.com/design/cG4D315cHRDKDwMQovDu7R/drift):
its variables, a page per component and the screens. The Figma parity check compares it with the
code on every pull request and every push to `main`, so a difference is found when it is made.
Variables are compared from an exported snapshot, `figma/snapshot/drift.json`, so a variable
changed in Figma is found once that snapshot is refreshed.

### What is compared

| Item                           | Code                                                                       | Figma                                            |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `token --drift-radius-control` | A `--drift-*` property, resolved by a headless Chromium to its final value | A variable, by its code syntax, aliases followed |
| `component Button`             | A folder in `client/src/components`                                        | A component set on its own page                  |
| `axis Button.variant`          | A prop typed as a union of strings, or an alias for one                    | A variant property of the set                    |
| `states Button`                | The `:hover`, `:active` and `:disabled` rules its module writes            | The `Hover`, `Pressed` and `Disabled` variants   |

Tokens are compared resolved because the accent ramp is computed in OKLCH from two numbers, which
Figma holds as resolved colours. Opacity is compared as a fraction (Figma holds percentages), and
axis names without case or spaces. Left out on purpose: elevation, focus and the page gradient
(effect styles and a fill in Figma, not variables), focus states (one ring for every element),
booleans and text properties, and the Screens page, whose components are parts of the screens.
Differences meant to be there are listed with a reason in `figma/exceptions.json`, and the check
warns when one is no longer needed.

### How a finding is decided

`figma/baseline.json` holds, for every item, the pair of values code and Figma had when the baseline
was last accepted. Each side is compared with its own half, which says which side moved:

| Code      | Figma     | Finding                   | Effect                                       |
| --------- | --------- | ------------------------- | -------------------------------------------- |
| Moved     | Not moved | Code ahead of Figma       | Fails the pull request                       |
| Not moved | Moved     | Changed in Figma          | A `drift-decision` issue                     |
| Lacks it  | Added it  | New in Figma              | A `design-proposal` issue                    |
| Moved     | Moved     | Conflict                  | Fails the pull request                       |
| Not moved | Not moved | Known drift               | Listed, never fails                          |
| Match     | Match     | Agreed since the baseline | `npm run figma:accept` moves the baseline on |

The `figma-later` label turns code ahead of Figma into a warning, for a change whose Figma update
follows in its own pull request. It never waives a conflict. The rules are in
`scripts/figma/diff.mjs` and tested in `scripts/figma/parity.test.mjs`.

### Where Figma is read from

Components are read live from Figma's REST API with the `FIGMA_TOKEN` repository secret. Variables
need an Enterprise plan for that, so they come from the snapshot, exported through Figma's Plugin
API: `npm run figma:check -- --plugin-code` prints the export to run in Figma, and
`npm run figma:check -- --save <file>` stores its result. Without the token (a fork, a Dependabot
pull request, or a local run) everything comes from the snapshot, and the report says so.

## Deployment

Cloudflare Pages builds the client and deploys it to [drift.hipuku.dev](https://drift.hipuku.dev)
from `main`, and a preview from every pull request. The public build is the demo: it replays a
captured audit and never runs the crawler, so there is no backend to deploy.

## Releases

A release is a tag on a commit on `main`. `package.json`, `openapi.yaml` and the tag carry the
same version, so a running build can be tied to a commit and a contract.

1. A `chore/release-X-Y-Z` pull request bumps the version in `package.json` and `openapi.yaml`.
   Its own pull request, so the tag points at a commit that passed every check.
2. Once it merges, tag the merge commit `vX.Y.Z` and push the tag.
3. Create a draft GitHub release from the tag with generated notes, which `.github/release.yml`
   groups by label. Edit them into a short paragraph on what the release is about, then the
   grouped list, and publish.

drift-tests records `git describe --tags` of the drift checkout it tested, so a green run names the
release or the commit it proved. It tests `main` unless started with a tag.
