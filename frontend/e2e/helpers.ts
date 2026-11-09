import { expect, type Locator, type Page } from "@playwright/test";

/** A username unique per run (≤ 20 chars of [a-z0-9_]). */
export function uniqueUsername(prefix = "u"): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return `${prefix}_${suffix}`.slice(0, 20);
}

/** Sign in through the UI, creating the account. */
export async function signIn(page: Page, username = uniqueUsername()): Promise<string> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: `Sign out ${username}` }).waitFor();
  return username;
}

/** Sign in through the API only (faster setup); shares cookies with the page. */
export async function signInApi(page: Page, username = uniqueUsername()): Promise<string> {
  const r = await page.request.post("/api/auth/sign-in", { data: { username, create: true } });
  if (!r.ok()) throw new Error(`sign-in failed: ${r.status()}`);
  return username;
}

// ---------------------------------------------------------------------------
// Shared setup helpers (API-driven where the UI is not what a test is about)
// ---------------------------------------------------------------------------

/** A short id unique per test run (letters+digits), for place names. */
export function runId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
}

/**
 * A random point inside central Tokyo (well inside coverage). Randomised so re-runs against the
 * same database never land within 50 m of a place created by an earlier run (duplicate check).
 */
export function randomTokyoPoint(): { lat: number; lng: number } {
  return {
    lat: Number((35.64 + Math.random() * 0.08).toFixed(5)),
    lng: Number((139.68 + Math.random() * 0.1).toFixed(5)),
  };
}

/** Escape a string for use inside `new RegExp(...)`. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the remote map style (OpenFreeMap) with an empty local one so MapLibre fires `load`
 * without network access; markers are DOM elements so tests do not need real tiles.
 */
export async function stubMapStyle(page: Page): Promise<void> {
  await page.route(/tiles\.openfreemap\.org/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        version: 8,
        name: "e2e-blank",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#e7e5e4" } }],
      }),
    }),
  );
}

export interface CreatedPlace {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

/** Create a place through the API as the signed-in user (always confirms "not a duplicate"). */
export async function createPlaceApi(
  page: Page,
  opts: { name: string; nameJa?: string; subcategory?: string; lat?: number; lng?: number },
): Promise<CreatedPlace> {
  const point = opts.lat !== undefined && opts.lng !== undefined ? { lat: opts.lat, lng: opts.lng } : randomTokyoPoint();
  const subs = await page.request.get("/api/subcategories");
  if (!subs.ok()) throw new Error(`subcategories failed: ${subs.status()}`);
  const list = (await subs.json()) as { id: number; slug: string }[];
  const sub = list.find((s) => s.slug === (opts.subcategory ?? "ramen"));
  if (!sub) throw new Error(`unknown subcategory ${opts.subcategory}`);
  const sug = await page.request.get(`/api/locations/suggest?lat=${point.lat}&lng=${point.lng}`);
  const suggestion = (await sug.json()) as { location: { id: number } | null };
  if (!suggestion.location) throw new Error("point is outside coverage");
  const r = await page.request.post("/api/places", {
    data: {
      name: opts.name,
      name_ja: opts.nameJa ?? null,
      lat: point.lat,
      lng: point.lng,
      subcategory_id: sub.id,
      location_id: suggestion.location.id,
      confirm_not_duplicate: true,
    },
  });
  if (!r.ok()) throw new Error(`create place failed: ${r.status()} ${await r.text()}`);
  const body = (await r.json()) as { status: string; place: { id: number } | null };
  if (body.status !== "created" || !body.place) throw new Error("place was not created");
  return { id: body.place.id, name: opts.name, ...point };
}

export interface SnapshotJson {
  my_ranking: { position: number; bucket: string; rating: number | null; note: string | null } | null;
  buckets: { bucket: string; version: number; items: { place_id: number; name: string; position: number }[] }[];
}

export async function snapshotApi(page: Page, placeId: number): Promise<SnapshotJson> {
  const r = await page.request.get(`/api/rankings/snapshot?place_id=${placeId}`);
  if (!r.ok()) throw new Error(`snapshot failed: ${r.status()}`);
  return (await r.json()) as SnapshotJson;
}

/** Rank a place through the API. `position` is 1-based among the target list's other items. */
export async function rankApi(
  page: Page,
  placeId: number,
  opts: { bucket?: "liked" | "fine" | "disliked"; position?: number; note?: string } = {},
): Promise<void> {
  const bucket = opts.bucket ?? "liked";
  const snap = await snapshotApi(page, placeId);
  const version = snap.buckets.find((b) => b.bucket === bucket)?.version ?? 0;
  // R3.6: the star rating decides the bucket; below 3 stars needs a comment.
  const rating = { liked: 5, fine: 3, disliked: 2 }[bucket];
  const note = opts.note ?? (rating < 3 ? "Not for me." : undefined);
  const r = await page.request.put("/api/rankings", {
    data: {
      place_id: placeId,
      rating,
      position: opts.position ?? 1,
      list_version: version,
      ...(note !== undefined ? { note } : {}),
    },
  });
  if (!r.ok()) throw new Error(`rank failed: ${r.status()} ${await r.text()}`);
}

/** Create `count` ramen places in Tokyo and rank them in order (#1..#count) in the Liked list. */
export async function seedRankedList(page: Page, count: number, label: string): Promise<CreatedPlace[]> {
  const out: CreatedPlace[] = [];
  for (let i = 0; i < count; i++) {
    const p = await createPlaceApi(page, { name: `${label} ${String.fromCharCode(65 + i)}` });
    await rankApi(page, p.id, { bucket: "liked", position: i + 1 });
    out.push(p);
  }
  return out;
}

/** Id of a seeded place, found through the search API by exact English name. */
export async function seedPlaceId(page: Page, name: string): Promise<number> {
  const r = await page.request.get(`/api/search?q=${encodeURIComponent(name)}`);
  const body = (await r.json()) as { items: { id: number; name: string }[] };
  const hit = body.items.find((i) => i.name === name);
  if (!hit) throw new Error(`seed place ${name} not found`);
  return hit.id;
}

/** RankFlow's first step: pick `stars` and press Next. */
export async function pickStars(page: Page, stars: number): Promise<void> {
  await page.getByRole("radio", { name: new RegExp(`^${stars} stars?:`) }).check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

export const STARS_FOR = { Liked: 5, Fine: 3, Disliked: 2 } as const;

/**
 * Drive the RankFlow UI for the place at /places/:id/rank: choose the bucket, answer each
 * comparison from `answers` ("new" = this place is better, "existing" = the listed one is), then
 * save. Returns the number of comparisons asked.
 */
export async function rankViaUi(
  page: Page,
  placeId: number,
  opts: { bucket?: "Liked" | "Fine" | "Disliked"; answers?: ("new" | "existing")[]; note?: string } = {},
): Promise<number> {
  if (!new RegExp(`/places/${placeId}/rank$`).test(page.url())) await page.goto(`/places/${placeId}/rank`);
  await pickStars(page, STARS_FOR[opts.bucket ?? "Liked"]);
  const save = page.getByRole("button", { name: "Save", exact: true });
  let asked = 0;
  for (;;) {
    await expect(save.or(page.getByTestId("choose-new"))).toBeVisible();
    if (await save.isVisible()) break;
    const answer = opts.answers?.[asked] ?? "new";
    asked += 1;
    await page.getByTestId(answer === "new" ? "choose-new" : "choose-existing").click();
    await expect(save.or(page.getByText(`Comparison ${asked + 1} (at most`))).toBeVisible();
  }
  const note = opts.note ?? (opts.bucket === "Disliked" ? "Not for me." : undefined);
  if (note) await page.getByRole("textbox", { name: /^Comment/ }).fill(note);
  await save.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  return asked;
}

/** Click "Load more" until `target` is visible (public lists page 50 at a time). */
export async function revealInList(page: Page, target: Locator): Promise<void> {
  const more = page.getByRole("button", { name: "Load more" });
  for (let i = 0; i < 40; i++) {
    await expect(target.or(more)).toBeVisible();
    if (await target.isVisible()) return;
    await more.click();
  }
  await expect(target).toBeVisible();
}

/** The name search on the map's Add a place panel. */
export function addNameBox(page: Page): Locator {
  return page.getByTestId("add-panel").getByRole("combobox", { name: /^Name/ });
}

/** Pick a food category chip on the Add a place panel (Food is the default group). */
export async function pickFoodCategory(page: Page, name: string): Promise<void> {
  await page.getByRole("group", { name: "Food kinds" }).getByRole("button", { name, exact: true }).click();
}
