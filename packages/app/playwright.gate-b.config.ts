import { defineConfig, devices } from "@playwright/test"
import app from "./playwright.config"

// Each case registers its own loopback service, with a fresh Host and model.
process.env.VITE_OPENCODE_SERVER_MODE = "none"

export default defineConfig({
  ...app,
  webServer: [app.webServer ?? []].flat().map((server) => ({ ...server, reuseExistingServer: false })),
  testMatch: "**/loginom-gate-b.gate.ts",
  reporter: [["html", { outputFolder: "e2e/playwright-report/gate-b", open: "never" }], ["line"]],
  outputDir: "e2e/test-results/gate-b",
  projects: [
    { name: "1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
})
