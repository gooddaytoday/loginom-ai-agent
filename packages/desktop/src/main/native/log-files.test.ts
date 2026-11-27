import { afterEach, expect, jest, setSystemTime, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LOG_DAY_MS, redactLogValues, retainedLogs } from "@loginom-ai-agent/loginom-host/local-logs"
import { monitorServiceCrashes } from "./crash-logging"

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
      monitor.watch(child.pid)

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
