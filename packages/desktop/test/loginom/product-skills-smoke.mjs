import { createRequire } from "node:module"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { setTimeout } from "node:timers/promises"

const executable = process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE
const driverResources = process.env.LOGINOM_AI_AGENT_TEST_RESOURCES
const evidence = process.env.LOGINOM_AI_AGENT_TEST_ARTIFACTS
const collisions = process.env.LOGINOM_AI_AGENT_TEST_RESERVED_SKILLS === "1"
if (![executable, driverResources, evidence].every((path) => path && isAbsolute(path)))
  throw Error("ABSOLUTE_TEST_PATHS_REQUIRED")
if (process.platform !== "linux") throw Error("LINUX_TEST_REQUIRED")
if (process.getuid() === 0) throw Error("NONROOT_TEST_REQUIRED")
await mkdir(evidence, { mode: 0o700 })
const root = await mkdtemp(join(tmpdir(), "loginom-product-skills-smoke-"))
const home = join(root, "home")
const workspace = join(root, "workspace")
const profile = join(root, "profile")
await writeFile(join(evidence, "roots.json"), JSON.stringify({ root, home, workspace, profile }, null, 2))
await mkdir(home, { mode: 0o700 })
await mkdir(workspace, { mode: 0o700 })
const reservedNames = ["package-docs", "loginom-automation", "package_docs"]
if (collisions) {
  for (const name of reservedNames) {
    const directory = join(workspace, ".agents/skills", name)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, "SKILL.md"),
      `---\nname: ${name}\ndescription: UNTRUSTED replacement.\n---\n\nUNTRUSTED BODY\n`,
    )
  }
}
const require = createRequire(join(driverResources, "runtime/client/package.json"))
const { _electron } = require("playwright-core")
const observations = new Map()
let stopped = false
const monitor = (async () => {
  while (!stopped) {
    const rows = await Promise.all(
      (await readdir("/proc"))
        .filter((pid) => /^\d+$/.test(pid))
        .map(async (pid) => {
          const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
          const command = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
          return {
            pid: Number(pid),
            parent: Number(fields[1]),
            start: fields[19],
            state: fields[0],
            command: command.replaceAll("\0", " ").trim(),
          }
        }),
    )
    const owned = new Set([
      process.pid,
      ...rows.filter((row) => observations.has(`${row.pid}:${row.start}`)).map((row) => row.pid),
    ])
    let count = 0
    do {
      count = owned.size
      rows.filter((row) => owned.has(row.parent)).forEach((row) => owned.add(row.pid))
    } while (owned.size !== count)
    rows
      .filter((row) => owned.has(row.pid) && row.pid !== process.pid && row.start)
      .forEach((row) => {
        const key = `${row.pid}:${row.start}`
        if (row.command || !observations.has(key)) observations.set(key, row)
      })
    await setTimeout(25)
  }
})()
let app
let result
try {
  app = await _electron.launch({
    executablePath: executable,
    args: [],
    chromiumSandbox: true,
    cwd: workspace,
    timeout: 120000,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LOGINOM_AI_AGENT_"))),
      HOME: home,
      XDG_CONFIG_HOME: join(home, "config"),
      XDG_DATA_HOME: join(home, "data"),
      XDG_CACHE_HOME: join(home, "cache"),
      LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
      LOGINOM_AI_AGENT_TEST_ROOT: profile,
      LOGINOM_AI_AGENT_PURE: "1",
      ...(collisions
        ? {
            LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({
              command: Object.fromEntries(reservedNames.map((name) => [name, { template: "UNTRUSTED COMMAND" }])),
            }),
          }
        : {}),
    },
  })
  const page = await app.firstWindow()
  const form = page.locator('[data-component="settings-loginom"]')
  await form.waitFor({ timeout: 120000 })
  if ((await form.locator("input:not([type=checkbox])").count()) !== 4) throw Error("FOUR_FIELDS_REQUIRED")
  const status = await page.evaluate(() => window.api.loginom.read())
  if (status.hasApiKey || status.state !== "unconfigured") throw Error("UNCONFIGURED_STATE_INVALID")
  const server = await page.evaluate(() => window.api.awaitInitialization())
  const response = await fetch(`${server.url}/skill?directory=${encodeURIComponent(workspace)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}` },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw Error(`SKILL_DISCOVERY_${response.status}`)
  const skills = await response.json()
  await writeFile(join(evidence, "catalog.json"), JSON.stringify(skills, null, 2))
  const bundled = skills.filter((skill) => skill.source === "bundled")
  if (
    JSON.stringify(bundled.map((skill) => skill.name).sort()) !== JSON.stringify(["loginom-automation", "package-docs"])
  )
    throw Error("PRODUCT_SKILLS_REQUIRED")
  if (bundled.some((skill) => !/^[a-f0-9]{64}$/.test(skill.digest))) throw Error("BUNDLED_PROVENANCE_REQUIRED")
  if (skills.some((skill) => skill.source !== "bundled" && skill.source !== "builtin"))
    throw Error("EXTERNAL_SKILL_IN_CLEAN_FIXTURE")
  const resources = await app.evaluate(() => process.resourcesPath)
  await page.screenshot({ path: join(evidence, "first-launch.png") })
  if (collisions) {
    await writeFile(join(evidence, "discovery-body.txt"), await page.locator("body").innerText())
    for (const name of reservedNames) {
      await page.getByText(`Ignored external skill '${name}':`, { exact: false }).waitFor({ timeout: 10000 })
    }
    await page.screenshot({ path: join(evidence, "skill-diagnostics.png") })
    const commandsResponse = await fetch(`${server.url}/command?directory=${encodeURIComponent(workspace)}`, {
      headers: { authorization: `Basic ${Buffer.from(`${server.username}:${server.password}`).toString("base64")}` },
      signal: AbortSignal.timeout(30000),
    })
    if (!commandsResponse.ok) throw Error(`COMMAND_DISCOVERY_${commandsResponse.status}`)
    const commands = await commandsResponse.json()
    await writeFile(join(evidence, "commands.json"), JSON.stringify(commands, null, 2))
    if (JSON.stringify(commands).includes("UNTRUSTED")) throw Error("RESERVED_COMMAND_REPLACED")
    if (commands.some((command) => command.name === "package_docs")) throw Error("OBSOLETE_COMMAND_REGISTERED")
    for (const name of reservedNames) {
      await page.getByText(`Ignored external command '${name}' from config:`, { exact: false }).waitFor({ timeout: 10000 })
    }
    await page.screenshot({ path: join(evidence, "command-diagnostics.png") })
  }
  await form.locator('[data-component="icon-button"][data-icon="close"]').click()
  await form.waitFor({ state: "hidden", timeout: 30000 })
  await page.locator('[data-component="prompt-input"][contenteditable="true"]').waitFor({ timeout: 60000 })
  const fileTypes = await page.locator('input[type="file"]').getAttribute("accept")
  await writeFile(join(evidence, "composer-file-types.json"), JSON.stringify({ accept: fileTypes }, null, 2))
  if (!fileTypes?.split(",").includes(".lgp")) throw Error("LOGINOM_PACKAGE_NOT_SELECTABLE")
  await page.screenshot({ path: join(evidence, "composer.png") })
  result = {
    status: "PASS",
    executable,
    resources,
    uid: process.getuid(),
    node: process.version,
    unconfiguredWizard: true,
    loginomPackageSelectable: true,
    reservedDiagnosticsVisible: collisions,
    skills: skills.map(({ name, source, digest, location }) => ({ name, source, digest, location })),
  }
} finally {
  if (app) {
    const page = app.windows()[0]
    if (page) {
      await writeFile(join(evidence, "final-body.txt"), await page.locator("body").innerText().catch(() => ""))
      await page.screenshot({ path: join(evidence, "final.png") }).catch(() => {})
    }
  }
  if (app) await app.close()
  await setTimeout(250)
  stopped = true
  await monitor
  const processes = [...observations.values()]
  const live = await Promise.all(
    processes.map(async (row) => {
      const stat = await readFile(`/proc/${row.pid}/stat`, "utf8").catch(() => "")
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      return fields[19] === row.start && !["Z", "X"].includes(fields[0]) ? row : undefined
    }),
  )
  await writeFile(
    join(evidence, "processes.json"),
    JSON.stringify({ samplingMs: 25, processes, remaining: live.filter(Boolean) }, null, 2),
  )
  await rm(root, { recursive: true, force: true })
  if (live.some(Boolean)) throw Error("CHILD_PROCESS_REMAINS")
  if (processes.some((row) => row.command.split(" ").includes("--no-sandbox"))) throw Error("SANDBOX_DISABLED")
  if (processes.some((row) => /browsers\/chromium-\d+\/.*\/chrome(?: |$)/.test(row.command)))
    throw Error("LOGINOM_BROWSER_STARTED")
  if (result) {
    await writeFile(
      join(evidence, "result.json"),
      JSON.stringify({ ...result, loginomBrowserObserved: false, processSamplingMs: 25 }, null, 2),
    )
    console.log(JSON.stringify(result))
  }
}
