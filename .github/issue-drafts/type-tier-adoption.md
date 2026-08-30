94 references bypass the semantic type tier, across 8 stylesheets:

| Primitive | Uses |
|---|---|
| `--font-sans` / `--font-mono` | 44 |
| `--text-12` | 24 |
| `--weight-medium` / `--weight-semibold` | 12 |
| `--text-14` / `-11` / `-13` / `-24` | 13 |
| `--font-display` | 1 |

Concentrated in `screens/Audit/Audit.module.css` (58), then `foundation/Foundation.module.css` (15) and `screens/Configure/Configure.module.css` (10).

SIGNATURE §4: components read semantic aliases, never raw primitives. The tier they should be reading exists — eleven roles (`--type-body-*`, `--type-heading-*`, `--type-label-*`, …), each bundling size, weight, leading and tracking.

### Why this is not a find-and-replace

`font-size: var(--text-12)` asks for one property. The nearest role, `--type-label-sm`, also sets weight 500, leading 1.4 and tracking 0.02em. Adopting it changes how the text sits — on a dense table row that is visible. So each of the 94 is a judgement: does this element want the role, or is it deliberately off it?

### Suggested approach

1. Convert the unambiguous cases first — a `font-size`/`font-weight` pair that already matches a role exactly, so nothing moves visually. Roughly 30–40 of the 94.
2. Then `Audit.module.css` by hand, with the screen open.
3. Leave anything genuinely off-role, and say so in a comment.

### Guard already in place

`client/src/tokens/tokens.test.ts` fails on any *new* primitive read from a component, and holds the current 10 as a named exception list. A second test fails if a name on that list stops being read, so the list can only shrink. Removing entries from `TYPE_TIER_DEBT` as they are converted is the unit of progress here.

### Context

From AUDIT-drift.md C1. The spacing, radius, elevation and motion halves of that finding are done (`78d682a`); this is the remainder.

Note the open question in AUDIT-drift.md F2: drift may end up depending on `haus-tokens` rather than carrying its own primitives. That does not change this work — the type roles are drift's own semantic layer either way — but it is worth settling first if it is going to happen soon.
