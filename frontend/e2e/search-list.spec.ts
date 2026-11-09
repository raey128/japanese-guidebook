import { expect, test } from "@playwright/test";

import { revealInList, runId, seedPlaceId, signInApi, stubMapStyle } from "./helpers";

// Search lives in the map's search bar (R12); the old /search page redirects to the map (R3.5).
test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

const searchBox = (page: import("@playwright/test").Page) => page.getByRole("combobox", { name: "Search places and areas" });

test("type a seeded name, pick it, and follow it to its list", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("Senso");
  const option = page.getByRole("option", { name: /Senso-ji/ }).first();
  await expect(option).toBeVisible();
  await option.click();

  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary.getByRole("heading", { name: /Senso-ji/ })).toBeVisible();
  await summary.getByRole("link", { name: "View details" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Senso-ji");

  await page.getByRole("link", { name: "Temple", exact: true }).click();
  await expect(page).toHaveURL(/\/lists\/tokyo\/temple/);
  const listRow = page.getByRole("listitem").filter({ hasText: "Senso-ji" });
  await revealInList(page, listRow);
  await expect(listRow.getByRole("link", { name: /^Senso-ji/ })).toBeVisible();
});

test("typing an area name flies the map there (R11.4)", async ({ page }) => {
  await page.goto("/");
  await searchBox(page).fill("Roppo");
  await searchBox(page).press("ArrowDown");
  await searchBox(page).press("Enter");
  // Roppongi & Azabu centroid: 35.6620, 139.7380.
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("lat")), { timeout: 5000 }).toBeCloseTo(35.662, 2);
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("lng"))).toBeCloseTo(139.738, 2);
});

test("the old search URL redirects to the map with the query kept", async ({ page }) => {
  await page.goto("/search?q=Senso");
  await expect(page).toHaveURL(/\/\?q=Senso/);
  await expect(searchBox(page)).toHaveValue("Senso");
});

test("the city link on the detail page opens the subcategory list", async ({ page }) => {
  await page.goto(`/places/${await seedPlaceId(page, "Senso-ji")}`);
  await page.getByRole("link", { name: "Tokyo", exact: true }).click();
  await expect(page).toHaveURL(/\/lists\/tokyo\/temple$/);
});

test("no match offers Add manually, which opens the form pre-filled for review", async ({ page }) => {
  await signInApi(page);
  const name = `Zqxjvk${runId()}`;
  await page.goto("/");
  await searchBox(page).fill(name);
  const add = page.getByRole("option", { name: `Can't find it? Add “${name}” manually` });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
  await expect(page).toHaveURL(/source=manual/);
  await expect(page.getByTestId("add-panel").getByRole("combobox", { name: /^Name/ })).toHaveValue(name);
  await expect(page.getByRole("button", { name: "Send for review" })).toBeVisible();
});

test("the category chip filters suggestions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Category" }).getByRole("button", { name: "Food" }).click();
  await searchBox(page).fill("Senso");
  await expect(page.getByRole("option", { name: /^Can't find it/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Senso-ji/ })).toHaveCount(0);
});
