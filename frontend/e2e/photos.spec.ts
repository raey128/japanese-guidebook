import { expect, test } from "@playwright/test";

import { createPlaceApi, rankApi, runId, signInApi, stubMapStyle } from "./helpers";

// A 4×4 vermilion PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGO4aSUPRwzEcQD9IxMhITImcAAAAABJRU5ErkJggg==",
  "base64",
);

// R20: add a photo to your review from the place card; it shows on the card and in Reviews.
test("add a photo to your review and see it on the place card", async ({ page }) => {
  await stubMapStyle(page);
  await signInApi(page);
  const p = await createPlaceApi(page, { name: `Photo Spot ${runId()}` });
  await rankApi(page, p.id, { note: "Lovely broth" });

  await page.goto(`/?place=${p.id}`);
  const card = page.getByRole("region", { name: "Place summary" });
  await card.getByRole("button", { name: /^Edit comment/ }).click();
  await card.locator('input[type="file"]').setInputFiles({ name: "bowl.png", mimeType: "image/png", buffer: PNG });
  await expect(card.getByRole("img", { name: "New photo 1" })).toBeVisible();
  await card.getByRole("button", { name: "Save comment" }).click();

  await expect(card.getByRole("list", { name: "Your photos" }).getByRole("listitem")).toHaveCount(1);
  await expect(card.getByRole("list", { name: "Photos of this place" }).getByRole("listitem")).toHaveCount(1);
  await card.getByRole("button", { name: /Open photo 1 of 1/ }).first().click();
  const viewer = page.getByRole("dialog", { name: /Photo 1 of 1/ });
  await expect(viewer.getByRole("button", { name: "Delete photo" })).toBeVisible();
  await viewer.getByRole("button", { name: "Close photo" }).click();
});
