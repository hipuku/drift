## What changed

<!-- What it does now that it did not before. One short paragraph. -->

## Why

<!-- The problem, or the issue it closes: "Closes #45". -->

## Design

<!-- Keep one. -->

- Figma updated: <!-- link to the frame -->
- No visual change
- Figma follows later (add the `figma-later` label)

## How it was tested

<!-- Tests added, what was checked by hand and where. -->

## Screenshots

<!-- Before and after for anything visual. Delete for non-visual changes. -->

## Checklist

- [ ] `npm run lint && npm run lint:css && npm run lint:prose && npm run typecheck && npm test`, and `npm test && npm run build` in `client/`
- [ ] A test that fails without this change, for a fix
- [ ] Tokens only, no raw values in component styles
- [ ] Keyboard and screen reader checked, for anything interactive
- [ ] `openapi.yaml` and `client/src/lib/api.ts` updated together, if the API changed
- [ ] README, FEATURE, DESIGN or ARCHITECTURE updated, if behaviour or design changed
