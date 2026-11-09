import { expect, test } from "@playwright/test";

import { createPlaceApi, rankApi, runId, signInApi, stubMapStyle } from "./helpers";

// Ticket 13: one Lists tab with All / My rankings / Saved segments (R14).
test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

test("a ranked place shows under My rankings and 'Show on map' opens it on the map", async ({ page }) => {
  const run = runId();
  await signInApi(page);
  const place = await createPlaceApi(page, { name: `Lists Ramen ${run}` });
  await rankApi(page, place.id);

  await page.goto("/lists");
  await page.getByRole("button", { name: "My rankings" }).click();
  await expect(page).toHaveURL(/\/lists\?tab=mine$/);
  await expect(page.getByRole("heading", { level: 3, name: "Ramen" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: place.name });
  await expect(row).toHaveCount(1);

  await row.getByRole("link", { name: `Show on map ${place.name}` }).click();
  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("heading", { name: new RegExp(run) })).toBeVisible();
  // The map centred on the place (URL view params come from moveend) and dropped the place param.
  await expect.poll(() => new URL(page.url()).searchParams.get("place")).toBeNull();
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("lat"))).toBeCloseTo(place.lat, 3);
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("lng"))).toBeCloseTo(place.lng, 3);
});

test("old list URLs redirect to the matching segment", async ({ page }) => {
  await signInApi(page);
  await page.goto("/me/rankings");
  await expect(page).toHaveURL(/\/lists\?tab=mine$/);
  await expect(page.getByRole("button", { name: "My rankings" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me/want-to-go");
  await expect(page).toHaveURL(/\/lists\?tab=want_to_go$/);
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
});

test("logged out: All works, personal segments ask to sign in", async ({ page }) => {
  await page.goto("/lists");
  await expect(page.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "Saved" }).click();
  const signIn = page.getByRole("link", { name: "Sign in" }).last();
  await expect(page.getByText("to see your lists.")).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/sign-in?next=%2Flists%3Ftab%3Dwant_to_go");
});

test("the Lists tab shows ready-made rankings for the city (R14.7)", async ({ page }) => {
  await page.goto("/lists?city=tokyo");
  await expect(page.getByRole("heading", { level: 2, name: "Top rated in Tokyo" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Top Food in Tokyo" })).toBeVisible();
  await page.getByRole("link", { name: /See all .*Top rated in Tokyo/ }).click();
  await expect(page).toHaveURL(/\/lists\/tokyo\/all$/);
  await expect(page.getByRole("heading", { level: 1, name: "Top rated in Tokyo" })).toBeVisible();
});
