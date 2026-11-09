import { expect, test, type Page } from "@playwright/test";

import { randomTokyoPoint, runId, signInApi, snapshotApi, stubMapStyle } from "./helpers";

async function placeIdByName(page: Page, name: string): Promise<number> {
  const r = await page.request.get(`/api/me/rankings`);
  const body = (await r.json()) as {
    cities: { categories: { buckets: { items: { place_id: number; name: string }[] }[] }[] }[];
  };
  const hit = body.cities
    .flatMap((c) => c.categories)
    .flatMap((c) => c.buckets)
    .flatMap((b) => b.items)
    .find((i) => i.name === name);
  if (!hit) throw new Error(`no ranking for ${name}`);
  return hit.place_id;
}

// R3.6: adding a place you've been to needs a star rating; a comment is optional unless the
// rating is below 3 stars.
test("adding a place you've been to requires a rating, and a comment below 3 stars", async ({ page }) => {
  await stubMapStyle(page);
  await signInApi(page);
  const name = `Review Add ${runId()}`;
  const pin = randomTokyoPoint();
  await page.goto(`/places/new?lat=${pin.lat}&lng=${pin.lng}`);
  await expect(page.getByLabel(/^Location/)).toHaveValue(/^\d+$/);
  await page.getByLabel("English name").fill(name);
  await page.getByLabel(/^Subcategory/).selectOption({ label: "Ramen" });
  const submit = page.getByRole("button", { name: "Add place", exact: true });

  // Must say whether you've been.
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "if you've been here" })).toBeVisible();

  // Been there: the rating is mandatory...
  await page.getByRole("radio", { name: /Yes, I've been/ }).click();
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a star rating" })).toBeVisible();

  // ...and 2 stars needs a comment.
  await page.getByRole("radio", { name: /^2 stars:/ }).check();
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "need a comment" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Comment/ }).fill("Broth was cold.");
  await submit.click();

  const different = page.getByRole("button", { name: "This is different, add it anyway" });
  const summary = page.getByRole("region", { name: "Place summary" }).filter({ hasText: name });
  const refine = page.getByRole("heading", { name: "Which was better?" });
  await expect(summary.or(different).or(refine)).toBeVisible();
  if (await different.isVisible()) await different.click();
  await expect(summary.or(refine)).toBeVisible();

  const id = await placeIdByName(page, name);
  const snap = await snapshotApi(page, id);
  expect(snap.my_ranking).toMatchObject({ bucket: "disliked", rating: 2, note: "Broth was cold." });
});

test("the Lists are one tap from the map", async ({ page }) => {
  await stubMapStyle(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await expect(page).toHaveURL(/\/lists/);
  await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
});

test("the add pin is on the main map and moves when you pick an address", async ({ page }) => {
  await stubMapStyle(page);
  await signInApi(page);
  await page.goto("/?lat=35.6620&lng=139.7380&z=15");
  await page.getByRole("button", { name: "Add a place" }).click();
  // Same page, same map: the panel opens over it with one draggable pin.
  await expect(page).toHaveURL(/^[^?]*\/\?.*add=1/);
  await expect(page.getByTestId("map-container")).toBeVisible();
  await expect(page.getByTestId("add-panel")).toBeVisible();
  await expect(page.getByTestId("add-pin")).toHaveCount(1);
  await expect(page.getByTestId("pin-map")).toHaveCount(0);
  await page.getByRole("button", { name: "Close add a place" }).click();
  await expect(page.getByTestId("add-pin")).toHaveCount(0);
});
