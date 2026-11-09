import { expect, test } from "@playwright/test";

import { createPlaceApi, pickStars, rankViaUi, runId, seedRankedList, signInApi, snapshotApi } from "./helpers";

test.describe("ranking flow", () => {
  test("binary search asks at most ceil(log2(n+1)) questions and orders by the answers", async ({ page }) => {
    const run = runId();
    await signInApi(page);
    const [x1, x2, x3] = await seedRankedList(page, 3, `Order ${run}`);
    const target = await createPlaceApi(page, { name: `Order New ${run}` });

    await page.goto(`/places/${target.id}/rank`);
    await pickStars(page, 5);

    // n = 3 -> at most ceil(log2(4)) = 2 comparisons. First against #2.
    await expect(page.getByText("Comparison 1 (at most 2)")).toBeVisible();
    await expect(page.getByTestId("choose-existing")).toContainText(x2!.name);
    await expect(page.getByTestId("choose-existing")).toContainText("Your #2");
    await page.getByTestId("choose-new").click();

    // New beat #2, so now against #1; losing here puts it at position 2.
    await expect(page.getByText("Comparison 2 (at most 2)")).toBeVisible();
    await expect(page.getByTestId("choose-existing")).toContainText(x1!.name);
    await page.getByTestId("choose-existing").click();

    // Done after exactly two comparisons: straight to the note step.
    await expect(page.getByRole("heading", { name: "Add a comment (optional)" })).toBeVisible();
    await expect(page.getByText(/#2 of 4 in your Liked list\./)).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const rows = page.getByRole("listitem").filter({ hasText: run });
    await expect(rows).toHaveCount(4);
    const texts = await rows.allInnerTexts();
    expect(texts.map((t) => t.replace(/\s+/g, " "))).toEqual([
      expect.stringContaining(`1. ${x1!.name}`),
      expect.stringContaining(`2. ${target.name}`),
      expect.stringContaining(`3. ${x2!.name}`),
      expect.stringContaining(`4. ${x3!.name}`),
    ]);
    for (const t of texts) expect(t).toMatch(/\d+\.\d/);

    // Persisted the same way.
    const snap = await snapshotApi(page, target.id);
    expect(snap.my_ranking).toMatchObject({ bucket: "liked", position: 2 });
  });

  test("ranking into an empty bucket asks no questions", async ({ page }) => {
    const run = runId();
    await signInApi(page);
    await seedRankedList(page, 2, `Bucket ${run}`);
    const target = await createPlaceApi(page, { name: `Bucket New ${run}` });
    await page.goto(`/places/${target.id}/rank`);
    await pickStars(page, 2);
    // Below 3 stars the comment is required.
    await expect(page.getByRole("heading", { name: "Tell others why" })).toBeVisible();
    await expect(page.getByText(/#1 of 1 in your Disliked list\./)).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "need a comment" })).toBeVisible();
    await page.getByRole("textbox", { name: /^Comment/ }).fill("Too salty for me.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("cancelling midway saves nothing", async ({ page }) => {
    const run = runId();
    await signInApi(page);
    await seedRankedList(page, 2, `Cancel ${run}`);
    const target = await createPlaceApi(page, { name: `Cancel New ${run}` });

    await page.goto(`/places/${target.id}/rank`);
    await pickStars(page, 5);
    await expect(page.getByText("Comparison 1 (at most")).toBeVisible();
    await page.getByTestId("choose-new").click();
    await page.getByRole("link", { name: "Cancel" }).click();

    await expect(page).toHaveURL(new RegExp(`/places/${target.id}$`));
    await expect(page.getByRole("button", { name: "Rank", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your ranking" })).toHaveCount(0);
    expect((await snapshotApi(page, target.id)).my_ranking).toBeNull();

    await page.goto("/lists?tab=mine");
    await expect(page.getByRole("heading", { level: 3, name: "Ramen" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: target.name })).toHaveCount(0);
  });

  test("a stale list gives a 409 and the comparisons restart", async ({ page, context }) => {
    const run = runId();
    await signInApi(page);
    const [x1, x2] = await seedRankedList(page, 2, `Stale ${run}`);
    const target = await createPlaceApi(page, { name: `Stale New ${run}` });

    // Same context, so both tabs share the session cookie.
    const other = await context.newPage();
    await page.goto(`/places/${target.id}/rank`);
    await other.goto(`/places/${target.id}/rank`);
    await expect(page.getByRole("heading", { name: "How was it?" })).toBeVisible();
    await expect(other.getByRole("heading", { name: "How was it?" })).toBeVisible();

    // Tab 2 gets as far as the note step with the list version it loaded...
    await pickStars(other, 5);
    await other.getByTestId("choose-new").click();
    await expect(other.getByText("Comparison 2 (at most")).toBeVisible();
    await other.getByTestId("choose-new").click();
    await expect(other.getByRole("heading", { name: "Add a comment (optional)" })).toBeVisible();

    // ...then tab 1 saves first (this bumps the Liked list version).
    await rankViaUi(page, target.id, { answers: ["existing", "existing"] });

    // Tab 2 saves with the stale version.
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByRole("alert").filter({ hasText: "Your list changed in another tab" })).toBeVisible();
    // Comparisons restart against the refreshed list (this place is now excluded from it).
    await expect(other.getByRole("heading", { name: "Which was better?" })).toBeVisible();
    await expect(other.getByText("Comparison 1 (at most")).toBeVisible();
    await expect(other.getByTestId("choose-existing")).toContainText(/Stale \w+ [AB]/);

    // Answering again saves successfully, and the place keeps a single ranking.
    await other.getByTestId("choose-new").click();
    await expect(other.getByText("Comparison 2 (at most")).toBeVisible();
    await other.getByTestId("choose-new").click();
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.getByText("Saved", { exact: true })).toBeVisible();
    const snap = await snapshotApi(page, target.id);
    expect(snap.my_ranking).toMatchObject({ bucket: "liked", position: 1 });
    expect(snap.buckets.find((b) => b.bucket === "liked")?.items.map((i) => i.name)).toEqual(
      expect.arrayContaining([x1!.name, x2!.name]),
    );
  });
});
