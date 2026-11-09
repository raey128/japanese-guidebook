import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Headless Firefox on GitHub's runners has no reliable WebGL, which the map needs (it
    // crashed or never drew the map there). Run it locally; CI covers Chromium and WebKit.
    ...(process.env.CI ? [] : [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }]),
    { name: "webkit-iphone", use: { ...devices["iPhone 14"] } },
  ],
  // Reuse a running `docker compose up` stack; otherwise start the Vite dev server
  // (the API must already be running on :8000).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 60_000 },
});
