import { afterEach, expect, jest, setSystemTime, test } from "bun:test"
import { spawn } from "node:child_process"
import { once } from "node:events"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LOG_DAY_MS, redactLogValues, retainedLogs } from "@loginom-ai-agent/loginom-host/local-logs"
import electronLog from "electron-log/node.js"
import { markCrashSession, monitorServiceCrashes, type CrashReport } from "./crash-logging"
import { redactElectronLog } from "./log-redaction"
import { createLogFiles, NET_LOG_SIZE } from "./log-retention"

const roots: string[] = []

const MiB = 1024 * 1024

afterEach(() => {
  setSystemTime()
  jest.useRealTimers()
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function temporaryLogs() {
  const root = mkdtempSync(join(tmpdir(), "desktop-logs-"))
  roots.push(root)

  return root
}

test("retention removes expired files and then the oldest logs until within 100 MiB", () => {
  const root = temporaryLogs()
  const run = join(root, "previous-run")
  mkdirSync(run)
  const now = Date.now()

  const put = (name: string, size: number, days: number) => {
    const file = join(run, name)
    writeFileSync(file, "")
    truncateSync(file, size)
    utimesSync(file, new Date(now - days * LOG_DAY_MS), new Date(now - days * LOG_DAY_MS))
  }

  put("expired.log", MiB, 8)
  put("oldest.log", 40 * MiB, 3)
  put("window.log", 50 * MiB, 2)
  put("service.log", 50 * MiB, 1)
  put("other.json", 1, 8)

  const logs = retainedLogs(root, 100 * MiB)
  logs.prune()
  expect(readdirSync(run).sort()).toEqual(["other.json", "service.log", "window.log"])

  setSystemTime(new Date(now + 6 * LOG_DAY_MS))
  logs.prune()
  expect(readdirSync(run).sort()).toEqual(["other.json", "service.log"])
})

test.each(["renderer", "service"])("a busy %s log rotates and the new file keeps the latest message", (name) => {
  const root = temporaryLogs()
  const target = join(root, `${name}.log`)
  const older = join(root, `${name}.old.log`)
  writeFileSync(target, "previous output")
  truncateSync(target, 5 * MiB)

  const logs = retainedLogs(root, 100 * MiB)
  logs.prune()
  logs.append(target, "latest output")

  expect(readFileSync(target, "utf8")).toBe("latest output\n")
  expect(statSync(older).size).toBe(5 * MiB)
})

test("persisted messages mask inline and structured credentials and keep diagnostic context", () => {
  const root = temporaryLogs()
  const target = join(root, "main.log")
  const secret = "fixture-desktop-secret"
  const logs = retainedLogs(root, 100 * MiB)

  const entry = redactLogValues(
    [
      `login failed password=${secret}`,
      { request: { headers: { authorization: "Bearer fixture-header-value", cookie: "fixture-cookie" } } },
      new Error(`failed to connect: ${secret}`),
    ],
    [secret],
  )

  logs.append(target, JSON.stringify(entry))

  const text = readFileSync(target, "utf8")
  expect(text).toContain("login failed")
  expect(text).toContain("failed to connect")
  expect(text).toContain("[redacted]")

  for (const value of [secret, "fixture-header-value", "fixture-cookie"]) expect(text).not.toContain(value)
})

test("an uncaught main error is persisted to crash.log before Node exits", () => {
  const root = temporaryLogs()
  const file = join(root, "crash.log")
  const monitor = new URL("./crash-logging.ts", import.meta.url).href
  const logging = new URL("../../../../loginom-host/src/local-logs.ts", import.meta.url).href

  const child = Bun.spawnSync(
    [
      process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "node",
      "--input-type=module",
      "-e",
      `import { monitorMainCrashes } from ${JSON.stringify(monitor)}
     import { retainedLogs, redactLogValues } from ${JSON.stringify(logging)}
     const logs = retainedLogs(${JSON.stringify(root)}, 100 * 1024 * 1024)
     monitorMainCrashes((message, details) =>
       logs.append(${JSON.stringify(file)}, JSON.stringify(redactLogValues([message, details]))))
     setImmediate(() => { throw new Error("fixture uncaught password=fixture-crash-secret") })`,
    ],
    {
      env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root },
      stderr: "pipe",
    },
  )

  expect(child.exitCode).toBe(1)
  const text = readFileSync(file, "utf8")
  expect(text).toContain("unhandled main process error")
  expect(text).toContain("fixture uncaught")
  expect(text).toContain("[redacted]")
  expect(text).not.toContain("fixture-crash-secret")
})

test("a detached service exit is reported once, while a planned stop is silent", async () => {
  const root = temporaryLogs()
  const file = join(root, "crash.log")
  const logs = retainedLogs(root, 100 * MiB)
  const monitor = monitorServiceCrashes((message, details) => logs.append(file, JSON.stringify({ message, details })))
  jest.useFakeTimers()

  for (const planned of [false, true]) {
    const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
      env: { PATH: process.env.PATH, HOME: root, USERPROFILE: root },
      stdout: "ignore",
      stderr: "ignore",
    })

    try {
      monitor.watch("http://localhost", { url: "http://localhost", pid: child.pid })

      if (planned) monitor.stop()
    } finally {
      child.kill()
      await child.exited
    }

    jest.advanceTimersByTime(2000)
  }

  monitor.stop()
  const entries = readFileSync(file, "utf8").trim().split("\n")
  expect(entries).toHaveLength(1)
  expect(JSON.parse(entries[0])).toMatchObject({ message: "background service exited unexpectedly" })
})

test("retains 60 MiB of desktop logs and 20 MiB of service logs alongside the reserved active NetLog", async () => {
  const root = temporaryLogs()
  const physicalRoot = join(root, "physical")
  const linkedRoot = join(root, "logs")
  const outside = join(root, "outside")
  mkdirSync(physicalRoot)
  mkdirSync(outside)
  symlinkSync(physicalRoot, linkedRoot, "junction")
  const logs = createLogFiles(linkedRoot)
  const service = join(linkedRoot, "service")
  const oldRun = join(linkedRoot, "old-run")
  const old = new Date(Date.now() - LOG_DAY_MS)
  const expired = new Date(Date.now() - 8 * LOG_DAY_MS)

  const put = (dir: string, name: string, size: number, time = new Date()) => {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, name)
    writeFileSync(file, "")
    truncateSync(file, size * MiB)
    utimesSync(file, time, time)

    return file
  }

  const desktopEvicted = put(oldRun, "main.log", 1, old)
  const desktopKept = put(logs.run, "main.log", 60)
  const activeNetLog = put(logs.run, "network.netlog", NET_LOG_SIZE / MiB, expired)
  const serviceEvicted = put(service, "service-old.log", 1, old)
  const serviceKept = put(service, "service-current.log", 20)
  const outsideLog = put(outside, "foreign.log", 1, expired)
  symlinkSync(outside, join(linkedRoot, "foreign"), "junction")
  await logs.prune()
  expect(existsSync(desktopEvicted)).toBe(false)
  expect(existsSync(serviceEvicted)).toBe(false)
  expect(statSync(desktopKept).size).toBe(60 * MiB)
  expect(statSync(activeNetLog).size).toBe(20 * MiB)
  expect(statSync(serviceKept).size).toBe(20 * MiB)
  expect(existsSync(outsideLog)).toBe(true)
})

test("session marker reports a previous abrupt exit and only the new Crashpad dumps", async () => {
  const root = temporaryLogs()
  const dumps = join(root, "Crashpad")
  const pending = join(dumps, "pending")
  mkdirSync(pending, { recursive: true })
  const stale = join(pending, "stale.dmp")
  writeFileSync(stale, "old")
  const old = new Date(Date.now() - LOG_DAY_MS)
  utimesSync(stale, old, old)

  const script = `import { markCrashSession } from ${JSON.stringify(join(import.meta.dir, "crash-logging.ts"))}
    markCrashSession(${JSON.stringify(root)}, "first", ${JSON.stringify(dumps)}, () => {})
    process.exit(19)`

  const child = Bun.spawn([process.execPath, "-e", script], { stdout: "ignore", stderr: "inherit" })
  expect(await child.exited).toBe(19)
  const recent = join(pending, "recent.dmp")
  writeFileSync(recent, "new")
  const future = new Date(Date.now() + 1000)
  utimesSync(recent, future, future)
  const entries: unknown[] = []
  const report: CrashReport = (message, data) => entries.push({ message, data })
  markCrashSession(root, "second", dumps, report)()
  markCrashSession(root, "third", dumps, report)()
  expect(entries).toEqual([{ message: "previous session ended unexpectedly", data: { run: "first", dumps: [join("pending", "recent.dmp")] } }])
})

test("electron-log hooks mask OAuth and URL credentials before the transport receives a message", () => {
  const logger = electronLog.create({ logId: "test-sensitive-logs" })
  logger.hooks.push(redactElectronLog(() => []))
  logger.transports.console.level = false
  logger.transports.file.level = false
  const entries: unknown[][] = []
  logger.transports.capture = (message: Parameters<typeof logger.transports.file>[0]) => entries.push(message.data)
  const key = `AIza${"Z".repeat(35)}`
  logger.info({ type: "oauth", access: "fixture-oauth-access", refresh: "fixture-oauth-refresh" },
    `https://example.test/?access_token=fixture-bearer&key=${key}&page=2`)
  expect(entries).toEqual([[{ type: "oauth", access: "[redacted]", refresh: "[redacted]" },
    "https://example.test/?access_token=%5Bredacted%5D&key=%5Bredacted%5D&page=2"]])
})

test("the service monitor reports exit codes for the adopted child and stays silent on version replacement", async () => {
  const root = temporaryLogs()
  const statuses: unknown[] = []
  const monitor = monitorServiceCrashes((_message, details) => statuses.push(details))
  const url = "http://localhost"
  const expected: unknown[] = []

  for (const scenario of ["mismatched registration", "version replacement", "unexpected exit", "exit before adoption"]) {
    const child = spawn(process.execPath, ["-e", "process.exit(27)"], { cwd: root, stdio: "ignore" })
    monitor.onSpawn(child)

    if (child.pid === undefined) throw Error("Service fixture did not start")
    const pid = child.pid
    const exited = once(child, "exit")

    if (scenario === "exit before adoption") await exited
    monitor.watch(url, { url: scenario === "mismatched registration" ? "http://other-host" : url, pid })
    monitor.onStart(scenario === "version replacement" ? "version-mismatch" : "missing")
    await exited

    if (scenario === "unexpected exit" || scenario === "exit before adoption") expected.push({ pid, exitCode: 27, signal: null })
    expect(statuses).toEqual(expected)
  }
})
