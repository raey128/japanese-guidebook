import { expect, test } from "@playwright/test";

import { createPlaceApi, escapeRegExp, randomTokyoPoint, rankViaUi, revealInList, runId, signIn, stubMapStyle } from "./helpers";

// N5.4: sign in with a username -> add a place by pin -> rank 3 places -> see them in the
// personal and the public lists.
test("sign in, add a place by pin, rank three places, see them in both lists", async ({ page }) => {
  test.slow();
  const run = runId();
  await stubMapStyle(page);
  const username = await signIn(page);

  // 1. Add a place through the UI, on the map itself (R13.7). /places/new?lat&lng opens the add
  //    panel with the pin there, so no map gesture is needed.
  const nameA = `Corefl Noodle ${run}`;
  const pin = randomTokyoPoint();
  await page.goto(`/places/new?lat=${pin.lat}&lng=${pin.lng}`);
  await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
  await expect(page).toHaveURL(/^[^?]*\/\?.*add=1/);
  await expect(page.getByTestId("add-pin")).toBeVisible();
  // The location is pre-selected from the pin once the suggestion arrives.
  await expect(page.getByLabel(/^Location/)).toHaveValue(/^\d+$/);
  await page.getByLabel("English name").fill(nameA);
  await page.getByLabel(/^Japanese name/).fill("麺");
  await page.getByLabel(/^Subcategory/).selectOption({ label: "Ramen" });
  await page.getByRole("radio", { name: /Not yet/ }).click();
  await page.getByRole("button", { name: "Add place", exact: true }).click();

  // The duplicate step only appears if a seeded/earlier place is nearby; dismiss it if so.
  const different = page.getByRole("button", { name: "This is different, add it anyway" });
  // Added: the panel closes and the new place's summary opens on the same map.
  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary.filter({ hasText: nameA }).or(different)).toBeVisible();
  if (await different.isVisible()) await different.click();
  await expect(summary).toContainText(nameA);
  await expect(page.getByTestId("add-panel")).toHaveCount(0);
  await expect(summary.getByText("Unverified", { exact: true })).toBeVisible();

  // 2. Two more places in the same city + subcategory, created through the API.
  const b = await createPlaceApi(page, { name: `Corefl Broth ${run}` });
  const c = await createPlaceApi(page, { name: `Corefl Tonkotsu ${run}` });

  // 3. Rank all three through the RankFlow UI: A first, then B (A is better), then C (B is better).
  await summary.getByRole("button", { name: "Rank", exact: true }).click();
  await expect(page).toHaveURL(/\/places\/\d+\/rank$/);
  const idA = Number(/\/places\/(\d+)\/rank$/.exec(page.url())?.[1]);
  expect(await rankViaUi(page, idA)).toBe(0);
  expect(await rankViaUi(page, b.id, { answers: ["existing"] })).toBe(1);
  expect(await rankViaUi(page, c.id, { answers: ["existing"], note: `Great bowl ${run}` })).toBe(1);

  // 4. Personal list: all three, in order, with scores.
  await page.goto("/lists?tab=mine");
  await expect(page.getByRole("heading", { level: 3, name: "Ramen" })).toBeVisible();
  const mine = page.getByRole("listitem").filter({ hasText: run });
  await expect(mine).toHaveCount(3);
  const texts = await mine.allInnerTexts();
  expect(texts[0]).toContain(nameA);
  expect(texts[1]).toContain(b.name);
  expect(texts[2]).toContain(c.name);
  for (const t of texts) expect(t).toMatch(/\d+\.\d/);

  // 5. Public list for Tokyo ramen shows them with a score and "1 ranker".
  await page.goto("/lists/tokyo/ramen");
  for (const name of [nameA, b.name, c.name]) {
    const row = page.getByRole("listitem").filter({ hasText: name });
    await revealInList(page, row);
    await expect(row).toContainText(/\d+\.\d · 1 ranker/);
    await expect(row).toContainText("Unverified");
  }

  // The public profile shows them too.
  await page.goto(`/u/${username}`);
  await expect(page.getByRole("link", { name: new RegExp(escapeRegExp(nameA)) })).toBeVisible();
});
