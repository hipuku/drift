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

## Checks

| Check      | Workflow | Runs                                                                                                                                                                    | Required |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Lint       | `ci.yml` | `npm run lint` (ESLint: import layers, JSX accessibility, type-checked promises), `lint:css` (Stylelint), `lint:prose`, `lint:api` (the contract), `lint:md` and `knip` | Yes      |
| Links      | `ci.yml` | lychee, offline: every relative link and heading anchor in the Markdown resolves                                                                                        | Yes      |
| Format     | `ci.yml` | `npm run format:check`                                                                                                                                                  | Yes      |
| Typecheck  | `ci.yml` | `npm run typecheck` for the service and for the client                                                                                                                  | Yes      |
| Test       | `ci.yml` | `npm test` for the service and for the client                                                                                                                           | Yes      |
| Build      | `ci.yml` | `npm run build` for the service and for the client, after Lint, Format, Typecheck and Test pass                                                                         | Yes      |
| End to end | `ci.yml` | `npm run e2e` in `client/`, against the demo build, after Build passes                                                                                                  | Yes      |

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

Drift's design file is [drift on Figma](https://www.figma.com/design/cG4D315cHRDKDwMQovDu7R/drift).
It does not have its pages yet, and there is no parity check: nothing compares Figma with the code
on a pull request. Until there is, a visual change says in its pull request whether Figma was
updated, or carries the `figma-later` label.

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
