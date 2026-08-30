`GET /crawl/:jobId/typography` and `GET /crawl/:jobId/colours` have no consumer.

- `client/src/lib/api.ts` defines `getTypography` and `getColours`; both have **zero call sites** outside that file.
- drift-tests has no scenario covering either.
- `api.test.ts` covers them, but only the error path — so they are endpoints kept alive by their own tests.

They read as leftovers from the build-in-isolation phase documented in DESIGN.md ("infrastructure built in isolation, one new piece at a time"), which was the right way to build and left these behind.

### Decide one way

**Remove them** — the endpoints, the two client wrappers, and their tests. `/crawl/:jobId/audit` returns everything they return. This is the option I would take: two fewer surfaces to keep in the OpenAPI spec, to version, and to secure.

**Or keep them and say why** — if the intent is a public API where a consumer wants one category without the whole audit, that is a legitimate design, but it should be stated in DESIGN.md and covered by drift-tests, and the client wrappers should either be used or deleted.

What should not persist is the current state: a published API surface with no consumer and no acceptance coverage, which nothing would notice breaking.
