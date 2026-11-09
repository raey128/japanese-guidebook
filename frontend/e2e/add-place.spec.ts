import { expect, test } from "@playwright/test";

import { addNameBox, runId, signInApi, stubMapStyle } from "./helpers";

test("adding is search-first on the main map; the pin moves only after Edit pin", async ({ page }) => {
  await stubMapStyle(page);
  await signInApi(page);
  await page.goto("/?lat=35.6620&lng=139.7380&z=15");
  await page.getByRole("button", { name: "Add a place" }).click();
  // Same page, same map; the name field is ready to type in and there's no pin yet.
  await expect(page).toHaveURL(/^[^?]*\/\?.*add=1/);
  await expect(page.getByTestId("add-panel")).toBeVisible();
  await expect(addNameBox(page)).toBeFocused();
  await expect(page.getByTestId("add-pin")).toHaveCount(0);
  await expect(page.getByTestId("pin-map")).toHaveCount(0);

  // Not listed: place the pin yourself; it can be dragged until Done.
  await addNameBox(page).fill(`Nowhere ${runId()}`);
  await page.getByRole("option", { name: /Can't find it\? Place the pin yourself/ }).click();
  await expect(page.getByTestId("add-pin")).toBeVisible();
  await expect(page.getByText("Drag the pin, or tap the map")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit pin" })).toBeVisible();
  // Category chips, including adding a new kind.
  await page.getByRole("button", { name: "New" }).click();
  await page.getByLabel("New food category").fill(`Curry ${runId()}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("group", { name: "Food kinds" }).getByRole("button", { pressed: true })).toContainText("Curry");

  await page.getByRole("button", { name: "Close add a place" }).click();
  await expect(page.getByTestId("add-pin")).toHaveCount(0);
});

test("Lists is the second tab, next to Map", async ({ page }) => {
  await stubMapStyle(page);
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await tabs.getByRole("link", { name: "Lists" }).click();
  await expect(page).toHaveURL(/\/lists/);
  await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Lists" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Map" }).click();
  await expect(page.getByTestId("map-container")).toBeVisible();
});
