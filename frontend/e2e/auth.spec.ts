import { expect, test } from "@playwright/test";

import { uniqueUsername } from "./helpers";

test("sign in with a new username, then sign out", async ({ page }) => {
  const name = uniqueUsername("e2e");
  await page.goto("/sign-in");
  await expect(page.getByText("CC BY-SA 4.0").first()).toBeVisible();
  await page.getByLabel("Username").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(`Create account ${name}?`)).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  // Signed in, you land on the map; sign out is in the ⚙️ menu, which then offers Sign in.
  await page.getByRole("button", { name: /^Menu/ }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  const signOut = menu.getByRole("button", { name: `Sign out ${name}` });
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(menu.getByRole("link", { name: /Sign in/ })).toBeVisible();
});

test("invalid username shows an inline error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill("guidebook");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("reserved");
});
