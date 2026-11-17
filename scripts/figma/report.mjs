/* The findings as markdown: the pull request comment, the job summary and the
   terminal all print this. */

import { KINDS } from "./diff.mjs";

export const MARKER = "<!-- figma-parity -->";

const HEADINGS = {
  conflict: ["Conflicts", "Both sides changed, differently. Fails until one side is chosen."],
  "code-ahead": [
    "Code ahead of Figma",
    'Code changed and Figma did not. Update Figma, or accept the drift with `npm run figma:accept -- "<item>"`.',
  ],
  "figma-changed": [
    "Changed in Figma",
    "Figma changed something code already has. Decide in a drift decision issue: `/keep-code` or `/take-figma`.",
  ],
  "figma-new": [
    "New in Figma",
    "Figma has something code does not. Recorded as a design proposal.",
  ],
  known: ["Known drift", "Differences both sides already had at the last baseline. Not failing."],
  advance: [
    "Agreed since the baseline",
    "Code and Figma now match. Run `npm run figma:accept` to move the baseline forward.",
  ],
};

/* A pipe ends a markdown table cell even inside a code span, and most values
   here are joined with one, so it is escaped. */
export const show = (v) => (v === undefined ? "(none)" : `\`${String(v).replaceAll("|", "\\|")}\``);

/** `compact` is for pull requests: known drift is a count, not a table, so the
    comment shows only what this change needs to act on. */
export function report({
  findings,
  failing,
  warnings = [],
  figmaLater = false,
  source,
  compact = false,
  exceptions = 0,
}) {
  const lines = [MARKER, "## Figma parity", ""];
  if (!findings.length)
    lines.push(
      exceptions
        ? "Every compared item matches in code and Figma, and the baseline is current. Excepted items are not compared."
        : "Code and Figma match, and the baseline is current.",
    );
  else if (failing.length)
    lines.push(`**Failing:** ${failing.length} item(s) need code and Figma brought together.`);
  else lines.push("**Passing.** Nothing is failing; the items below are for information.");
  if (figmaLater)
    lines.push(
      "",
      "The `figma-later` label is on: code ahead of Figma is a warning, not a failure.",
    );
  if (source) lines.push("", `Figma read from: ${source}.`);
  if (exceptions)
    lines.push(
      "",
      `${exceptions} item(s) are left out on purpose, each with its reason in figma/exceptions.json.`,
    );
  for (const w of warnings) lines.push("", `> [!WARNING]\n> ${w}`);

  for (const kind of KINDS) {
    const rows = findings.filter((f) => f.kind === kind);
    if (!rows.length) continue;
    if (compact && kind === "known") {
      lines.push(
        "",
        `${rows.length} item(s) of known drift, unchanged by this pull request, are tracked in the weekly issue.`,
      );
      continue;
    }
    const [title, help] = HEADINGS[kind];
    lines.push("", `### ${title} (${rows.length})`, "", help, "");
    lines.push("| Item | Code | Figma |", "| --- | --- | --- |");
    for (const r of rows) lines.push(`| ${r.key} | ${show(r.code)} | ${show(r.figma)} |`);
  }
  return lines.join("\n") + "\n";
}
