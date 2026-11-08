import { expect, test } from "@playwright/test";

import { createPlaceApi, rankApi, runId, signInApi } from "./helpers";

const PAYLOAD = `<script>window.__xss=1</script><img src=x onerror="window.__xss=1">`;

// N2.4: user-supplied text is always rendered as text, never as HTML.
test("script and img payloads in a place name and a note render as literal text", async ({ page }) => {
  const run = runId();
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });

  const username = await signInApi(page);
  const name = `${PAYLOAD} ${run}`;
  const note = `Note ${PAYLOAD} ${run}`;
  const place = await createPlaceApi(page, { name, nameJa: `<b>ja</b>${run}` });
  await rankApi(page, place.id, { note });

  const noXss = async () => {
    expect(await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss)).toBeUndefined();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator("main script")).toHaveCount(0);
  };

  // Detail page: title and the note (shown in "Your ranking" and in the Notes list).
  await page.goto(`/places/${place.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByText(note, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`<b>ja</b>${run}`)).toBeVisible();
  await noXss();

  // Other surfaces that render the name.
  await page.goto("/lists?tab=mine");
  await expect(page.getByRole("link", { name: new RegExp(run) }).first()).toBeVisible();
  await noXss();

  await page.goto(`/u/${username}`);
  await expect(page.getByRole("link", { name: new RegExp(`${run}`) })).toBeVisible();
  await noXss();

  await page.goto(`/search?q=${encodeURIComponent(run)}`);
  await expect(page.getByRole("list", { name: "Search results" })).toContainText(name);
  await noXss();

  await page.goto(`/places/${place.id}/rank`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await noXss();

  expect(dialogs).toEqual([]);
});
