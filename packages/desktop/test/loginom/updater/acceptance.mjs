import { createRequire } from "node:module"
import { readFile, writeFile, mkdir, cp, readdir, chmod, readlink, rm } from "node:fs/promises"
import { join, resolve, isAbsolute } from "node:path"
import { randomUUID } from "node:crypto"
const root = process.env.LOGINOM_AI_AGENT_UPDATE_TEST_ROOT
if (!root || !isAbsolute(root)) throw Error("ABSOLUTE_UPDATE_TEST_ROOT_REQUIRED")
const project = resolve(import.meta.dirname, "../../..")
const require = createRequire(join(project, "../loginom-runtime/client/package.json"))
const { _electron } = require("playwright-core")
const profile = join(root, "profile-" + randomUUID()),
  marker = randomUUID()
const installed = join(root, "installed", "loginom-ai-agent-linux-x86_64.AppImage")
await mkdir(join(root, "installed"), { recursive: true })
await mkdir(join(profile, "workspace"), { recursive: true, mode: 0o700 })
await cp(join(root, "output-0.1.0", "loginom-ai-agent-linux-x86_64.AppImage"), installed)
await chmod(installed, 0o755)
const mode = (value) => writeFile(join(root, "mode"), value)
const launch = () =>
  _electron.launch({
    executablePath: installed,
    args: [],
    timeout: 120000,
    env: {
      ...process.env,
      APPIMAGE_EXTRACT_AND_RUN: "1",
      LOGINOM_AI_AGENT_UPDATE_TEST: marker,
      HOME: profile,
      XDG_CONFIG_HOME: join(profile, "config"),
      XDG_DATA_HOME: join(profile, "data"),
      XDG_CACHE_HOME: join(profile, "cache"),
      XDG_STATE_HOME: join(profile, "state"),
    },
  })
async function stopOwned() {
  const lock = await readlink(join(profile, "config/com.loginom.aiagent/SingletonLock")).catch(() => "")
  const pid = Number(lock.match(/-(\d+)$/)?.[1])
  if (!pid) return 0
  const cmd = await readFile("/proc/" + pid + "/cmdline").catch(() => Buffer.alloc(0))
  if (!cmd.includes(Buffer.from("/loginom-ai-agent"))) return 0
  const rows = await Promise.all(
    (await readdir("/proc"))
      .filter((x) => /^\d+$/.test(x))
      .map(async (id) => {
        const stat = await readFile("/proc/" + id + "/stat", "utf8").catch(() => "")
        return { pid: Number(id), parent: Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]) }
      }),
  )
  const owned = new Set([pid])
  for (let i = 0; i < 10; i++) rows.filter((row) => owned.has(row.parent)).forEach((row) => owned.add(row.pid))
  for (const id of [...owned].reverse()) {
    try {
      process.kill(id, "SIGKILL")
    } catch {}
  }
  return owned.size
}
await mode("upstream")
await rm(join(root, "report.json"), { force: true })
const reports = []
const app = await launch()
const applicationProcess = app.process()
try {
  const page = await app.firstWindow()
  await page.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120000 })
  const initial = await page.evaluate(() => window.api.updater.check())
  if (initial.status !== "error") throw Error("UPSTREAM_TARGET_NOT_REJECTED_" + initial.status)
  await page.evaluate(() => window.api.storeSet("default.dat", "update-qa", "retained"))
  const session = await page.evaluate(
    async (directory) => {
      const server = await window.api.awaitInitialization()
      const headers = {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa((server.username ?? "") + ":" + (server.password ?? "")),
      }
      const created = await fetch(server.url + "/session?directory=" + encodeURIComponent(directory), {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Updater acceptance" }),
      })
      if (!created.ok) throw Error("SESSION_CREATE_FAILED_" + created.status)
      const session = await created.json()
      const posted = await fetch(
        server.url + "/session/" + session.id + "/message?directory=" + encodeURIComponent(directory),
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            noReply: true,
            model: { providerID: "openai", modelID: "gpt-4.1" },
            parts: [{ type: "text", text: "Persistent updater acceptance message" }],
          }),
        },
      )
      if (!posted.ok) throw Error("MESSAGE_ADMISSION_FAILED_" + posted.status)
      return session.id
    },
    join(profile, "workspace"),
  )
  console.log("PASS upstream target rejected; persistent setting and chat admitted without model execution")
  await mode("channel")
  const channel = await page.evaluate(() => window.api.updater.check())
  if (channel.status === "ready") throw Error("FOREIGN_CHANNEL_ACCEPTED")
  await mode("corrupt")
  const corrupt = await page.evaluate(() => window.api.updater.check())
  if (corrupt.status !== "error") throw Error("CORRUPT_PAYLOAD_ACCEPTED_" + corrupt.status)
  if ((await app.evaluate(({ app }) => app.getVersion())) !== "0.1.0") throw Error("VERSION_CHANGED_AFTER_REJECTION")
  console.log("PASS beta channel and corrupt payload do not replace the running version")
  await mode("good")
  const good = await page.evaluate(() => window.api.updater.check())
  if (good.status !== "ready" || good.version !== "0.1.1") throw Error("VALID_UPDATE_NOT_READY_" + good.status)
  const mainPid = await app.evaluate(() => process.pid)
  await page
    .evaluate(() => window.api.updater.install())
    .catch((error) => {
      if (!/closed|destroyed/i.test(error.message)) throw error
    })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const stat = await readFile("/proc/" + mainPid + "/stat", "utf8").catch(() => "")
    if (!stat || stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z")) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const remaining = await readFile("/proc/" + mainPid + "/stat", "utf8").catch(() => "")
  if (remaining && !remaining.slice(remaining.lastIndexOf(")") + 2).startsWith("Z"))
    throw Error("OLD_MAIN_DID_NOT_EXIT")
  await new Promise((resolve) => setTimeout(resolve, 7000))
  console.log("Updated main exited; checking the installed version")
  const relaunched = await stopOwned()
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const next = await launch()
  console.log("Updated instance connected")
  try {
    const page = await next.firstWindow()
    await page.locator('[data-component="settings-loginom"]').waitFor({ timeout: 120000 })
    const version = await next.evaluate(({ app }) => app.getVersion())
    if (version !== "0.1.1") throw Error("INSTALLED_VERSION_INVALID_" + version)
    if ((await page.evaluate(() => window.api.storeGet("default.dat", "update-qa"))) !== "retained")
      throw Error("SETTINGS_LOST")
    const messages = await page.evaluate(
      async ({ session, directory }) => {
        const server = await window.api.awaitInitialization()
        const response = await fetch(
          server.url + "/session/" + session + "/message?directory=" + encodeURIComponent(directory),
          { headers: { Authorization: "Basic " + btoa((server.username ?? "") + ":" + (server.password ?? "")) } },
        )
        if (!response.ok) throw Error("CHAT_READ_FAILED_" + response.status)
        return response.json()
      },
      { session, directory: join(profile, "workspace") },
    )
    if (!JSON.stringify(messages).includes("Persistent updater acceptance message")) throw Error("CHAT_LOST")
    reports.push({
      status: "PASS",
      from: "0.1.0",
      to: version,
      settingsPreserved: true,
      chatMessagePreserved: true,
      upstreamRejected: true,
      betaRejected: true,
      corruptionRejected: true,
      relaunchProcesses: relaunched,
      fixtureOnly: true,
    })
  } finally {
    await next.close()
  }
} finally {
  await stopOwned()
  applicationProcess.kill("SIGKILL")
  await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))])
}

await writeFile(join(root, "report.json"), JSON.stringify(reports[0], null, 2))
console.log("PASS actual AppImage replacement 0.1.0 -> 0.1.1; settings and chat message preserved")
