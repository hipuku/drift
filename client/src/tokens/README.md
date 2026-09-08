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
2026-09-08 by parsing both files and comparing key by key: of the **148 role
names it shares** with `haus-tokens`' semantic layer, **75 are byte-identical
restatements** of haus's own declaration. `--haus-space-inset-md:
var(--haus-space-4)` is written on both sides. That is 51% of this file doing
nothing but keeping a second copy that nothing holds in step, which is the same
defect the paragraph above says was removed from `primitives.css`.

The other 73 divide cleanly. **54 are colour**, and they are a brand: 54 colour
roles resolving to haus primitives, which is the shape of `brands/vault.css`.
They are written here as output overrides instead of supplied as brand inputs,
so both semantic layers ship and every role is computed twice. **19 are genuine
non-colour departures** with no mechanism to express them, because haus's brand
contract covers colour and nothing else: 8 z-index, 3 radius, 2 elevation, 2
opacity, 2 border-width, 2 type.

Two earlier claims here are withdrawn. It shares 148 role names, not 118. And
**one** role is Drift's alone, `--haus-text-12`, not thirty-nine; the rename that
closed `drift#1` made that sentence false and nothing re-read it.

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
