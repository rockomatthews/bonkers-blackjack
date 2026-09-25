import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      DATA_DIR: ".data/e2e-" + Date.now(),
      BET_MS: "120000",
      ACTION_MS: "60000",
    },
    timeout: 120000,
  },
});
