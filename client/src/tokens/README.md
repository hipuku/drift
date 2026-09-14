# drift design tokens

Every custom property Drift reads is defined in this directory, in `../styles/`, or inline by a
component. No package supplies one.

- `layers.css`: the cascade layer order, declared before any file opens a layer.
- `foundation.css`: primitives, brand inputs, motion values and semantic roles, in the
  `foundation.*` layers. 197 declarations, all `--drift-*`.
- `primitives.css`: five primitives Drift sets for itself (`base.primitives`): three font stacks
  and the 1px and 2px spacing steps.
- `semantics.css`: 15 roles the foundation has no name for (`base.semantics`).

`../styles/drift.css` is the theme, in the `drift.*` layers, which come last in the order.

The names are not all prefixed. `foundation.css` is `--drift-*` throughout, and
`primitives.css` and `semantics.css` still declare unprefixed names such as `--font-sans`,
`--space-hairline`, `--radius-panel` and `--type-data-size`.

## Where `foundation.css` came from

Until 2026-09-09 the foundation was [`haus-tokens`](https://www.npmjs.com/package/haus-tokens),
added on 2026-08-30. `DESIGN.md` records why it was removed. `foundation.css` was generated once,
from the installed `haus-tokens@3.2.0`: every property Drift read, and the properties those read,
renamed from `--haus-*` to `--drift-*`. The ruby, paper and cobalt ramps were left out because
nothing read them, and so were the roles Drift's theme overrides. The package is no longer
installed, so the file cannot be regenerated and is edited by hand.

The generated file had 218 declarations. The brand layer arrived as a default block and a
`[data-theme='drift']` override, which was the shape haus's brand mechanism required. 18 of the
21 entries were identical in both blocks and only the three radius roles differed. Drift has one
theme, so the two blocks were merged into one, which leaves 197. The `data-theme` attribute was
removed from `index.html`.

The client's computed-styles e2e test (`client/e2e/computed-styles.spec.ts`) compared 2,680
elements against a baseline across the change. 313 properties differed, and all 313 came from two
earlier changes: the heading tracking in haus-tokens 3.2.0 and the Badge revert.

## Why there are four files

`foundation.css` holds values Drift would keep under any theme. `primitives.css` and
`semantics.css` hold what this product adds, and `drift.css` holds the theme. Merging them would
put a theme change and a foundation change in the same file.

Before the adoption, `primitives.css` declared 103 custom properties. 100 of them had the same
value as a property in `haus-tokens`, typed by hand, with nothing checking that they stayed equal.
They were deleted when the package was adopted.

## Tests

`tokens.test.ts` reads every stylesheet under `client/src` and checks three things.

- **Every `var(--x)` is defined.** A `var()` naming an undefined property is invalid at
  computed-value time, the declaration is dropped and the property inherits, with no build error.
  `--duration-default` never existed and was read by five animations, which ran with no duration.
  Reads with a fallback, `var(--x, 0.2s)`, are not checked.
- **CSS modules read no primitive** outside `TYPE_TIER_DEBT`, which records a count per name and
  fails if a count goes up or down without the record changing, and one decorative accent read.
- **Every `@keyframes` a module names is defined in that module.** CSS Modules hashes keyframes
  names as it hashes class names, so a name defined in another module does not match. The
  stylesheet split did this to the motion tab. `animation-name` still computed to the name, so
  neither the first check nor the computed-styles e2e test reported it.

A fourth test compared `primitives.css` with the values in `haus-tokens`. It was removed with the
package.

A CSS-module class that does not exist is not checked. It typechecks and is `undefined` at
runtime.

## Defects found while haus was a dependency

**Two prefixes.** Drift declared `--color-surface-default` and haus's components read
`--haus-color-surface-default`. They are different properties, so layer order had no effect, and
Badge and Input rendered in haus's aronia purple inside Drift's blue theme. Both names resolved,
so the undefined-property check passed. Prefixing the foundation fixed it.

**A check in one repository.** vault hit the same defect as `vault#25` and added a duplication
check. Drift had no copy of the check and hit it too.

**The brand schema.** When Drift's colour roles lived in `haus-tokens/brands/drift.css`, its
radius roles could move there and its shadows could not. The schema accepted a brand's own ramp
only as `--haus-<name>-<digits>`, and `--shadow-sm` does not match that pattern. `drift.css` has
no such restriction.
