import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createPlaceApi, pickStars, rankApi, runId, seedPlaceId, seedRankedList, signInApi, stubMapStyle } from "./helpers";

// N3.1: no serious or critical WCAG 2.1 A/AA violations. The MapLibre canvas and attribution are
// third-party and excluded.
async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".maplibregl-canvas")
    .exclude(".maplibregl-ctrl-attrib")
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const message = bad
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `    ${n.target.join(" ")}\n      ${n.failureSummary?.replace(/\n/g, " ") ?? ""}`).join("\n"),
    )
    .join("\n");
  expect(bad, `axe violations on ${label}:\n${message}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

test.describe("accessibility (axe)", () => {
  test("ranked list", async ({ page }) => {
    await page.goto("/lists/tokyo/temple");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Temple");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await expectNoSeriousViolations(page, "/lists/tokyo/temple");
  });

  test("place detail", async ({ page }) => {
    const id = await seedPlaceId(page, "Senso-ji");
    await page.goto(`/places/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Senso-ji");
    await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
    await expectNoSeriousViolations(page, "place detail (signed out)");
  });

  test("place detail, signed in with a ranking and a note", async ({ page }) => {
    await signInApi(page);
    const p = await createPlaceApi(page, { name: `Axe Detail ${runId()}` });
    await rankApi(page, p.id, { note: "A short, plain note." });
    await page.goto(`/places/${p.id}`);
    await expect(page.getByRole("heading", { name: "Your ranking" })).toBeVisible();
    await expectNoSeriousViolations(page, "place detail (signed in)");
  });

  test("ranking flow: bucket and comparison steps", async ({ page }) => {
    await signInApi(page);
    const run = runId();
    await seedRankedList(page, 2, `Axe Rank ${run}`);
    const target = await createPlaceApi(page, { name: `Axe Target ${run}` });
    await page.goto(`/places/${target.id}/rank`);
    await expect(page.getByRole("heading", { name: "How was it?" })).toBeVisible();
    await expectNoSeriousViolations(page, "ranking flow: bucket step");

    await pickStars(page, 5);
    await expect(page.getByRole("heading", { name: "Which was better?" })).toBeVisible();
    await expectNoSeriousViolations(page, "ranking flow: comparison step");
  });

  test("ranking flow: note step", async ({ page }) => {
    await signInApi(page);
    const target = await createPlaceApi(page, { name: `Axe Note ${runId()}` });
    await page.goto(`/places/${target.id}/rank`);
    await pickStars(page, 5);
    await expect(page.getByRole("heading", { name: "Add a comment (optional)" })).toBeVisible();
    await expectNoSeriousViolations(page, "ranking flow: note step");
  });

  test("add place", async ({ page }) => {
    await signInApi(page);
    await stubMapStyle(page);
    await page.goto("/places/new?lat=35.7125&lng=139.795");
    await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
    await expect(page.getByTestId("add-pin")).toBeVisible();
    await expect(page.getByLabel(/^Location/)).toHaveValue(/^\d+$/);
    await expectNoSeriousViolations(page, "/places/new (pin set)");
  });

  test("profile", async ({ page }) => {
    const username = await signInApi(page);
    const p = await createPlaceApi(page, { name: `Axe Profile ${runId()}` });
    await rankApi(page, p.id);
    await page.goto(`/u/${username}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(username);
    await expect(page.getByRole("link", { name: /Axe Profile/ })).toBeVisible();
    await expectNoSeriousViolations(page, `/u/${username}`);
  });

  test("map search with suggestions open", async ({ page }) => {
    await page.goto("/?lat=35.7148&lng=139.7967&z=15");
    await page.getByRole("combobox", { name: "Search places and areas" }).fill("Senso");
    await expect(page.getByRole("option", { name: /Senso-ji/ }).first()).toBeVisible();
    await expectNoSeriousViolations(page, "/ (search open)");
  });

  test("menu drawer and lists", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Menu/ }).click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await expectNoSeriousViolations(page, "/ (menu)");
    await page.goto("/lists");
    await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
    await expectNoSeriousViolations(page, "/lists");
  });

  test("home and sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("map-container")).toBeVisible();
    await expectNoSeriousViolations(page, "/");
    await page.goto("/sign-in");
    await expect(page.getByLabel("Username")).toBeVisible();
    await expectNoSeriousViolations(page, "/sign-in");
  });

  test("map", async ({ page }) => {
    await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
    await expect(page.getByRole("button", { name: /^Senso-ji, / })).toBeVisible();
    await expectNoSeriousViolations(page, "/map");
  });
});
