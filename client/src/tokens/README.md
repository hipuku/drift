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

`semantics.css` is not a copy. It shares 118 role names with `haus-tokens`'
semantic layer, which is what a role name is for, and resolves five of them
differently on purpose: the three radius roles are one step tighter than haus's,
`--elevation-overlay` sits one shadow step lower, and `--space-inset-2xl` is one
space step smaller. Thirty-nine more roles are Drift's alone. A theme
over shared primitives is the shape the architecture is for.

## Why haus's semantic layer is loaded as well

[`haus-components`](https://www.npmjs.com/package/haus-components) supplies Badge
and Input, and its stylesheet reads 113 roles with no fallback. Five were
undefined here, and they are exactly the five haus declares that Drift does not:
`--color-ink-on-aronia`, `--elevation-floating`, `--motion-duration-emphasis`,
`--radius-marker` and `--shadow-focus-error`. Declaring those five locally would
be the copy this directory just stopped keeping.

haus's layer sits below Drift's in the order declared by `layers.css`, so the
118 role names the two share resolve to Drift's values.

`tokens.test.ts` reads the two installed packages as well as this directory, so
its three guards see what will actually load: nothing reads an undefined
property, no component reaches past the semantic layer, and `haus-components`
reads no role Drift does not load.
