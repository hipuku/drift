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

**`semantics.css` is a copy too, and this paragraph used to deny it.** Measured on
2026-09-08 by parsing both files and comparing key by key, **against the
`haus-tokens@1.0.0` this directory actually installs** rather than against haus's
current source. That distinction is the whole of the second correction below.

Of the **148 role names** it shares with haus's semantic layer:

| | Count | What it is |
|---|---|---|
| Byte-identical restatements | **77** | haus's own declaration, retyped. `--haus-space-inset-md: var(--haus-space-4)` on both sides |
| Same value, hardcoded | **12** | the eight `z-index` roles at `0` to `600`, `border-width` at `1px` and `2px`, `opacity` at `0.4` and `0.6`. Every one is exactly what the haus primitive resolves to, with the reference replaced by the literal |
| Colour | **54** | a brand: 54 colour roles resolving to haus primitives, which is the shape of `brands/vault.css`. Written here as output overrides instead of supplied as brand inputs, so both semantic layers ship and every role is computed twice |
| **Genuine departures** | **5** | three `radius` roles one step tighter, and two `elevation` roles on Drift's own shadow ramp |

**So 89 of 148, 60%, are haus's values restated**, and Drift genuinely re-decides
**five** things. The paragraph above says the same defect was removed from
`primitives.css`; it was not removed from here.

**A first pass at this said 75 restatements and 19 non-colour departures, and both
were wrong.** It compared against haus's working tree, which is 2.x, while this
directory installs 1.0.0. Two of the nineteen were `--haus-type-display-tracking`
and `--haus-type-heading-lg-tracking`, which look like departures against haus 2.x
and are byte-identical to haus 1.0.0: `haus#37` retightened them after this file
was written. **Comparing a consumer against a version it does not install
manufactures departures that are really version skew**, and the corrected method
is to diff against the installed package.

Two earlier claims in this file are also withdrawn. It shares 148 role names, not
118. And **one** role is Drift's alone, `--haus-text-12`, not thirty-nine; the
rename that closed `drift#1` made that sentence false and nothing re-read it.

**The five that are real are worth keeping.** `--haus-radius-control`, `-surface`
and `-overlay` each sit one step tighter than haus's, and `--haus-elevation-raised`
and `-overlay` point at Drift's own `--shadow-*` ramp, one of the six names
deliberately not renamed in the haus 1.0 migration. Both are exactly what a brand
should be able to state and cannot: haus's brand contract covers colour and
nothing else, which is `haus#53`.

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
