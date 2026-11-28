import { defineConfig, devices } from "@playwright/test"
import { fileURLToPath } from "node:url"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3436)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testMatch: "**/*.gate.ts",
  outputDir: "../test-results/gate",
  reporter: [
    ["html", { outputFolder: "../playwright-report/gate", open: "never" }],
    ["list", { printSteps: true }],
  ],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "narrow", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `bun run build && bun e2e/utils/serve.ts --host 127.0.0.1 --port ${port}`,
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        url: baseURL,
        env: { VITE_OPENCODE_SERVER_MODE: "none" },
        timeout: 180_000,
      },
})
