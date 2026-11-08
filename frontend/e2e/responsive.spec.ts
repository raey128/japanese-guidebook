import { expect, test, type Page } from "@playwright/test";

import { seedPlaceId, signInApi, stubMapStyle } from "./helpers";

// N4.1: usable at 360 px wide, no horizontal scroll.
test.use({ viewport: { width: 360, height: 740 } });

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: "document scrollWidth" })
    .toBeLessThanOrEqual(360);
}

test.describe("360px layout", () => {
  test.beforeEach(async ({ page }) => {
    await stubMapStyle(page);
  });

  test("home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("ranked list", async ({ page }) => {
    await page.goto("/lists/tokyo/temple");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Temple");
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("place detail", async ({ page }) => {
    await page.goto(`/places/${await seedPlaceId(page, "Senso-ji")}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Senso-ji");
    await expectNoHorizontalScroll(page);
  });

  test("search", async ({ page }) => {
    await page.goto("/search?q=Senso");
    await expect(page.getByRole("link", { name: /^Senso-ji/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("add place", async ({ page }) => {
    await signInApi(page);
    await page.goto("/places/new?lat=35.7125&lng=139.795");
    await expect(page.getByRole("heading", { name: "Add a place" })).toBeVisible();
    await expect(page.getByTestId("pin-map")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("map", async ({ page }) => {
    await page.goto("/map?lat=35.7148&lng=139.7967&z=15");
    await expect(page.getByTestId("map-container")).toBeVisible();
    await expect(page.getByRole("button", { name: "Senso-ji", exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("ranking flow", async ({ page }) => {
    await signInApi(page);
    await page.goto(`/places/${await seedPlaceId(page, "Senso-ji")}/rank`);
    await expect(page.getByRole("heading", { name: "How was it?" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("installable PWA", () => {
  test("web app manifest is valid", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const res = await page.request.get(href ?? "/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as {
      name?: string;
      display?: string;
      start_url?: string;
      icons?: { src: string; sizes: string }[];
    };
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBeTruthy();
    const sizes = (manifest.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of (manifest.icons ?? []).filter((i) => i.sizes !== "any")) {
      const r = await page.request.get(icon.src);
      expect(r.ok(), `icon ${icon.src}`).toBe(true);
    }
  });

  test("a service worker registers", async ({ page }) => {
    await page.goto("/");
    const supported = await page.evaluate(() => "serviceWorker" in navigator);
    // Some engines/contexts (notably WebKit in automation) do not expose service workers; skip
    // rather than fail there. Chromium and Firefox must register the vite-plugin-pwa dev SW.
    test.skip(!supported, "navigator.serviceWorker is not available in this browser context");
    const ready = await page.evaluate(
      () =>
        Promise.race([
          navigator.serviceWorker.ready.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15_000)),
        ]),
    );
    expect(ready).toBe(true);
  });
});
