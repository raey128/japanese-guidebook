import { expect, test } from "@playwright/test";

import { stubMapStyle } from "./helpers";

test("the API is healthy", async ({ page }) => {
  const r = await page.request.get("/api/health");
  expect(r.ok()).toBe(true);
  expect(await r.json()).toMatchObject({ status: "ok" });
});

test("the first screen is the full-screen map with no site header (R11.1)", async ({ page }) => {
  await stubMapStyle(page);
  await page.goto("/");
  const map = page.getByTestId("map-container");
  await expect(map).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search places and areas" })).toBeVisible();
  await expect(page.locator("header")).toHaveCount(0);
  const box = await map.boundingBox();
  const vp = page.viewportSize()!;
  expect(box?.width).toBe(vp.width);
  expect(box?.height).toBe(vp.height);
});
