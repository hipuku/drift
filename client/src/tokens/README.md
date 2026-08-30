# drift design tokens

The primitive and motion layers are [`haus-tokens`](https://www.npmjs.com/package/haus-tokens),
imported in `main.tsx`. What remains here is Drift's:

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

`semantics.css` is not a copy. It shares 118 role names with `haus-tokens`'
semantic layer, which is what a role name is for, and resolves five of them
differently on purpose: Drift's controls are one radius step tighter and its
overlay sits one shadow step lower. Twenty more roles are Drift's alone. A theme
over shared primitives is the shape the architecture is for.

`tokens.test.ts` reads the installed package as well as this directory, so both
guards still see every primitive: the one asserting nothing reads an undefined
property, and the one asserting no component reaches past the semantic layer.
