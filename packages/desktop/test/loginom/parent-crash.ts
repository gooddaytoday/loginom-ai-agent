import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
const resources = join(import.meta.dir, "../../resources/loginom")
if (process.platform !== "linux") throw Error("LINUX_ONLY_TEST")
if (!process.env.LOGINOM_AI_AGENT_TEST_CONFIG) throw Error("PRIVATE_TEST_CONFIG_REQUIRED")
if (process.argv[2] === "child") {
  const config = await Bun.file(process.env.LOGINOM_AI_AGENT_TEST_CONFIG!).json()
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
  await new Promise(() => {})
}
const directory = await mkdtemp("/tmp/loginom-parent-crash-")
const child = Bun.spawn([process.execPath, import.meta.path, "child"], {
  env: { ...process.env, TEST_DIRECTORY: directory },
  stdout: "pipe",
  stderr: "pipe",
})
async function processes() {
  const rows = await Promise.all(
    (await readdir("/proc"))
      .filter((x) => /^\d+$/.test(x))
      .map(async (pid) => {
        const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
        const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
        return { pid: Number(pid), parent: Number(rest[1]), state: rest[0] }
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
  child.kill("SIGKILL")
  await child.exited
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (!(await processes()).some((x) => ids.has(x.pid) && x.state !== "Z")) {
      console.log(
        JSON.stringify({
          status: "PASS",
          scenario: "supervisor-parent-SIGKILL",
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
