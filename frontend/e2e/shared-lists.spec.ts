import { expect, test } from "@playwright/test";

import { createPlaceApi, rankApi, runId, signInApi, stubMapStyle } from "./helpers";

// Shared lists (decided 2026-11-27): make one, add places in a batch, reorder, share, open as a friend.
test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

test("make a list, add places in one go, reorder, and open it as a friend", async ({ page, browser }) => {
  const run = runId();
  await signInApi(page);
  const loved = await createPlaceApi(page, { name: `Loved Ramen ${run}` });
  await rankApi(page, loved.id); // rated 9: starts on the list
  const other = await createPlaceApi(page, { name: `Other Ramen ${run}` });
  await rankApi(page, other.id, { bucket: "fine" });

  await page.goto("/lists");
  await page.getByRole("button", { name: "New list" }).click();
  const dialog = page.getByRole("dialog", { name: "New list" });
  await dialog.getByLabel("Name it").fill(`Recs ${run}`);
  await dialog.getByRole("button", { name: "Tokyo" }).click();
  await dialog.getByRole("button", { name: "Make the list" }).click();

  await expect(page).toHaveURL(/\/lists\/mine\/\d+$/);
  const places = page.getByRole("list", { name: "Places on this list" });
  await expect(places.getByText(loved.name)).toBeVisible();

  await page.getByRole("button", { name: "Add places" }).click();
  const sheet = page.getByRole("dialog", { name: /Add places in Tokyo/ });
  await sheet.getByRole("listitem").filter({ hasText: other.name }).getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Add 1 place" }).click();
  await expect(places.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: `Move ${other.name} up` }).click();
  await expect(places.getByRole("listitem").first()).toContainText(other.name);

  const href = await page.getByRole("link", { name: "See it as friends do" }).getAttribute("href");
  const friend = await (await browser.newContext()).newPage();
  await stubMapStyle(friend);
  await friend.goto(href!);
  await expect(friend.getByRole("heading", { level: 1, name: /picked 2 places for Tokyo/ })).toBeVisible();
  await expect(friend.getByRole("link", { name: /Open in Google Maps/ })).toHaveCount(2);
  await friend.locator("ul > li").first().getByRole("button", { name: "Yes" }).click();
  await expect(friend.getByText("Saved").first()).toBeVisible();
  await friend.context().close();
});
