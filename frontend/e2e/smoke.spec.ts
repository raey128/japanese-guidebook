import { expect, test } from "@playwright/test";

test("home page shows the API health status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("api-health")).toHaveText("API status: ok");
});
