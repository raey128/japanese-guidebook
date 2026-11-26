import { expect, test } from "@playwright/test";

// Round 1 vote link (V1). CI creates these two demo links with `vote-demo` before e2e runs.
const OPEN = "/v/e2e-vote-open-000000000000000000";
const CLOSED = "/v/e2e-vote-closed-0000000000000000";

test("a friend votes with no account: taps save, name is optional, Done shows progress", async ({ page }) => {
  await page.goto(OPEN);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Maya picked \d+ places for Tokyo\.$/);
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);

  await page.getByLabel(/Your name, so Maya knows it's you/).fill(`E2E ${Date.now() % 100000}`);
  await page.getByLabel(/Your name/).press("Enter");

  const first = page.locator("ul > li").first();
  await first.getByRole("button", { name: "Yes" }).click();
  await expect(first.getByText("Saved")).toBeVisible();
  await first.getByRole("button", { name: "No" }).click(); // last tap wins
  await expect(first.getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");
  await expect(first.getByText("Saved")).toBeVisible();

  // Reload: the same browser keeps its votes.
  await page.reload();
  await expect(page.locator("ul > li").first().getByRole("button", { name: "No" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: /^Thanks\. \d+ of 4 (has|have) voted\.$/ })).toBeVisible();
});

test("closed voting shows read-only results", async ({ page }) => {
  await page.goto(CLOSED);
  await expect(page.getByRole("heading", { level: 1, name: "Voting has closed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes" })).toHaveCount(0);
});

test("an unknown link explains itself", async ({ page }) => {
  await page.goto("/v/not-a-real-link");
  await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
});
