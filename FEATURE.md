# Drift: features

The report tabs, with screenshots from the demo build. The demo replays an audit of
picocss.com captured on 2026-08-30. Each figure below names the reference it was measured
against.

---

## Overview

A health line, then one card per category, tinted by its verdict: good, watch or review. The
card counts come from the audit's `summary`. Clicking a card opens that category's tab.

![Overview](screenshots/dashboard.png)

---

## Colour

Every colour in use, grouped into hue families and ranked by usage. Each swatch shows its roles
(text, background, border) and the pages it appears on.

![Colour](screenshots/colour.png)

Two colours less than CIEDE2000 ΔE 2 apart are counted as near-duplicates. Selecting a swatch
opens a rail listing its opacity variants (the same hex base at a different alpha) and its
near-duplicates. Choosing one scrolls to its card.

---

## Contrast

Every distinct text and background pair, with its WCAG 2.1 ratio and AA and AAA results, lowest
ratio first.

![Contrast](screenshots/contrast.png)

An element's own `background-color` is usually `transparent`, so the pair uses the nearest
ancestor background instead. Alpha is composited before the ratio is taken. `#111111` at 50%
alpha on white measures 18.88 if the alpha is ignored and passes AAA. Composited it renders as
`#888888`, measures 3.54, and fails AA. A translucent ancestor background is composited over
white, not over whatever sits behind it.

---

## Type

Font families with usage counts, then the size ladder.

![Type](screenshots/type.png)

Sizes are plotted on a log axis against the steps of a modular scale, and sizes more than 0.75px
from a step are marked. Each named ratio in the selector shows how many sizes miss it. The
automatic fit is the ratio that the fewest sizes miss, with mean relative error breaking a tie.
The Overview verdict uses the automatic fit whichever ratio is selected on this tab.

Each row shows the authored unit beside the computed pixels. `getComputedStyle` returns pixels
for a size authored in `rem` or `px` alike.

---

## Spacing

Every padding, margin and gap value, with a bar for its size and the element tags and properties
it appears on.

![Spacing](screenshots/spacing.png)

Measured against a 4px or 8px grid, with 0.5px tolerance, selectable like the type ratio. The
tab defaults to 8px when every value sits on it, and to 4px otherwise. The health line always
counts against 4px.

---

## Radius, shadow and border

![Radius](screenshots/radius.png)
![Shadow](screenshots/shadow.png)

Radii within 1px of each other are counted as near-duplicates, such as 4px beside 4.9px. Border
widths use 0.5px, so 1px beside 1.5px counts. Shadows are listed with usage and have no
duplicate check.

![Border](screenshots/border.png)

---

## Opacity, z-index, blur and gradients

![Opacity](screenshots/opacity.png)
![Z-index](screenshots/z-index.png)

Z-index values are drawn as a stacking ladder. More than eight distinct values, or any value of
9999 or above, adds z-index to the health line.

![Blur](screenshots/blur.png)
![Gradient](screenshots/gradient.png)

picocss.com sets no `backdrop-filter`, so the demo has no blur tab. `blur.png` was captured from
a different site and cannot be regenerated from the demo capture.

---

## Breakpoints and motion

![Breakpoints](screenshots/breakpoint.png)

Breakpoints are read from the media queries in same-origin stylesheets, labelled by device class
and counted separately as `min-width` and `max-width`.

![Motion](screenshots/motion.png)

Each duration and easing animates a sample dot at that value.

---

## Authored units

![Authoring](screenshots/authoring.png)

The units the stylesheets use, per category, read from the CSSOM. `1rem` and `16px` compute to
the same pixels. Cross-origin stylesheets throw on `cssRules` and are skipped.

---

## Export

The audit as one JSON file: `health`, `findings[]` with severity and evidence, `verdicts`, and a
`rules` block with the ΔE threshold, the detected ratio, the grid base and its tolerance, the
radius tolerance and the WCAG AA thresholds. The summary and the full inventory follow.

Two exports can be diffed, and a CI job can assert on `findings`. The client builds the file from
the `/audit` response. No endpoint serves it; [issue #3](../../issues/3) was closed while the
public deployment stays a replay.
