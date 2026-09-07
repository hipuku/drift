import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The screenshots in README.md and FEATURE.md, captured rather than dragged.
 *
 * The fifteen that were there had fifteen different sizes: widths from 4977 to
 * 4992 and heights from 2518 to 2533, which is the signature of a window
 * resized slightly between captures. They are the first thing a reviewer sees
 * on the repository page, and they were 26MB.
 *
 * Deterministic on three counts. The demo build replays a captured audit of
 * picocss.com, so the content is fixed. The viewport and device scale factor
 * are set here, so the dimensions are. And animations are finished before the
 * shutter, so a transition mid-flight cannot land in the file.
 *
 * Not part of the suite: this writes files, and a test that writes into the
 * repository should be asked for rather than run on every push. It is skipped
 * unless SHOTS=1.
 *
 *   npm run screenshots
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "..", "screenshots");

/** Tab id to filename. Two differ, and both are the file's name rather than the
 *  tab's: the overview is the repository's hero image and is called dashboard,
 *  and z-index keeps the hyphen the CSS property has. */
const TABS: [id: string, file: string][] = [
  ["overview", "dashboard"],
  ["colour", "colour"],
  ["contrast", "contrast"],
  ["type", "type"],
  ["spacing", "spacing"],
  ["radius", "radius"],
  ["shadow", "shadow"],
  ["border", "border"],
  ["opacity", "opacity"],
  ["zindex", "z-index"],
  ["blur", "blur"],
  ["breakpoint", "breakpoint"],
  ["gradient", "gradient"],
  ["motion", "motion"],
];

test.skip(!process.env.SHOTS, "Writes into the repository. Run with npm run screenshots.");

test.use({
  viewport: { width: 1600, height: 1000 },
  /* Two rather than three. The old captures were around 4990px wide, which is
     three times a wide window, and cost 26MB for images GitHub renders at about
     900px. Two is still crisp on a retina display and a third of the bytes. */
  deviceScaleFactor: 2,
});

test("captures every panel of the report", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await page.goto("/");
  await page.getByLabel("URL").fill("picocss.com");
  await page.getByRole("button", { name: "Find pages" }).click();
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.getByText("Design Health")).toBeVisible({ timeout: 30_000 });

  /* What the demo actually renders, which is not the whole list.
     picocss.com ships no backdrop-filter, so the fixture produces no blur tab
     and blur.png cannot be regenerated from it: that file was captured against
     a different site and is the one screenshot here with no source. Reported
     rather than skipped quietly, because a stale image nobody is told about is
     how the set drifted in the first place.

     A tab that renders and has no entry here is the opposite problem and fails:
     it means the report grew a panel and the documentation did not. */
  const rendered = await page
    .locator('[role="tab"][id^="audit-tab-"]')
    .evaluateAll((els) => els.map((e) => e.id.replace("audit-tab-", "")));
  const known = new Set(TABS.map(([id]) => id));
  const unexpected = rendered.filter((id) => !known.has(id));
  expect(unexpected, "the report has a panel with no screenshot mapping").toEqual([]);

  const absent = TABS.filter(([id]) => !rendered.includes(id)).map(([, file]) => `${file}.png`);
  if (absent.length) console.log(`Not regenerated, the demo audit has no such panel: ${absent.join(", ")}`);

  for (const [id, file] of TABS) {
    if (!rendered.includes(id)) continue;
    const tab = page.locator(`#audit-tab-${id}`);
    await expect(tab, `no tab with id audit-tab-${id}`).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await settle(page);
    await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: true });
  }

  /* Authored units is a block inside the overview rather than a tab of its own,
     so it is captured as an element. Full-page here would just repeat
     dashboard.png with a different name. */
  await page.locator("#audit-tab-overview").click();
  await settle(page);
  const authoring = page.locator('[class*="authoring"]').first();
  await expect(authoring, "the authored-units block is not in the overview").toBeVisible();
  await authoring.screenshot({ path: join(OUT, "authoring.png") });
});

/** Jump every running animation to its end state, so a capture cannot catch a
 *  transition halfway and differ from the last one for no reason. */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try {
        animation.finish();
      } catch {
        /* Infinite, so there is no end state to jump to. */
      }
    }
  });
}
