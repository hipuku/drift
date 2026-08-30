drift's README says of the export: *"Built for machines: assert on it in CI, diff two runs, or hand it to a model."*

It cannot be fetched by a machine. The `$schema` payload — `health`, `findings[]`, `verdicts`, `rules` — is assembled in `client/src/screens/Audit/Audit.tsx`, and `healthLine`, the verdicts and the rules block exist only in the client. The service exposes `/discover`, `/crawl`, and `/crawl/:id/{result,audit,typography,colours}`. A CI consumer gets the raw `SiteAudit` and would have to reimplement the diagnosis to assert on it.

So the artefact advertised for CI is only produceable by a person clicking Export in a browser.

### Why it matters beyond the claim

- **drift-tests cannot acceptance-test it.** Its README records this as "intentionally not here", which reads as a scoping decision when it is really a gap in the service. The most valuable output — the judgement, not the inventory — has no black-box coverage at all.
- **The diagnosis is the product.** The inventory is a means to it. Everything downstream that would consume drift programmatically wants `findings[]`, not twelve arrays of tokens.

### Proposal

Move the diagnosis assembly from the client into the service and expose it:

```
GET /crawl/:jobId/export   →  the audit-v1 payload
```

`auditModel.ts`'s pure functions — `healthLine`, `redundancyVerdict`, the verdict list, the rules block — are already framework-free and unit-tested (54 tests). Moving them to `src/analysis/` and having the client fetch rather than assemble is mostly relocation, not rewriting.

Watch for: the client's `auditModel.ts` currently mirrors service constants by hand (`lib/contract.test.ts` guards the drift). Moving the diagnosis into the service removes one whole class of that mirroring rather than adding to it.

### Alternative

Soften the README to say the export is a browser action. Honest, cheaper, and gives up the thing that makes drift interesting to a CI pipeline.

### Provenance

The claim was carried over unexamined when the README was rewritten on 2026-08-30. Old, not new — but reprinted without checking.
