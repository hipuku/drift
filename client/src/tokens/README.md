# drift design tokens

Drift's own three-layer token foundation, as plain CSS custom properties:

- `primitives.css` — raw values (`base.primitives` layer)
- `semantics.css` — intent aliases (`base.semantics` layer)
- `motion.css` — easing and durations (`base.motion` layer)

The brand skin that themes these for drift's cool, editorial identity lives in
`../styles/drift.css` (the `drift.*` layers, declared after `base.*` so they win
on overlap). Perceptual colour maths is the only external dependency — the
published `haus-colour-utils` package, consumed by the backend, not here.
