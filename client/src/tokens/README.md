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

**`semantics.css` was a copy and is not one any more.** Measured on 2026-09-08 by
parsing both files and comparing key by key, **against the `haus-tokens@1.0.0`
this directory actually installs** rather than against haus's working tree. Of the
148 role names it shared with haus's semantic layer, **89 were haus's own values
restated**: 77 byte-identical, and 12 more that hardcoded the literal a haus
primitive resolves to, the eight `z-index` roles at `0` to `600`, `border-width`
at `1px` and `2px`, and `opacity` at `0.4` and `0.6`.

**All 89 are deleted.** Every one of them now resolves through haus's layer to
exactly the value it had, checked by re-resolving the whole cascade before and
after rather than by reading the diff: **zero of the 89 moved, and zero of every
other declared property moved with them.** `haus-tokens/guard`'s
`findRestatedTokens` reports **0** against this file.

Two of the eighty-nine are worth naming, because they went home rather than
away. `--haus-weight-emphasis` and `--haus-weight-strong` are `drift#25`'s
finding, that emphasis is a modifier rather than a role. **haus took both**, and
this file went on declaring them at haus's values for a release afterwards. The
eleven typeset roles went the same way. That is the consumer teaching the system
something and then, correctly, stopping saying it.

**What is left is 72 declarations, and each third has a job.**

| | Count | What it is |
|---|---|---|
| `color/*` | **54** | Drift's palette, and **a brand written as role overrides**. It resolves correctly and lives in the wrong layer, which is `D2`: these become `brands/drift.css` and leave this file |
| `radius` and `elevation` | **5** | The genuine departures. Three radius roles one step tighter than haus's, two elevation roles on Drift's own `--shadow-*` ramp. `D3` moves them onto haus's form tier, which `haus#53` added for exactly this |
| Drift's own names | **13** | Roles haus has no name for: two spacing steps, a panel radius, two elevation roles, four motion durations and an easing, an inline icon size, a disabled-control opacity, and `--type-data-*` from `drift#24` |

**After `D2` and `D3` this file is thirteen declarations**, all of them Drift's
own, and nothing in it will be a name haus also uses.

**Two earlier claims are withdrawn.** It shared 148 role names, not 118. And
**one** role was Drift's alone under the old counting, `--haus-text-12`, not
thirty-nine; the rename that closed `drift#1` made that sentence false and
nothing re-read it.

**A first pass at all this said 75 restatements and 19 non-colour departures, and
both were wrong.** It compared against haus's working tree, which is 2.x, while
this directory installs 1.0.0. Two of the nineteen were
`--haus-type-display-tracking` and `--haus-type-heading-lg-tracking`, which look
like departures against haus 2.x and are byte-identical to haus 1.0.0, because
`haus#37` retightened them after this file was written. **Comparing a consumer
against a version it does not install manufactures departures that are really
version skew**, and it does so in the flattering direction: it makes a copy look
like a decision. The corrected method is to diff against the installed package.

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
