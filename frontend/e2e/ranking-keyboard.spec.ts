import { expect, test } from "@playwright/test";

import { createPlaceApi, runId, seedRankedList, signInApi, snapshotApi } from "./helpers";

// N3.2: the whole ranking flow works without a pointer. Only page.keyboard is used after the
// initial navigation.
test("rank a place using only the keyboard", async ({ page }) => {
  const run = runId();
  await signInApi(page);
  await seedRankedList(page, 3, `Keybd ${run}`);
  const target = await createPlaceApi(page, { name: `Keybd Target ${run}` });

  await page.goto(`/places/${target.id}/rank`);
  await expect(page.getByRole("heading", { name: "How was it?" })).toBeVisible();

  // Rating step: the stars have focus; a number key picks that many stars and moves on (5 = Liked).
  await expect(page.getByRole("radio", { name: /^1 star:/ })).toBeFocused();
  await page.keyboard.press("5");

  // Comparison 1 (n=3 -> compares against #2): the "new" button has focus. Press 2 = existing is better.
  await expect(page.getByRole("heading", { name: "Which was better?" })).toBeVisible();
  await expect(page.getByTestId("choose-new")).toBeFocused();
  await page.keyboard.press("2");

  // Comparison 2 (compares against #3): move focus with Tab and activate with Space.
  await expect(page.getByText("Comparison 2 (at most")).toBeVisible();
  await expect(page.getByTestId("choose-new")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("choose-existing")).toBeFocused();
  await page.keyboard.press("Space");

  // Note step: Save is focused; Enter submits.
  await expect(page.getByRole("heading", { name: "Add a comment (optional)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const snap = await snapshotApi(page, target.id);
  expect(snap.my_ranking).toMatchObject({ bucket: "liked", position: 4, rating: 5 });
});

test("arrow keys and Enter also answer comparisons", async ({ page }) => {
  const run = runId();
  await signInApi(page);
  await seedRankedList(page, 1, `Arrow ${run}`);
  const target = await createPlaceApi(page, { name: `Arrow Target ${run}` });

  await page.goto(`/places/${target.id}/rank`);
  // Arrow keys move through the stars; Tab to Next, Enter continues (4 stars = Liked).
  await expect(page.getByRole("radio", { name: /^1 star:/ })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^4 stars:/ })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Which was better?" })).toBeVisible();
  await page.keyboard.press("ArrowLeft"); // this place is better
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect((await snapshotApi(page, target.id)).my_ranking).toMatchObject({ position: 1 });
});
