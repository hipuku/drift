/* Keeps the Figma drift issues in step with the latest findings. Run weekly on
   main by the Figma parity workflow, with the findings from `--json`:

     node scripts/figma/issues.mjs figma-report.json

   One issue per item that needs the owner:
     New in Figma          a `design-proposal` issue
     Changed in Figma      a `drift-decision` issue, answered /keep-code or /take-figma
     Conflict              a `drift-decision` issue
   and one tracking issue listing the known drift. An issue whose item has been
   resolved is closed with a note. Uses the gh CLI and GH_TOKEN. */

import fs from "fs";
import { execFileSync } from "child_process";
import { show } from "./report.mjs";

const KINDS = {
  "figma-new": { label: "design-proposal", prefix: "Design proposal" },
  "figma-changed": { label: "drift-decision", prefix: "Drift decision" },
  conflict: { label: "drift-decision", prefix: "Drift decision" },
};
const TRACKING = { label: "design", title: "Known drift between code and Figma" };

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
/* Every open issue with the label, page by page, so a long list cannot hide an
   existing title and lead to a duplicate. */
const openIssues = (label) =>
  gh([
    "api",
    "--paginate",
    `repos/{owner}/{repo}/issues?state=open&per_page=100&labels=${encodeURIComponent(label)}`,
    "--jq",
    ".[] | select(.pull_request | not) | {number, title}",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

function itemBody(f) {
  const lines = [
    `Reported by the Figma parity check, last on ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "| | Value |",
    "| --- | --- |",
    `| Code | ${show(f.code)} |`,
    `| Figma | ${show(f.figma)} |`,
    `| Last agreed | code ${show(f.baseline.code)}, Figma ${show(f.baseline.figma)} |`,
    "",
  ];
  if (f.kind === "figma-new") {
    lines.push(
      "Figma has this and code does not. Build it, or remove it from Figma, then run `npm run figma:accept` in that pull request.",
    );
  } else {
    lines.push(
      "Answer with a comment: `/keep-code` (Figma changes to match the shipped value) or `/take-figma` (code changes to the Figma value, in its own pull request). Close this once the sides match and the baseline is accepted.",
    );
  }
  return lines.join("\n");
}

function main() {
  const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const { live, variablesFresh } = report;
  // Reconciling closes issues whose finding has gone. Findings read from the
  // snapshot because Figma could not be reached are not evidence of that.
  if (!live) {
    console.log("Components were not read live from Figma, so the issues were left as they are.");
    return;
  }
  // Token findings come from the variables snapshot. While it is older than the
  // file they say nothing about Figma now, so token issues are neither opened
  // nor closed until it is re-exported; component issues carry on.
  const isToken = (key) => key.startsWith("token ");
  const findings = variablesFresh
    ? report.findings
    : report.findings.filter((f) => !isToken(f.key));
  if (!variablesFresh)
    console.log("The variables snapshot is stale, so token issues were left as they are.");

  // One issue per item, opened once and closed when the item is resolved.
  for (const label of new Set(Object.values(KINDS).map((k) => k.label))) {
    const kinds = Object.entries(KINDS).filter(([, k]) => k.label === label);
    const wanted = findings.filter((f) => kinds.some(([kind]) => kind === f.kind));
    const titles = new Map(wanted.map((f) => [`${KINDS[f.kind].prefix}: ${f.key}`, f]));
    const open = openIssues(label);
    for (const [title, f] of titles) {
      const existing = open.find((i) => i.title === title);
      // An item that moved again keeps its issue and its discussion, with the
      // table brought up to date.
      if (existing) {
        gh(["issue", "edit", String(existing.number), "--body", itemBody(f)]);
        continue;
      }
      gh(["issue", "create", "--title", title, "--label", label, "--body", itemBody(f)]);
      console.log(`Opened: ${title}`);
    }
    for (const issue of open) {
      if (
        titles.has(issue.title) ||
        !kinds.some(([, k]) => issue.title.startsWith(`${k.prefix}: `))
      )
        continue;
      if (!variablesFresh && isToken(issue.title.replace(/^[^:]+: /, ""))) continue;
      gh([
        "issue",
        "close",
        String(issue.number),
        "--comment",
        "Resolved: the parity check no longer reports this item.",
      ]);
      console.log(`Closed: ${issue.title}`);
    }
  }

  // One tracking issue for the known drift, rewritten each run. Its token rows
  // come from the variables snapshot, so while that is stale the issue is left
  // as it is rather than rewritten from out-of-date values.
  if (!variablesFresh) {
    console.log("The variables snapshot is stale, so the tracking issue was left as it is.");
    return;
  }
  // The tracking issue lists what is known, which a stale snapshot does not change.
  const known = report.findings.filter((f) => f.kind === "known");
  const tracking = openIssues(TRACKING.label).find((i) => i.title === TRACKING.title);
  const body = [
    `${known.length} item(s) differ between code and Figma and have since the last accepted baseline. None fails a pull request. Updated ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "| Item | Code | Figma |",
    "| --- | --- | --- |",
    ...known.map((f) => `| ${f.key} | ${show(f.code)} | ${show(f.figma)} |`),
  ].join("\n");
  if (known.length && tracking) gh(["issue", "edit", String(tracking.number), "--body", body]);
  else if (known.length)
    gh(["issue", "create", "--title", TRACKING.title, "--label", TRACKING.label, "--body", body]);
  else if (tracking)
    gh(["issue", "close", String(tracking.number), "--comment", "No known drift left."]);
  console.log(`Known drift: ${known.length} item(s).`);
}

main();
