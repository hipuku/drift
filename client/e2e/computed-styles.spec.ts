import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A computed-style baseline for the audit report.
 *
 * This exists because of drift#2. `Audit.module.css` is 1577 lines serving
 * seven components, splitting it was attempted and reverted, and the guard test
 * written alongside that attempt passed while the UI was broken: it counted a
 * class as defined if `.name` appeared anywhere in the file, including inside a
 * media query or as the left half of a descendant selector. It checked
 * spelling. Its green result was then cited as evidence the split was safe.
 *
 * So the rule this file exists to enforce: **static analysis of CSS Modules is
 * not evidence.** The only trustworthy check is what the browser computes. This
 * renders the report, walks every element, and records what it actually looks
 * like, so a refactor of the stylesheet can be diffed rather than eyeballed.
 *
 * The subject is the demo build, which replays a captured audit of picocss.com,
 * so the tree is deterministic between runs.
 *
 *   npm run styles:baseline    record
 *   npm run e2e -- computed    check against the record
 *
 * A missing baseline records one and passes. A present baseline is compared,
 * and any difference fails with the element and property that moved.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "__computed__", "audit-report.json");

/**
 * The properties worth comparing: the ones a stylesheet split can plausibly
 * change. Deliberately not "every computed property": that pulls in hundreds
 * of inherited defaults per element, makes the baseline unreadable, and buries
 * a real regression in noise.
 */
const PROPERTIES = [
  "display",
  "position",
  "color",
  "background-color",
  "border-top-width",
  "border-top-color",
  "border-radius",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "padding-top",
  "padding-left",
  "margin-top",
  "margin-left",
  "gap",
  "width",
  "height",
  "flex-direction",
  "grid-template-columns",
  "text-align",
  "opacity",
  "box-shadow",
  "overflow",
];

type Snapshot = Record<string, Record<string, string>>;

/** Stable path for an element: tag plus its index among siblings, root down.
 *  Class names are deliberately not part of the key, because the whole point is
 *  to notice when the styles behind a class change. */
const collect = (properties: string[]): Snapshot => {
  const path = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      const parent: Element | null = node.parentElement;
      const index = parent ? Array.prototype.indexOf.call(parent.children, node) : 0;
      parts.unshift(`${node.tagName.toLowerCase()}:${index}`);
      node = parent;
    }
    return parts.join(">");
  };
  const out: Snapshot = {};
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const style = getComputedStyle(el);
    const entry: Record<string, string> = {};
    for (const p of properties) entry[p] = style.getPropertyValue(p);
    out[path(el)] = entry;
  }
  return out;
};

/**
 * Jump every running animation to its end state before reading anything.
 *
 * Without this the baseline is not reproducible, and it took a deliberately
 * broken run to notice: after reverting the break the diff still reported 120
 * changed properties, all of them colours on the header buttons, drifting
 * between runs like `oklab(0.78 …)` against `oklab(0.86 …)`. Those are
 * transitions caught mid-flight. A check that disagrees with itself is worth
 * exactly as much as the spelling test this file was written to replace.
 *
 * Finished rather than disabled: `transition: none` everywhere would also erase
 * the reduced-motion rules, and those are part of what a split of this
 * stylesheet moves around. An infinite animation cannot be finished and throws,
 * which is why each is attempted on its own.
 */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        /* Infinite, so there is no end state to jump to. Left alone. */
      }
    }
  });
}

async function reachTheReport(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("URL").fill("picocss.com");
  await page.getByRole("button", { name: "Find pages" }).click();
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.getByText("Design Health")).toBeVisible({ timeout: 30_000 });
}

/** Every panel, not just the one that opens. Most of the stylesheet is behind a
 *  tab, and a baseline of the overview alone would have said nothing about the
 *  colour cards and inventory tables the reverted split actually broke. */
async function walkEveryTab(
  page: import("@playwright/test").Page,
  properties: string[],
): Promise<Snapshot> {
  const merged: Snapshot = {};
  const tabs = page.getByRole("tab");
  const count = await tabs.count();

  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    const name = (await tab.textContent())?.trim() ?? String(i);
    await tab.click();
    /* Waited on the tab's own selected state, because this tablist has no
       element with role="tabpanel" to wait on. That is a real gap and it is
       filed separately; here it only means the selected attribute is the
       signal available, and clicking is instant while rendering is not. */
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await settle(page);
    const snapshot = await page.evaluate(collect, properties);
    for (const [path, entry] of Object.entries(snapshot)) merged[`${name}|${path}`] = entry;
  }

  return merged;
}

/* Not run in CI, and that is a limit rather than an oversight.
 *
 * A computed style is what a particular browser on a particular machine
 * resolved, so the baseline carries that machine's font metrics and layout
 * rounding with it. Recorded on macOS and replayed on CI's Ubuntu it reports
 * around 1456 differences with the tree structurally identical: nothing moved,
 * everything measured slightly differently.
 *
 * That could be papered over by dropping every property whose value depends on
 * layout, but the ones left would be a poor net, and the exercise this was
 * built for does not need it. drift#2 asks for "comparing computed styles
 * before and after", and before and after happen on the same machine within
 * minutes of each other. That is what this does, and it caught what it was
 * built to catch.
 *
 * To use it: `npm run styles:baseline`, make the change, `npx playwright test
 * computed-styles`. An empty diff is the evidence. Delete the baseline
 * afterwards or leave it; it is regenerated, not maintained.
 */
test.skip(
  !!process.env.CI,
  "The baseline is machine-specific: a before-and-after instrument, not a cross-machine gate.",
);

test("the audit report computes the styles it is recorded as computing", async ({ page }) => {
  await reachTheReport(page);
  const current = await walkEveryTab(page, PROPERTIES);

  const elements = Object.keys(current).length;
  // A collector that silently stopped finding elements would make every
  // assertion below pass by comparing nothing against nothing.
  expect(elements, "no elements collected: the walk found nothing to record").toBeGreaterThan(500);

  if (!existsSync(BASELINE)) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`recorded ${elements} elements to ${BASELINE}`);
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Snapshot;

  const missing = Object.keys(baseline).filter((k) => !(k in current));
  const added = Object.keys(current).filter((k) => !(k in baseline));

  const moved: string[] = [];
  for (const [path, entry] of Object.entries(baseline)) {
    const now = current[path];
    if (!now) continue;
    for (const [property, value] of Object.entries(entry)) {
      if (now[property] !== value) {
        moved.push(`${path}\n    ${property}: ${value}  ->  ${now[property]}`);
      }
    }
  }

  expect(
    { missing: missing.slice(0, 10), added: added.slice(0, 10), moved: moved.slice(0, 20) },
    `${missing.length} elements gone, ${added.length} new, ${moved.length} properties changed`,
  ).toEqual({ missing: [], added: [], moved: [] });
});
