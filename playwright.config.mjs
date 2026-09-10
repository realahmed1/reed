import { defineConfig, devices } from "@playwright/test";

const chromiumPath = process.env.REED_TEST_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173/reed/",
    trace: "retain-on-failure"
  },
  projects: chromiumPath
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumPath } } }]
    : [
      { name: "chromium", use: { ...devices["Desktop Chrome"] } },
      { name: "webkit", use: { ...devices["Desktop Safari"] } }
    ],
  webServer: {
    command: "node scripts/serve-web.mjs",
    url: "http://127.0.0.1:4173/reed/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
