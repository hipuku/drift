import { expect, test } from "@playwright/test";

/**
 * The API reference at /reference/, from the demo build that deploys. It is
 * rendered from openapi.yaml, so a contract change that breaks it, or a build
 * change that drops the page, fails here rather than on the live site. It must
 * also never call out: there is no API behind the demo, and Scalar's telemetry
 * is off.
 */

test("renders every endpoint from the contract, and sends nothing", async ({ page }) => {
  const outbound: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") outbound.push(request.url());
  });

  await page.goto("/reference/");

  await expect(page.getByRole("heading", { name: "Drift API", level: 1 })).toBeVisible();
  for (const summary of [
    "Resolve a URL and list candidate pages",
    "Enqueue a crawl",
    "Job status and raw crawl result",
    "The full audit for a completed crawl",
  ]) {
    // The sidebar lists every operation; the sections themselves render as
    // they scroll into view.
    await expect(page.getByRole("link", { name: new RegExp(`^${summary}`) })).toBeVisible();
  }
  await page.getByRole("link", { name: /^The full audit for a completed crawl/ }).click();
  await expect(
    page.getByRole("heading", { name: "The full audit for a completed crawl" }),
  ).toBeVisible();

  // The request runner stays off: there is no live API to send to.
  await expect(page.getByRole("button", { name: /test request/i })).toHaveCount(0);
  expect(outbound).toEqual([]);
});
