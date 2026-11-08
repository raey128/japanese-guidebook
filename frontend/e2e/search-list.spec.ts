import { expect, test } from "@playwright/test";

import { revealInList, runId, signInApi } from "./helpers";

// Ticket 08: search a seeded place, open its list from the detail page; "Not found" path.
test("search a seeded place and open its list", async ({ page }) => {
  await page.goto("/search");
  await page.getByLabel("Search places").fill("Senso");

  const results = page.getByRole("list", { name: "Search results" });
  const row = results.getByRole("listitem").filter({ hasText: "Senso-ji" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: "Rank", exact: true })).toBeVisible();
  await expect(row).toContainText("Temple");

  await row.getByRole("link", { name: /^Senso-ji/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Senso-ji");

  // The city + subcategory links in the header lead to the list.
  await page.getByRole("link", { name: "Temple", exact: true }).click();
  await expect(page).toHaveURL(/\/lists\/tokyo\/temple/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Temple in Tokyo");
  const listRow = page.getByRole("listitem").filter({ hasText: "Senso-ji" });
  await revealInList(page, listRow);
  await expect(listRow.getByRole("link", { name: /^Senso-ji/ })).toBeVisible();
});

test("the city link on the detail page opens the subcategory list", async ({ page }) => {
  await page.goto("/search?q=Senso-ji");
  await page.getByRole("link", { name: /^Senso-ji/ }).first().click();
  await page.getByRole("link", { name: "Tokyo", exact: true }).click();
  await expect(page).toHaveURL(/\/lists\/tokyo\/temple$/);
});

test("a search with no match shows Not found and a link to add the place", async ({ page }) => {
  await signInApi(page);
  await page.goto(`/search?q=${encodeURIComponent(`Zqxjvk${runId()}`)}`);
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();
  const add = page.getByRole("link", { name: "Add it on the map" });
  await expect(add).toHaveAttribute("href", "/places/new");
  await add.click();
  await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
});

test("search filters by category", async ({ page }) => {
  await page.goto("/search?q=Senso");
  await expect(page.getByRole("link", { name: /^Senso-ji/ })).toBeVisible();
  await page.getByLabel("Category").selectOption({ label: "Ramen" });
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();
});
