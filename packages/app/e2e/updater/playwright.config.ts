import { defineConfig } from "@playwright/test"
import { fileURLToPath } from "node:url"

const port = 4618
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../test-results/updater",
  workers: 1,
  retries: 0,
  reporter: "line",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 960, height: 720 },
    launchOptions: { executablePath: process.env.LOGINOM_DOCK_TEST_BROWSER },
  },
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    url: `http://127.0.0.1:${port}/e2e/updater/index.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
