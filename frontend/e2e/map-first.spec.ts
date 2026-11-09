import { expect, test, type Page } from "@playwright/test";

import { createPlaceApi, pickFoodCategory, pickStars, rankApi, runId, signInApi, stubMapStyle, uniqueUsername } from "./helpers";

// Tickets 15–25: the map-first home, top picks, Near me, Save ♡ with inline sign-in, celebrations,
// and the manual add → admin approval flow (N5.6).
const ADMIN = process.env.E2E_ADMIN ?? "e2e_admin";

test.beforeEach(async ({ page }) => {
  await stubMapStyle(page);
});

const searchBox = (page: Page) => page.getByRole("combobox", { name: "Search places and areas" });

/** A point in a quiet corner of Tokyo coverage, unique per run so other runs' places don't interfere. */
function quietPoint(): { lat: number; lng: number } {
  return { lat: 35.6 + Math.random() * 0.02, lng: 139.62 + Math.random() * 0.02 };
}

test("menu, + button and redirects", async ({ page }) => {
  await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
  await expect(page).toHaveURL(/^[^?]*\/\?lat=35\.7148/);
  await page.getByRole("button", { name: /^Menu/ }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("link", { name: /Lists/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Signed out, + asks for a username inline, then opens the add form.
  await page.getByRole("button", { name: "Add a place" }).click();
  const panel = page.getByRole("dialog", { name: /Pick a username/ });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Username").fill(uniqueUsername("fab"));
  await panel.getByRole("button", { name: "Let's go" }).click();
  await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
  await expect(page).toHaveURL(/add=1/);
});

test("top picks list the best places in view; tapping one opens it", async ({ page }) => {
  await signInApi(page);
  const run = runId();
  const at = quietPoint();
  const best = await createPlaceApi(page, { name: `Pick Best ${run}`, lat: at.lat, lng: at.lng });
  const ok = await createPlaceApi(page, { name: `Pick Ok ${run}`, lat: at.lat + 0.0006, lng: at.lng });
  await rankApi(page, best.id, { bucket: "liked" });
  await rankApi(page, ok.id, { bucket: "disliked" });

  await page.goto(`/?lat=${at.lat}&lng=${at.lng}&z=17`);
  // Top picks is a side panel, hidden until you open it (R15.6).
  await page.getByRole("button", { name: /Top picks here/, expanded: false }).click();
  const list = page.getByRole("list", { name: "Top picks here" });
  await expect(list.getByRole("listitem").first()).toContainText(`Pick Best ${run}`);
  await list.getByRole("button", { name: new RegExp(`Pick Best ${run}`) }).click();
  await expect(page.getByRole("region", { name: "Place summary" }).getByRole("heading", { name: new RegExp(`Pick Best ${run}`) })).toBeVisible();

  // Zoomed in, pins show their score and the viewer's ✓ mark in the accessible name.
  await expect(page.getByRole("button", { name: new RegExp(`^Pick Best ${run}, Ramen, score \\d\\.\\d.*ranked by you`) })).toBeVisible();
});

test("Near me centres on the user and shows walking times", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 35.7148, longitude: 139.7967 });
  await page.goto("/?lat=35.68&lng=139.76&z=12");
  await page.getByRole("button", { name: "Near me" }).click();
  await expect(page.getByRole("img", { name: "You are here" })).toBeVisible();
  await expect.poll(() => Number(new URL(page.url()).searchParams.get("lat"))).toBeCloseTo(35.7148, 2);
  await page.getByRole("button", { name: /^Senso-ji, / }).click();
  const summary = page.getByRole("region", { name: "Place summary" });
  await expect(summary).toContainText(/~\d+ min walk/);
});

test("signed out, Save ♡ asks for a username inline and keeps the map where it was", async ({ page }) => {
  await page.goto("/?lat=35.7148&lng=139.7967&z=16");
  await page.getByRole("button", { name: /^Senso-ji, / }).click();
  const summary = page.getByRole("region", { name: "Place summary" });
  await summary.getByRole("button", { name: /Save/ }).click();
  const panel = page.getByRole("dialog", { name: /Pick a username/ });
  await panel.getByLabel("Username").fill(uniqueUsername("sv"));
  await panel.getByRole("button", { name: "Let's go" }).click();
  await expect(summary.getByRole("button", { name: /Saved/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/lat=35\.71/);
  await expect(page.getByRole("button", { name: /^Senso-ji, .*saved/ })).toBeVisible();
  // The ♡ Saved chip shows only saved places.
  await page.getByRole("group", { name: "Category" }).getByRole("button", { name: "Saved" }).click();
  await expect(page).toHaveURL(/saved=1/);
});

test("ranking a place celebrates with the city count", async ({ page }) => {
  await signInApi(page);
  const p = await createPlaceApi(page, { name: `Party ${runId()}` });
  await page.goto(`/places/${p.id}/rank`);
  await pickStars(page, 5);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/(That's your \d+\w\w place in Tokyo|places? in Tokyo)/).first()).toBeVisible();
});

test("N5.6: manual add is pending for the submitter, invisible to others, then approved", async ({ browser, page }) => {
  const run = runId();
  const name = `Manual ${run}`;
  await signInApi(page);
  await page.goto("/?lat=35.6620&lng=139.7380&z=15");
  await searchBox(page).fill(name);
  await page.getByRole("option", { name: /^Can't find it/ }).click();
  // Search-first: no pin until you place it yourself (R13.12).
  await expect(page.getByTestId("add-pin")).toHaveCount(0);
  await page.getByRole("button", { name: "Place the pin yourself" }).click();
  await expect(page.getByTestId("add-pin")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await pickFoodCategory(page, "Ramen");
  await page.getByRole("button", { name: "Send for review" }).click();
  const different = page.getByRole("button", { name: "This is different, add it anyway" });
  const sent = page.getByText("Sent for review!", { exact: false });
  await expect(sent.or(different)).toBeVisible();
  if (await different.isVisible()) await different.click();
  await expect(sent).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${name}, .*pending review`) })).toBeVisible();

  // Someone else can't find it.
  const other = await browser.newPage();
  await stubMapStyle(other);
  const visible = async () => {
    const r = await other.request.get(`/api/suggest?q=${encodeURIComponent(name)}&city=tokyo`);
    const body = (await r.json()) as { on_map: unknown[]; elsewhere: unknown[] };
    return body.on_map.length + body.elsewhere.length;
  };
  expect(await visible()).toBe(0);

  // Admin approves it.
  const admin = await browser.newPage();
  const signed = await admin.request.post("/api/auth/sign-in", { data: { username: ADMIN, create: true } });
  const me = (await (await admin.request.get("/api/me")).json()) as { user: { is_admin: boolean } | null };
  test.skip(!signed.ok() || !me.user?.is_admin, `set up an admin first: make make-admin USERNAME=${ADMIN}`);
  await admin.goto("/admin/pending");
  const card = admin.getByRole("listitem", { name: `Pending: ${name}` });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card).toHaveCount(0);
  expect(await visible()).toBe(1);
});
