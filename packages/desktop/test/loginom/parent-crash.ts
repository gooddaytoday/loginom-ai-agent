import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { mkdtemp, readdir, readFile, readlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
const resources = resolve(
  process.env.LOGINOM_AI_AGENT_TEST_RESOURCES ?? join(import.meta.dir, "../../resources/loginom"),
)
if (!(["linux", "win32"] as NodeJS.Platform[]).includes(process.platform)) throw Error("PLATFORM_NOT_SUPPORTED")
if (!process.env.LOGINOM_AI_AGENT_TEST_CONFIG) throw Error("PRIVATE_TEST_CONFIG_REQUIRED")
if (process.argv[2] === "child") {
  const config = await Bun.file(process.env.LOGINOM_AI_AGENT_TEST_CONFIG!).json()
  const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
  if (credentialProfile) {
    const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
    const secret = await cliCredentials("win32").decode(record.secrets)
    config.api_key = secret.apiKey
    config.loginom_url = record.url
    config.workflow_profile = { passwordless_login: secret.password === "", loginom_user: record.username }
  }
  if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
  const manifest = await Bun.file(join(resources, "resource-manifest.json")).json()
  const runtime = await supervise({
    node: join(resources, "bin/node"),
    entry: join(resources, "runtime/src/managed-entry.mjs"),
    resources,
    stateDir: process.env.TEST_DIRECTORY!,
    generation: 1,
    chat: "crash-acceptance",
    headless: true,
    connection: {
      apiKey: config.api_key,
      password: "",
      url: config.loginom_url,
      username: config.workflow_profile.loginom_user,
    },
    endpoint: manifest.endpoint,
    actionManifestUri: manifest.actionManifestUri,
    actionManifestSha256: manifest.actionManifestSha256,
  })
  console.log("READY")
  if (process.env.TEST_CRASH_TARGET !== "parent") {
    try {
      while (true) {
        await runtime.request(
          "call",
          { name: "dock_workspace_observe", arguments: { scope: "roots" } },
          15_000,
        )
        await Bun.sleep(250)
      }
    } catch {
      await runtime.close().catch(() => undefined)
      console.log("DISCONNECTED")
      process.exit(0)
    }
  }
  await new Promise(() => {})
}
const target = process.argv[2] ?? "parent"
if (!(["parent", "runtime", "browser"] as const).includes(target as "parent")) throw Error("CRASH_TARGET_INVALID")
const directory = await mkdtemp(join(tmpdir(), "loginom-parent-crash-"))
const child = Bun.spawn([process.execPath, import.meta.path, "child"], {
  env: { ...process.env, TEST_DIRECTORY: directory, TEST_CRASH_TARGET: target },
  stdout: "pipe",
  stderr: "pipe",
})
async function processes() {
  if (process.platform === "win32") {
    const result = Bun.spawnSync([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
    ])
    if (result.exitCode !== 0) throw Error("WINDOWS_PROCESS_SNAPSHOT_FAILED")
    const parsed = JSON.parse(result.stdout.toString())
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
      pid: Number(row.ProcessId),
      parent: Number(row.ParentProcessId),
      state: "R",
      executable: String(row.ExecutablePath ?? ""),
      command: String(row.CommandLine ?? ""),
    }))
  }
  const rows = await Promise.all(
    (await readdir("/proc"))
      .filter((x) => /^\d+$/.test(x))
      .map(async (pid) => {
        const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
        const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
        return {
          pid: Number(pid),
          parent: Number(rest[1]),
          state: rest[0],
          executable: await readlink(`/proc/${pid}/exe`).catch(() => ""),
          command: await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""),
        }
      }),
  )
  return rows
}
try {
  const reader = child.stdout.getReader()
  const timer = setTimeout(() => child.kill(), 180000)
  const first = await reader.read()
  clearTimeout(timer)
  if (!new TextDecoder().decode(first.value).includes("READY")) throw Error("RUNTIME_NOT_READY")
  const rows = await processes()
  const ids = new Set([child.pid])
  for (let i = 0; i < 10; i++) rows.filter((x) => ids.has(x.parent)).forEach((x) => ids.add(x.pid))
  if (ids.size < 4) throw Error("BROWSER_TREE_NOT_FOUND")
  const victim =
    target === "parent"
      ? child.pid
      : target === "runtime"
        ? rows.find((row) => ids.has(row.pid) && /managed-entry\.mjs/i.test(row.command))?.pid
        : rows.find(
            (row) =>
              ids.has(row.pid) &&
              /(?:^|[\\/])chrome(?:\.exe)?$/i.test(row.executable) &&
              /--user-data-dir=/i.test(row.command) &&
              !/--type=/i.test(row.command),
          )?.pid
  if (!victim) throw Error("CRASH_TARGET_NOT_FOUND")
  if (process.platform === "win32") {
    const killed = Bun.spawnSync(["taskkill.exe", "/F", "/PID", String(victim)])
    if (killed.exitCode !== 0) throw Error("PARENT_FORCE_KILL_FAILED")
  } else process.kill(victim, "SIGKILL")
  const exitTimer = setTimeout(() => child.kill(), 45_000)
  await child.exited
  clearTimeout(exitTimer)
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (!(await processes()).some((x) => ids.has(x.pid) && x.state !== "Z")) {
      console.log(
        JSON.stringify({
          status: "PASS",
          scenario: `supervisor-${target}-${process.platform === "win32" ? "taskkill" : "SIGKILL"}`,
          victim,
          trackedProcesses: ids.size,
          liveDescendants: 0,
        }),
      )
      process.exitCode = 0
      break
    }
    await Bun.sleep(250)
  }
  if ((await processes()).some((x) => ids.has(x.pid) && x.state !== "Z")) throw Error("LIVE_ORPHANS_REMAIN")
} finally {
  child.kill()
  await rm(directory, { recursive: true, force: true })
}
