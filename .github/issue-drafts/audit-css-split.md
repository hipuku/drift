`client/src/screens/Audit/Audit.module.css` is 1542 lines serving seven components. Splitting it so each stylesheet sits beside what it styles was attempted and reverted — read this before trying again.

### What was tried, and why it broke

Commit `a99dcf2`, reverted in `00f23c8`. The measurement said it was safe: only 8 of 161 classes are read from more than one component, and only 11 of 210 rules had classes owned by different files. It was split into seven modules plus a shared one, and it broke the UI — colour cards, verdict cards and every inventory table rendered unstyled.

Some rules mention a class without being that class's definition: a `prefers-reduced-motion` block listing `.card, .verdict { transition: none }`, an adjacency rule like `.familyList + .table`. Ownership was assigned per *rule*, so those went to the shared module and took the class name with them, while the class's real declarations stayed with its section. The component then read `shared.card`, and CSS Modules resolved it — to a class whose only rule was `transition: none`.

### The part worth remembering

A guard test written alongside asserted that every `styles.x` resolves to a class the imported module defines. It passed. It counted a class as defined if `.name` appeared anywhere in the file, including inside a media query or as the left half of a descendant selector. It checked spelling, not that a rule existed, and its green result was cited as evidence the split was safe.

A second signal was ignored: the CSS bundle grew 3 kB after the split. That is the same symptom as rules landing in the wrong file.

### If this is picked up again

- Static analysis of CSS Modules is not sufficient evidence. It failed twice here. The only trustworthy check is comparing computed styles before and after — render the screen and diff, or screenshot it.
- A lower-risk subset exists: `parts/colour.tsx`'s 41 classes have exactly one consumer and no shared-class involvement.
- Ownership must be assigned per *class*, by where its declarations are, not per rule by which classes a selector mentions.

### Priority

Low. The TSX half of this finding is done — `Audit.tsx` went 1631 → 657 lines across `parts/` and `sections/` (AUDIT-drift.md C2). The stylesheet is untidy, not broken, and the failure mode of getting it wrong is invisible.
