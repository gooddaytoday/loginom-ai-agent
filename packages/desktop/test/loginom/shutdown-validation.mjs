import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, openSync, readFileSync } from "node:fs"
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

// LIFE-01 on an installed build (decision В-87): the window's own service (`service-desktop.json`, B4.9) stops with the
// application (B4.10). Opt-in native acceptance, run by docker/run-matrix.ts `--shutdown <runs>` as UID 1200 without
// network, in the current home: a clean one or a profile the caller prepared. Each case runs `runs` times: the user
// closes the last window, then SIGTERM to the main process. Every launch after the first is a relaunch and must start
// the service again. 5 s after the exit nothing of the run is left: not the service, its Node host or the Host's
// runtimes and browsers, not Electron; the registration file is gone, the service and DevTools ports are closed. A
// connection the first launch had (the Host starts Help for it) must be there on every relaunch.
const root = process.env.LOGINOM_AI_AGENT_INSTALL_ROOT

const slug = process.env.LOGINOM_AI_AGENT_TEST_SLUG

if (!root || !slug) throw Error("Set LOGINOM_AI_AGENT_INSTALL_ROOT and LOGINOM_AI_AGENT_TEST_SLUG")

const executable = process.env.LOGINOM_AI_AGENT_EXECUTABLE ?? join(root, slug)

const runs = Number(process.env.LOGINOM_AI_AGENT_TEST_RUNS ?? 3)

const report = process.env.LOGINOM_AI_AGENT_TEST_REPORT

const home = homedir()

const registration = join(home, ".local/state", slug, "service-desktop.json")

const data = join(home, ".local/share", slug)

const debug = 29410

const observations = []

const previous = { service: 0, help: undefined }

try {
  for (const quit of ["close", "sigterm"])
    for (let run = 1; run <= runs; run++) observations.push(await launch(quit, run))
} catch (error) {
  observations.push({ status: "FAIL", failure: error.message })
}

const status = observations.every((item) => item.status === "PASS") ? "PASS" : "FAIL"

const result = {
  status,
  slug,
  runs,
  connection: existsSync(join(data, "loginom", "connection", "connection.json")),
  observations,
}

if (report) await writeFile(report, JSON.stringify(result, null, 2) + "\n")

console.log(JSON.stringify(result))

if (status !== "PASS") process.exitCode = 1

async function launch(quit, run) {
  const relaunch = previous.service !== 0
  const started = Date.now()

  const app = spawn(executable, [`--remote-debugging-port=${debug}`], {
    stdio: ["ignore", openSync(join(home, `app-${quit}-${run}.log`), "w"), "inherit"],
  })

  const observation = { case: quit, run, relaunch, status: "FAIL" }

  try {
    // A fresh registration of a new service, not the file of the previous launch.
    const service = await until("SERVICE_NOT_STARTED", 120_000, async () => {
      const value = JSON.parse(await readFile(registration, "utf8"))

      return (
        value.pid !== previous.service &&
        alive(value.pid) &&
        (await stat(registration)).mtimeMs >= started - 1000 &&
        value
      )
    })

    observation.service = { pid: service.pid, previous: previous.service || undefined }
    const auth = { authorization: "Basic " + Buffer.from("loginom-ai-agent:" + service.password).toString("base64") }
    await until("SERVICE_NOT_ANSWERING", 60_000, () =>
      fetch(new URL("/api/info", service.url), { headers: auth }).then(
        (response) => response.ok,
        () => false,
      ),
    )
    await until("WINDOW_NOT_CONNECTED", 120_000, () => windowConnected(started))
    // The service starts its Node host at boot; with a connection the Host then starts Help for the active generation.
    await until("HOST_NOT_STARTED", 120_000, async () =>
      (await owned(app.pid, service.pid)).some((item) => item.role === "node-host"),
    )
    const connected = existsSync(join(data, "loginom", "connection", "connection.json"))

    if (connected)
      await until("HELP_NOT_STARTED", 180_000, async () =>
        (await owned(app.pid, service.pid)).some((item) => item.role === "help"),
      )
    await sleep(3000)
    const before = await owned(app.pid, service.pid)
    const help = before.some((item) => item.role === "help")

    if (previous.help !== undefined && help !== previous.help) throw Error("CONNECTION_NOT_KEPT")
    observation.before = roles(before)
    const quitted = Date.now()

    if (quit === "close") await evaluate("setTimeout(() => window.close(), 50), true")
    else process.kill(app.pid, "SIGTERM")

    const [code, signal] = await Promise.race([
      app.exitCode === null ? once(app, "exit") : [app.exitCode, app.signalCode],
      sleep(100_000, ["timeout"], { ref: false }),
    ])

    observation.exit = { code, signal, ms: Date.now() - quitted }

    if (code !== 0 || signal) throw Error("DESKTOP_EXIT_UNCONFIRMED")
    await sleep(5000)

    const remaining = [
      ...before.filter((item) => alive(item.pid)),
      ...(await owned(0, 0)).filter((item) => !before.some((entry) => entry.pid === item.pid)),
    ]

    observation.remaining = remaining.map((item) => `${item.pid}:${item.role}`)

    if (remaining.length) throw Error("OWN_PROCESSES_REMAIN: " + observation.remaining.join(" "))
    observation.registration = existsSync(registration) ? "present" : "removed"

    if (existsSync(registration)) throw Error("REGISTRATION_REMAINS")
    const open = await listening([Number(new URL(service.url).port), debug])

    if (open.length) throw Error("OWN_PORTS_STILL_LISTENING: " + open.join(" "))
    previous.service = service.pid
    previous.help = help
    observation.status = "PASS"

    return observation
  } catch (error) {
    observation.failure = error.message

    // Leave nothing for the next run: a failed observation still stops everything this launch started.
    for (const item of await owned(app.pid, observation.service?.pid ?? 0)) process.kill(item.pid, "SIGKILL")
    previous.service = observation.service?.pid ?? previous.service

    return observation
  }
}

// The window's own log of this launch says that it reached the service.
async function windowConnected(started) {
  const logs = join(home, ".config", appId(), "logs")

  for (const run of await readdir(logs)) {
    const file = join(logs, run, "main.log")

    if ((await stat(file)).mtimeMs < started) continue

    if ((await readFile(file, "utf8")).includes("v2 CLI background service ready")) return true
  }

  return false
}

function appId() {
  return (
    { "loginom-ai-agent": "com.loginom.aiagent", "loginom-ai-agent-beta": "com.loginom.aiagent.beta" }[slug] ??
    "com.loginom.aiagent.dev"
  )
}

// Processes of the run: descendants of the application and of its service (detached, so it may outlive the
// application's tree), and anything started from the installation or the home, such as the service's copy of the CLI
// in userData or a crash handler reparented outside the tree.
async function owned(app, service) {
  const table = await processes()
  const mine = new Set([app, service].filter(Boolean))

  for (const entry of table)
    if (entry.args.startsWith(root + "/") || entry.args.includes(home + "/")) mine.add(entry.pid)

  for (let changed = true; changed; ) {
    changed = false

    for (const entry of table)
      if (mine.has(entry.parent) && !mine.has(entry.pid)) {
        mine.add(entry.pid)
        changed = true
      }
  }

  return table
    .filter((entry) => mine.has(entry.pid) && entry.pid !== process.pid)
    .map((entry) => ({ pid: entry.pid, role: role(entry.args, entry.pid === service) }))
}

function role(args, service) {
  if (service) return "service"

  if (args.includes("knowledge-entry.mjs")) return "help"

  if (args.includes("node-host.mjs")) return "node-host"

  if (args.includes("/resources/loginom/browsers/")) return "browser"

  if (args.includes("/resources/loginom/")) return "runtime"

  if (args.startsWith(root + "/")) return "electron"

  return "other"
}

function roles(list) {
  return Object.fromEntries(
    Object.entries(Object.groupBy(list, (item) => item.role)).map(([key, value]) => [key, value.length]),
  )
}

// /proc rather than ps: the slim images have no procps.
async function processes() {
  const pids = (await readdir("/proc")).filter((name) => /^\d+$/.test(name))

  const entries = await Promise.all(
    pids.map(async (pid) => {
      const [stat, cmdline] = await Promise.all([
        readFile(`/proc/${pid}/stat`, "utf8").catch(() => ""),
        readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""),
      ])

      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")

      if (!stat || fields[0] === "Z") return []

      return [{ pid: Number(pid), parent: Number(fields[1]), args: cmdline.replaceAll("\0", " ").trim() }]
    }),
  )

  return entries.flat()
}

// A zombie is gone: it waits only for its parent (tini in the container) to reap it.
function alive(pid) {
  try {
    return !/\) Z /.test(readFileSync(`/proc/${pid}/stat`, "utf8"))
  } catch {
    return false
  }
}

async function listening(ports) {
  const tables = await Promise.all(
    ["/proc/net/tcp", "/proc/net/tcp6"].map((file) => readFile(file, "utf8").catch(() => "")),
  )

  const open = new Set(
    tables
      .join("\n")
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((fields) => fields[3] === "0A")
      .map((fields) => parseInt(fields[1].split(":")[1], 16)),
  )

  return ports.filter((port) => open.has(port))
}

async function evaluate(expression) {
  const targets = await (
    await fetch(`http://127.0.0.1:${debug}/json/list`, { signal: AbortSignal.timeout(2000) })
  ).json()

  await Promise.all(
    targets
      .filter((item) => item.type === "page" && !item.url.startsWith("devtools://"))
      .map(async (target) => {
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await once(socket, "open")
        socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression } }))
        await sleep(300)
        socket.close()
      }),
  )
}

async function until(code, timeout, probe) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const value = await probe().catch(() => undefined)

    if (value) return value
    await sleep(250)
  }

  throw Error(code)
}
