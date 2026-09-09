# drift design tokens

Drift defines every token it reads. Nothing here is supplied by a package.

- `layers.css`: the cascade layer order, declared once before anything opens a layer
- `foundation.css`: the primitives, brand inputs, motion values and semantic roles (`foundation.*` layers)
- `primitives.css`: the five primitives Drift's theme overrides (`base.primitives`)
- `semantics.css`: intent aliases the foundation has no name for (`base.semantics`)

The skin that themes these for Drift's cool, dark, editorial identity lives in
`../styles/drift.css` (the `drift.*` layers, last in the order, so they win on
overlap).

## Independence, 2026-09-09

**The foundation used to be [`haus-tokens`](https://www.npmjs.com/package/haus-tokens), and is
Drift's own now.** The reasoning is in `DESIGN.md`; the short version is that a tool which audits
design systems should not be wearing one it does not control. `foundation.css` is the closure of
what Drift actually read from that package: **197 declarations**, renamed `--haus-*` to
`--drift-*`, leaving out the ramps Drift never reached (ruby, paper, cobalt) and the roles its own
theme overrides.

**Nothing rendered differently.** The computed-styles e2e re-resolved 2,680 elements against a
baseline; the 313 properties that moved all traced to two earlier intended changes, and none to the
rename.

`foundation.css` was generated once, against `haus-tokens@3.2.0`, by a script that read the
installed package. **That package is gone, so the file is not regenerable** and is maintained by
hand like any other source. `tokens.test.ts` is what holds it.

**The generated closure was 218 declarations and the file is 197**, because the brand layer
collapsed on the way in. It arrived as a default block plus a `[data-theme='drift']` override,
which is the shape haus's brand mechanism required, and **18 of its 21 entries were byte-identical
across the two**: only the three radius roles ever differed. Drift ships one theme and owns the
file, so the second block was 21 declarations restating 18 values with nothing keeping them in
step. That is this repository's own subject, found in this repository, so it went. The
`data-theme` attribute it needed is off `index.html`.

## Why the split survives the dependency

Four files where one would do, now that Drift owns all of them. The split is not a leftover: the
foundation is what Drift would ship to anyone, `primitives.css` and `semantics.css` are what *this
product* changes, and `drift.css` is the identity. Collapsing them would make every theme decision
indistinguishable from every foundational one, in the product whose entire subject is telling those
two apart.

`primitives.css` used to carry 103 custom properties, 100 of them the package's values restated by
hand with nothing keeping them in step. **That was the same class of defect Drift was built to
detect, in Drift.** It is gone, and the guard that replaced it is below.

## The guards

`tokens.test.ts` reads every layer that will actually load, the foundation included:

- **nothing reads an undefined property.** CSS drops an undefined `var()` silently and the property
  inherits, with no warning at build or in review. That is how `--duration-default`, which never
  existed, left five animations running instantly. This is also what made independence safe: a role
  the generator dropped fails the build with its name.
- **no component reaches past the semantic layer**, outside a named exception list that can only
  shrink.

A third guard, against restating values the package already shipped, retired with the package.

## What the history is worth keeping for

Three findings outlived the dependency, because none of them is really about haus.

**Two vocabularies that never meet fail silently.** Drift declared `--color-surface-default`;
haus's components read `--haus-color-surface-default`. Two different properties, so the cascade
order decided nothing, and Badge and Input drew in an aronia purple inside a cool blue product.
Nothing caught it, because each name resolved fine on its own. **The failure was not an unresolved
`var()`.** Prefixing every custom property is what fixed it, and is why everything here is
`--drift-*` and not a bare `--color-*`.

**A guard living in one consumer is a habit, not a guard.** vault hit this same defect as
`vault#25`, closed it, and wrote a duplication check. Drift never got a copy, and hit it too.

**A brand file inside a design system can only express the parts of a product's identity the system
has vocabulary for.** When Drift's colour roles lived in `haus-tokens/brands/drift.css`, its radius
group could move there and its shadows could not: the brand schema allowed a brand its own ramp
only as `--haus-<name>-<digits>`, and `--shadow-sm` is not that. Drift's theme now has no such
ceiling, which is one of the things independence bought.
