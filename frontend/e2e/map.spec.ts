import { expect, test } from "@playwright/test";

import { stubMapStyle } from "./helpers";

// Ticket 06. The remote tile style is replaced by a blank local one (see stubMapStyle) so the
// map fires `load` offline; markers are DOM buttons rendered from /api/map.
test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

const isMapCall = (url: string) => new URL(url).pathname === "/api/map";

test("pan/zoom reloads the pins, and a pin opens its summary and detail page", async ({ page }) => {
  const first = page.waitForResponse((r) => isMapCall(r.url()) && r.ok());
  await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
  const body = (await (await first).json()) as { kind: string };
  expect(body.kind).toBe("points");

  const pin = page.getByRole("button", { name: "Senso-ji", exact: true });
  await expect(pin).toBeVisible();

  // Zooming out with the map's own control triggers moveend -> a new /api/map request.
  const reload = page.waitForResponse((r) => isMapCall(r.url()) && r.ok());
  await page.getByRole("button", { name: "Zoom out" }).click();
  await reload;
  await expect.poll(() => new URL(page.url()).searchParams.get("z")).not.toBe("15.0");

  // The pin is still on screen after zooming out; open it.
  await expect(pin).toBeVisible();
  await pin.click();

  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("heading", { name: /Senso-ji/ })).toBeVisible();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await summary.getByRole("link", { name: "View details" }).click();

  await expect(page).toHaveURL(/\/places\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Senso-ji");
});

test("the summary closes with the close button", async ({ page }) => {
  await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
  await page.getByRole("button", { name: "Senso-ji", exact: true }).click();
  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary).toBeVisible();
  await summary.getByRole("button", { name: "Close place summary" }).click();
  await expect(summary).toHaveCount(0);
});

test("zoomed out, the map shows clusters that zoom in when activated", async ({ page }) => {
  const first = page.waitForResponse((r) => isMapCall(r.url()) && r.ok());
  await page.goto("/map?lat=35.68&lng=139.75&z=8");
  expect(((await (await first).json()) as { kind: string }).kind).toBe("clusters");

  const clusters = page.getByRole("button", { name: /^\d+ places?, zoom in$/ });
  await expect(clusters.first()).toBeVisible();
  expect(await clusters.count()).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Senso-ji", exact: true })).toHaveCount(0);

  await clusters.first().click();
  await expect
    .poll(() => Number(new URL(page.url()).searchParams.get("z")))
    .toBeGreaterThan(8);
});

test("filters change the query", async ({ page }) => {
  await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
  await expect(page.getByRole("button", { name: "Senso-ji", exact: true })).toBeVisible();
  const filtered = page.waitForResponse((r) => isMapCall(r.url()) && r.url().includes("category=ramen") && r.ok());
  await page.getByLabel("Category").selectOption("ramen");
  await filtered;
  await expect(page.getByRole("button", { name: "Senso-ji", exact: true })).toHaveCount(0);
});
