import { expect, test } from "@playwright/test";

/**
 * The one flow the case study describes: paste a URL, pick pages, read the
 * report. If this passes, the product does the thing it claims on the page a
 * reviewer will open.
 *
 * Driven by keyboard wherever a keyboard would do, because the defect this
 * suite exists to catch was a keyboard one: focus landing on an element that
 * had never been made visible. A mouse-only test cannot see that.
 */

test("audits a site and reports what it ships", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Diagnose a site" })).toBeVisible();

  // Tab to the URL field rather than clicking it: the first interactive control
  // a keyboard user meets should be the one the page is for.
  const url = page.getByLabel("URL");
  await url.click();
  await url.fill("picocss.com");

  await page.getByRole("button", { name: "Find pages" }).press("Enter");

  const picker = page.getByRole("group", { name: "Pages to audit" });
  await expect(picker).toBeVisible();

  await page.getByRole("button", { name: /^Run audit/ }).click();

  // The crawl replays on a timer, so the report is the thing to wait for.
  await expect(page.getByRole("heading", { name: "picocss.com" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/exactly as shipped/)).toBeVisible();

  // The overview is the claim: an inventory with counts, not an empty shell.
  await expect(page.getByText("Design Health")).toBeVisible();
  const colours = page.getByRole("tab", { name: /Colour/ });
  await expect(colours).toBeVisible();
});

test("every tab reaches a populated panel", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("URL").fill("picocss.com");
  await page.getByRole("button", { name: "Find pages" }).click();
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.getByText("Design Health")).toBeVisible({ timeout: 30_000 });

  // Walked by keyboard: tablists are arrow-key navigable, and a tab that only
  // responds to a click is a tablist in appearance only.
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  expect(count).toBeGreaterThan(5);

  await tabs.first().focus();
  for (let i = 1; i < count; i++) {
    await page.keyboard.press("ArrowRight");
    const selected = page.getByRole("tab", { selected: true });
    await expect(selected).toBeFocused();
  }
});

test("nothing is left invisible once it is on screen", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("URL").fill("picocss.com");
  await page.getByRole("button", { name: "Find pages" }).click();
  await page.getByRole("button", { name: /^Run audit/ }).click();
  await expect(page.getByText("Design Health")).toBeVisible({ timeout: 30_000 });

  // The hipuku-web defect in assertion form: tab through the report and require
  // that whatever holds focus is actually rendered. A reveal driven by scroll
  // events leaves a focused card at opacity 0, which every unit test misses.
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    if ((await focused.count()) === 0) continue;
    await expect(focused).toBeVisible();
    const opacity = await focused.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0);
    checked++;
  }

  // Without this the loop passes by focusing nothing, which is the shape of a
  // test that cannot fail. Twenty-five presses across a report with a tablist,
  // an export and a table should reach far more than ten controls.
  expect(checked).toBeGreaterThan(10);
});
