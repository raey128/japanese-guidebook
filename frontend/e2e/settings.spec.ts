import { expect, test } from "@playwright/test";

import { createPlaceApi, rankApi, runId, signInApi } from "./helpers";

// R19: Settings has the account, every review (editable), saved places and places I added.
test("settings shows account info, my reviews to edit, saved places and places I added", async ({ page }) => {
  const run = runId();
  const username = await signInApi(page);
  const p = await createPlaceApi(page, { name: `Settings Spot ${run}` });
  await rankApi(page, p.id, { note: `Lovely ${run}` });
  const saved = await createPlaceApi(page, { name: `Settings Saved ${run}` });
  await page.request.put(`/api/bookmarks/${saved.id}`);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByText(username, { exact: true })).toBeVisible();

  const review = page.getByRole("region", { name: new RegExp(`Settings Spot ${run}`) });
  await expect(review).toContainText(`Lovely ${run}`);
  await review.getByRole("button", { name: "Edit comment" }).click();
  await review.getByRole("textbox", { name: /^Comment/ }).fill(`Even better ${run}`);
  await review.getByRole("button", { name: "Save comment" }).click();
  await expect(review).toContainText(`Even better ${run}`);

  await expect(page.getByRole("region", { name: "Saved places" })).toContainText(`Settings Saved ${run}`);
  await expect(page.getByRole("region", { name: "Places I added" })).toContainText(`Settings Spot ${run}`);
});
