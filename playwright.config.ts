import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Runs the production build; `pnpm build` must have run first.
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { BETTER_AUTH_URL: `http://localhost:${port}` },
  },
});
