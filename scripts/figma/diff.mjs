/* The decision rules. Pure: items in, findings out, no I/O.

   Each item has three values: what code says now, what Figma says now, and the
   pair both sides held at the last accepted baseline. Comparing each side with
   its own baseline value says which side moved, and that decides the finding.

     code = figma                  same, or `advance` if the baseline is behind
     neither side moved            known: drift both sides already had
     only code moved               code-ahead: Figma has not caught up
     only Figma moved, code lacks  figma-new: a proposal
     only Figma moved              figma-changed: a decision for the owner
     both moved, differently       conflict

   code-ahead and conflict fail the check. A `figma-later` waiver turns
   code-ahead into a warning; it never waives a conflict. */

export const KINDS = ["conflict", "code-ahead", "figma-changed", "figma-new", "known", "advance"];

export const FAILING = new Set(["conflict", "code-ahead"]);

/** Findings for every item that is not plainly the same on both sides and in
    the baseline. */
export function diff({ code, figma, baseline = {}, figmaLater = false }) {
  const keys = [
    ...new Set([...Object.keys(code), ...Object.keys(figma), ...Object.keys(baseline)]),
  ].sort();
  const findings = [];
  for (const key of keys) {
    const c = code[key];
    const f = figma[key];
    const b = baseline[key] ?? {};
    const codeMoved = c !== b.code;
    const figmaMoved = f !== b.figma;
    let kind;
    if (c === f) kind = codeMoved || figmaMoved ? "advance" : null;
    else if (!codeMoved && !figmaMoved) kind = "known";
    else if (codeMoved && !figmaMoved) kind = "code-ahead";
    else if (!codeMoved && figmaMoved) kind = c === undefined ? "figma-new" : "figma-changed";
    else kind = "conflict";
    if (kind) findings.push({ key, kind, code: c, figma: f, baseline: b });
  }
  const failing = findings.filter(
    (x) => FAILING.has(x.kind) && !(x.kind === "code-ahead" && figmaLater),
  );
  return { findings, failing };
}

/** The baseline after accepting the current pair for `keys`, or for every item
    when `keys` is empty. An item absent from both sides leaves the baseline. */
export function accept({ code, figma, baseline = {}, keys = [] }) {
  const next = { ...baseline };
  const all = [...new Set([...Object.keys(code), ...Object.keys(figma), ...Object.keys(baseline)])];
  for (const key of keys.length ? keys : all) {
    if (code[key] === undefined && figma[key] === undefined) delete next[key];
    else next[key] = { code: code[key], figma: figma[key] };
  }
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
}

/** Items left out of the comparison on purpose, each with a reason, in the
    manner of stylelint.config.mjs's enumerated exceptions: a known difference
    is written down once rather than carried as drift. An exception goes stale
    when its item has left both sides, or when both sides now agree; the check
    warns, so the list cannot outlive its reasons. */
export function applyExceptions({ code, figma, baseline = {}, exceptions = {} }) {
  const without = (map) =>
    Object.fromEntries(Object.entries(map).filter(([k]) => !(k in exceptions)));
  const stale = Object.keys(exceptions).filter(
    (k) => (code[k] === undefined && figma[k] === undefined) || code[k] === figma[k],
  );
  return { code: without(code), figma: without(figma), baseline: without(baseline), stale };
}
