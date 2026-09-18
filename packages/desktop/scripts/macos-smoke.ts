#!/usr/bin/env bun

import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { parseArgs } from "node:util"
import release from "../../product/loginom-release.json"

// Run against unpacked artifacts, using their own Node and Playwright runtime.
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { desktop: { type: "string" }, cli: { type: "string" }, report: { type: "string" } },
  strict: true,
})
if (!values.desktop || !values.cli || !values.report)
  throw new Error("Usage: bun scripts/macos-smoke.ts --desktop <app> --cli <payload> --report <json>")
if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("MACOS_ARM64_REQUIRED")
const desktop = resolve(values.desktop)
const cli = resolve(values.cli)
const report = resolve(values.report)
const root = await mkdtemp(join(tmpdir(), "loginom-macos-offline-"))
const results: Array<{ check: string; status: "PASS"; detail: string }> = []
const env = {
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  HOME: join(root, "home"),
  TMPDIR: root,
  LANG: "en_US.UTF-8",
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_DATA_HOME: join(root, "data"),
  XDG_CACHE_HOME: join(root, "cache"),
  XDG_STATE_HOME: join(root, "state"),
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
  LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
  LOGINOM_AI_AGENT_TEST_ROOT: join(root, "desktop"),
  LOGINOM_AI_AGENT_CLI_PROFILE: join(root, "cli-profile"),
}
await mkdir(env.HOME, { recursive: true })
let failure: string | undefined
try {
  const metadata = await Bun.file(join(cli, "cli-manifest.json")).json()
  for (const [label, resources] of [
    ["desktop", join(desktop, "Contents/Resources/loginom")],
    ["cli", join(cli, "resources/loginom")],
  ]) {
    const manifest = await Bun.file(join(resources, "resource-manifest.json")).json()
    if (manifest.target !== "darwin-arm64") throw new Error(`${label}: RESOURCE_TARGET_INVALID`)
    const node = join(resources, manifest.node)
    const info = JSON.parse(
      run(node, ["-p", "JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform})"]),
    )
    if (info.version !== release.nodeVersion || info.arch !== "arm64" || info.platform !== "darwin")
      throw new Error(`${label}: BUNDLED_NODE_INVALID`)
    results.push({ check: `${label}-node`, status: "PASS", detail: `${info.version} ${info.platform}-${info.arch}` })
    const output = run(node, [
      "--input-type=module",
      "--eval",
      `
      import { createRequire } from "node:module";
      const require = createRequire(${JSON.stringify(join(resources, "runtime/client/package.json"))});
      const { chromium } = require("playwright-core");
      const browser = await chromium.launch({
        executablePath: ${JSON.stringify(join(resources, manifest.browser))},
        headless: true,
        args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"],
        timeout: 60000,
      });
      try {
        const context = await browser.newContext({ offline: true });
        await context.route("**/*", route => route.abort());
        const page = await context.newPage();
        await page.setContent("<title>Offline artifact smoke</title><p id='proof'>bundled Chromium</p>");
        if (await page.locator("#proof").textContent() !== "bundled Chromium") throw Error("BROWSER_RENDER_FAILED");
        console.log(browser.version());
      } finally { await browser.close(); }
      if (browser.isConnected()) throw Error("BROWSER_CLOSE_FAILED");
    `,
    ])
    results.push({ check: `${label}-chromium`, status: "PASS", detail: output })
  }
  const executable = join(cli, "bin/loginom-ai-agent-cli")
  if (!run(executable, ["--help"]).includes("loginom-ai-agent-cli")) throw new Error("CLI_HELP_INVALID")
  results.push({ check: "cli-help", status: "PASS", detail: "Help available with system-only PATH" })
  const version = run(executable, ["--version"])
  if (version !== metadata.metadata.version) throw new Error("CLI_VERSION_MISMATCH")
  results.push({ check: "cli-version", status: "PASS", detail: version })
  const name = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleExecutable", join(desktop, "Contents/Info.plist")])
  const resources = join(desktop, "Contents/Resources/loginom")
  run(
    join(resources, "bin/node"),
    [
      "--input-type=module",
      "--eval",
      `
    import { createRequire } from "node:module";
    const require = createRequire(${JSON.stringify(join(resources, "runtime/client/package.json"))});
    const { _electron } = require("playwright-core");
    const application = await _electron.launch({
      executablePath: ${JSON.stringify(join(desktop, "Contents/MacOS", name))},
      env: process.env,
      timeout: 120000,
    });
    const child = application.process();
    try {
      await application.context().route(/^https?:\\/\\//, route => route.abort());
      const page = await application.firstWindow({ timeout: 120000 });
      const form = page.locator('[data-component="settings-loginom"]');
      await form.waitFor({ timeout: 120000 });
      if (!await form.locator('button[type="submit"]').isVisible()) throw Error("ONBOARDING_ACTION_MISSING");
      if (!await form.locator('input[type="password"]').evaluateAll(inputs => inputs.length > 0 && inputs.every(input => input.value === "")))
        throw Error("ONBOARDING_SECRETS_NOT_EMPTY");
      if (await application.evaluate(({ app }) => app.getVersion()) !== ${JSON.stringify(metadata.metadata.version)})
        throw Error("DESKTOP_VERSION_MISMATCH");
    } finally { await application.close(); }
    if (child.exitCode !== 0 || child.signalCode) throw Error("DESKTOP_UNCLEAN_EXIT");
  `,
    ],
    300_000,
  )
  results.push({
    check: "desktop-onboarding-and-exit",
    status: "PASS",
    detail: "Isolated first-launch form, matching version, normal process exit",
  })
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
} finally {
  await rm(root, { recursive: true, force: true })
  await mkdir(dirname(report), { recursive: true })
  await Bun.write(
    report,
    JSON.stringify(
      {
        format: "loginom-macos-offline-smoke-v1",
        status: failure ? "FAIL" : "PASS",
        timestamp: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        desktop,
        cli,
        path: env.PATH,
        checks: results,
        ...(failure ? { failure } : {}),
        limitations: [
          "No Loginom or model connection; no credentials supplied",
          "Not a network sandbox",
          "Does not validate Gatekeeper, Keychain persistence, or installed GUI acceptance",
        ],
      },
      null,
      2,
    ) + "\n",
  )
}
if (failure) throw new Error(failure)
console.log(`PASS: macOS offline artifact smoke (${report})`)

function run(executable: string, args: string[], timeout = 120_000) {
  const result = spawnSync(executable, args, {
    env,
    cwd: root,
    encoding: "utf8",
    timeout,
    killSignal: "SIGKILL",
    detached: true,
    maxBuffer: 8 * 1024 * 1024,
  })
  // Deliberately omit subprocess logs from durable reports.
  if (result.error || result.status !== 0) {
    // Each probe owns a separate process group; never target a user's app.
    if (result.pid) {
      try {
        process.kill(-result.pid, "SIGKILL")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
      }
    }
    throw new Error(`SMOKE_PROCESS_FAILED: ${executable} (${result.error?.message ?? result.signal ?? result.status})`)
  }
  return result.stdout.trim()
}
