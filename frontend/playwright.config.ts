import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests. They drive a real browser against the full local stack:
 * Supabase (Docker, `npx supabase start`), the Go API on :8080 and Next.js on
 * :3000. This config does not start any of them — see e2e/README.md.
 *
 * The site must be on http://localhost:3000 exactly: magic links redirect there
 * (supabase/config.toml allow-list) and the session cookie is set for it.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // Every test signs a new user up through a real email, so they share the
  // mail server and the auth rate limits. One worker keeps that predictable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // `next dev` compiles each route on its first visit, which can take tens of
  // seconds on a cold runner. CI warms the routes up first; this is the margin.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["allure-playwright", { resultsDir: "allure-results" }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
