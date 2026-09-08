# drift design tokens

The primitive, motion and semantic layers are
[`haus-tokens`](https://www.npmjs.com/package/haus-tokens), imported in `main.tsx`.
What remains here is Drift's:

- `layers.css`: the cascade layer order, declared once before anything opens a layer
- `primitives.css`: the five primitives Drift overrides (`base.primitives` layer)
- `semantics.css`: intent aliases (`base.semantics` layer)

The brand skin that themes these for Drift's cool, editorial identity lives in
`../styles/drift.css` (the `drift.*` layers, last in the order, so they win on
overlap).

## Why the semantic layer is still here

`primitives.css` used to carry 103 custom properties, 100 of which were
`haus-tokens`' values restated by hand with nothing keeping them in step. That
was a copy and it is gone.

**`semantics.css` was a copy, then a brand in the wrong layer, and is now neither.**

**D1, 2026-09-08.** Of the 148 role names it shared with the `haus-tokens@1.0.0` it installed, **89
were haus's own values restated**: 77 byte-identical, and 12 more that hardcoded the literal a haus
primitive resolves to. All deleted, and every one re-resolved to exactly the value it had.

**D2, the same day.** The 54 colour roles that remained were **a brand written as role overrides**.
They are `haus-tokens/brands/drift.css` now, applied at `[data-haus-theme='drift']` on the document
element, exactly as vault's is. **53 of the 54 values are byte-identical**; `backdrop` reads
`--haus-opacity-60` where this file read the `--haus-opacity-overlay` role, because a brand supplies
inputs and may not read the layer it feeds. Same value, correct layer.

That shape is what produced the defect this file already records: Badge and Input rendered in haus's
aronia purple inside a cool blue product, because the two sides named different properties and the
cascade order decided nothing. **Supplying inputs cannot fail that way.**

**Two values did move, and they are the only two.** Every one of the 409 declared properties was
re-resolved through both cascades and compared. `--haus-type-display-tracking` went `-0.01em` to
`-0.03em` and `--haus-type-heading-lg-tracking` went `-0.01em` to `-0.02em`: `haus#37` retightened
both after this file was written, and D1 deleted Drift's copies because against haus 1.0.0 they were
restatements. Taking 2.3.1 therefore takes haus's newer values. **Accepted deliberately** rather
than re-added as departures, on the user's call that text tightening is a change Drift can wear.

**21 declarations remain**, all Drift's own bar the five departures `D3` will move onto haus's form
tier: three `radius` roles one step tighter, two `elevation` roles on Drift's `--shadow-*` ramp.

**Why no check caught any of this:** `vault` hit the same defect as `vault#25`,
closed it, and wrote a guard that fails on any value restated locally that haus
already ships. `tokens.test.ts` here has no duplication rule. The guard existed
in the repository next door and was never ported. PORTFOLIO section 13 has the
plan: the restatements are deleted, the 54 become `brands/drift.css`, the 19 move
onto a mechanism haus grows for them, and the guard ships from `haus-tokens`.

## Why haus's semantic layer is loaded as well

[`haus-components`](https://www.npmjs.com/package/haus-components) supplies Badge
and Input, and its stylesheet reads roles with no fallback. Declaring those
locally would be the copy this directory exists to stop keeping.

haus's layer sits below Drift's in the order declared by `layers.css`, so the
**148 role names the two share resolve to Drift's values**.

**They did not until haus 1.0, and this file said otherwise.** Drift declared
`--color-surface-default`; haus-components read `--haus-color-surface-default`.
Two different properties, so the cascade order this section describes decided
nothing, and Badge and Input drew in haus's aronia purple inside a cool blue
product. Nothing caught it because each name resolved fine on its own: the
failure was not an unresolved `var()` but two vocabularies that never met. haus
1.0 prefixed every custom property, the 148 shared roles here were renamed to
match, and the override is now the thing this paragraph always claimed.

Six names are deliberately **not** renamed, because Drift means something
different by them: `--font-sans`, `--font-mono` and the four `--shadow-*` steps.
Drift has its own faces and its own shadow ramp, and pointing those at haus's
would have changed the product's look while every test stayed green.

`brand.css` is loaded as well, and is not optional. It is the layer that says
which primitive each role takes, haus's `semantics.css` reads 54
`--haus-brand-*` entries from it, and the sixteen roles Drift does not override
resolve through it.

`tokens.test.ts` reads the two installed packages as well as this directory, so
its three guards see what will actually load: nothing reads an undefined
property, no component reaches past the semantic layer, and `haus-components`
reads no role Drift does not load.
