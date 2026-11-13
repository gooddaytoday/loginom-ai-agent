import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js"

const profile = mkdtempSync(join(tmpdir(), "loginom-log-export-"))
const previousDataHome = process.env.XDG_DATA_HOME
process.env.XDG_DATA_HOME = join(profile, "data")
const previousDockHome = process.env.LOGINOM_DOCK_HOME
process.env.LOGINOM_DOCK_HOME = join(profile, "dock")
const sourceSHA = process.env.LOGINOM_AI_AGENT_TEST_SOURCE_SHA ?? "a".repeat(40)
const paths = {
  userData: join(profile, "desktop"),
  downloads: join(profile, "downloads"),
  crashDumps: join(profile, "crash"),
}
const scoped = { info() {}, warn() {}, error() {} }
const saveDialogs: Array<{ defaultPath: string }> = []
let saveChoice: { canceled: boolean; filePath?: string } = { canceled: true }
// Runs while the native Save as dialog is open.
let duringSaveDialog: (() => Promise<void>) | undefined
// The net log pauses export; a test can hold that pause to order overlapping prepares.
const netLog: {
  currentlyLogging: boolean
  stopLogging?: () => Promise<void>
  startLogging?: () => Promise<void>
} = { currentlyLogging: false }
mock.module("electron", () => ({
  // electron-store also imports Electron's CJS default while loading the full
  // Desktop suite. In Bun it is a binary path, with no main-process members.
  default: {},
  app: {
    getPath: (key: keyof typeof paths) => paths[key],
    getVersion: () => "0.3.8",
    getName: () => "Loginom AI Agent",
    isPackaged: true,
  },
  netLog,
  shell: { showItemInFolder() {} },
  crashReporter: {},
  dialog: {
    showSaveDialog: async (options: { defaultPath: string }) => {
      saveDialogs.push(options)
      await duringSaveDialog?.()
      return saveChoice
    },
  },
}))
mock.module("electron-log/main.js", () => ({
  default: {
    transports: { file: {}, console: {} },
    initialize() {},
    errorHandler: { startCatching() {} },
    scope: () => scoped,
  },
}))
mock.module("./constants", () => ({ CHANNEL: "prod", BUILD_SOURCE: { sourceSHA, sourceDirty: false } }))
const { exportDebugLogs, initLogging, parseDiagnosticsRequest, prepareDiagnostics, previewDiagnosticsFile, saveDiagnostics } =
  await import("./logging")

const attempt = "generations/1/chats/chat-hash/attempts/last/execution-events.jsonl"
const diagnostic = "diagnostics/session-hash/events.jsonl"
function put(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
function runtime(name: string) {
  return join(paths.userData, "loginom/runtime", name)
}
async function exported() {
  const output = await exportDebugLogs()
  const reader = new ZipReader(new BlobReader(new Blob([readFileSync(output)])))
  try {
    const files = new Map<string, string>()
    for (const entry of await reader.getEntries()) {
      if (!entry.directory) files.set(entry.filename, await entry.getData!(new TextWriter()))
    }
    return { output, files, manifest: JSON.parse(files.get("manifest.json")!) }
  } finally {
    await reader.close()
  }
}
beforeEach(() => {
  duringSaveDialog = undefined
  netLog.currentlyLogging = false
  delete netLog.stopLogging
  delete netLog.startLogging
  rmSync(profile, { recursive: true, force: true })
  for (const dir of Object.values(paths)) mkdirSync(dir, { recursive: true })
  initLogging()
})
afterAll(() => {
  mock.restore()
  if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = previousDataHome
  if (previousDockHome === undefined) delete process.env.LOGINOM_DOCK_HOME
  else process.env.LOGINOM_DOCK_HOME = previousDockHome
  rmSync(profile, { recursive: true, force: true })
})

test("the Desktop export masks the Dock configuration api_key", async () => {
  put(join(profile, "dock", "config.json"), JSON.stringify({ api_key: "fixture-dock-desktop-value" }))
  put(runtime(attempt), JSON.stringify({ event: "echo", text: "fixture-dock-desktop-value" }) + "\n")
  const { files } = await exported()
  expect(files.has(`runtime/${attempt}`)).toBe(true)
  expect([...files.values()].join("\n")).not.toContain("fixture-dock-desktop-value")
})

test("the existing Desktop export includes runtime, diagnostics and build provenance with verifiable hashes", async () => {
  put(
    runtime(attempt),
    JSON.stringify({
      event: "node_step_completed",
      path: join(homedir(), "work/input.csv"),
      api_key: "fixture-api-secret",
    }) + "\n",
  )
  put(runtime(diagnostic), JSON.stringify({ event: "tool.full_result", password: "fixture-login-password" }) + "\n")
  put(join(paths.userData, "logs/current/main.log"), "Authorization: Bearer fixture-access-token\n")
  // Runtime keeps its latest attempt even when the user exports days later.
  const old = new Date(Date.now() - 3 * 86400_000)
  utimesSync(runtime(attempt), old, old)
  const { files, manifest } = await exported()
  expect(files.has(`runtime/${attempt}`)).toBe(true)
  expect(files.has(`runtime/${diagnostic}`)).toBe(true)
  expect(manifest).toMatchObject({
    version: "0.3.8",
    channel: "prod",
    sourceSHA,
    sourceDirty: false,
    platform: process.platform,
  })
  const text = [...files.values()].join("\n")
  for (const secret of ["fixture-api-secret", "fixture-login-password", "fixture-access-token", homedir()])
    expect(text).not.toContain(secret)
  expect(text).toContain("~/work/input.csv")
  for (const [name, data] of files) {
    if (name === "manifest.json") continue
    expect(manifest.files.find((file: any) => file.name === name)).toMatchObject({
      status: "included",
      size: Buffer.byteLength(data),
      sha256: createHash("sha256").update(data).digest("hex"),
    })
  }
})

test("redacts nested JSON, credentials echoed in other lines, text keys, URLs and provider keys", async () => {
  const key = "sk-proj-" + "a".repeat(28)
  const records = [
    {
      event: "echo",
      text: "fixture-known-password",
      nested: JSON.stringify({ authorization: "Basic fixture-basic", apiKey: "fixture-key" }),
    },
    { password: "fixture-known-password", text: key },
    { text: "https://user:fixture-url-password@example.test/?api_key=fixture-url-key" },
  ]
  put(runtime(attempt), records.map((value) => JSON.stringify(value)).join("\n"))
  put(
    join(paths.userData, "logs/current/server.log"),
    "password=fixture-text-password\ncookie: fixture-cookie\napi_key=fixture-text-key\nBearer fixture-bearer\n" + key,
  )
  const text = [...(await exported()).files.values()].join("\n")
  for (const secret of [
    "fixture-known-password",
    "fixture-basic",
    "fixture-key",
    key,
    "fixture-url-password",
    "fixture-url-key",
    "fixture-text-password",
    "fixture-cookie",
    "fixture-text-key",
    "fixture-bearer",
  ])
    expect(text).not.toContain(secret)
})

test("omits files when a secret remains after redaction and records only a safe reason", async () => {
  const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiJmaXh0dXJlIn0", "signaturefixture"].join(".")
  put(runtime(attempt), JSON.stringify({ event: "failure", unknown: jwt }))
  put(runtime(diagnostic), '{"event":"diagnostic"}\n')
  const { files, manifest } = await exported()
  expect(files.has(`runtime/${attempt}`)).toBe(false)
  expect(files.has(`runtime/${diagnostic}`)).toBe(true)
  expect(manifest.files.find((file: any) => file.name === `runtime/${attempt}`)).toMatchObject({
    status: "omitted",
    reason: "secret-after-redaction",
  })
  expect([...files.values()].join("\n")).not.toContain(jwt)
})

test("learns credentials across sources before exporting any file", async () => {
  put(runtime(attempt), '{"event":"echo","text":"fixture-shared-secret"}\n')
  put(runtime(diagnostic), '{"password":"fixture-shared-secret"}\n')
  const { files } = await exported()
  expect(files.has(`runtime/${attempt}`)).toBe(true)
  expect([...files.values()].join("\n")).not.toContain("fixture-shared-secret")
})

test("anonymizes macOS and repeatedly escaped Windows homes and refuses incomplete private keys", async () => {
  put(runtime(attempt), JSON.stringify({ path: "/Users/fixture-person/input.csv", nested: JSON.stringify({ path: "C:\\Users\\fixture-person\\input.csv" }) }) + "\n")
  put(runtime(diagnostic), JSON.stringify({ text: "-----BEGIN PRIVATE KEY-----\nfixture-incomplete-key" }) + "\n")
  const { files, manifest } = await exported()
  expect(files.has(`runtime/${attempt}`)).toBe(true)
  const text = [...files.values()].join("\n")
  expect(text).not.toContain("fixture-person")
  expect(text).toContain("~/input.csv")
  expect(text).not.toContain("fixture-incomplete-key")
  expect(manifest.files.find((file: any) => file.name === `runtime/${diagnostic}`)).toMatchObject({ status: "omitted", reason: "secret-after-redaction" })
  JSON.parse(JSON.parse(files.get(`runtime/${attempt}`)!).nested)
})

test("redacts structured net logs and omits credentials hidden behind an incomplete masking marker", async () => {
  put(
    join(paths.userData, "logs/current/network.netlog"),
    JSON.stringify({ cookie: "fixture-net-cookie", events: [{ password: "fixture-net-password" }] }),
  )
  put(runtime(attempt), '{"event":"failure","text":"api_key=[redacted]fixture-residual"}\n')
  const { files, manifest } = await exported()
  const text = [...files.values()].join("\n")
  expect(text).not.toContain("fixture-net-cookie")
  expect(text).not.toContain("fixture-net-password")
  // The runtime redactor may mask the entire assignment; either safe result is valid.
  expect(text).not.toContain("fixture-residual")
  expect(manifest.files.some((file: any) => file.name.endsWith("network.netlog") && file.status === "included")).toBe(
    true,
  )
})

test("bounds the archive, keeps complete recent JSONL events, and never follows symlinks or exports binary dumps", async () => {
  const line = JSON.stringify({ event: "old", text: "x".repeat(1024) }) + "\n"
  put(runtime(attempt), line.repeat(3000) + '{"event":"latest-failure"}\n')
  for (let i = 0; i < 12; i++) put(join(paths.userData, `logs/current/${i}.log`), line.repeat(2200))
  put(join(paths.crashDumps, "private.dmp"), "MDMP\0fixture-password")
  put(join(profile, "outside.log"), "private outside profile")
  symlinkSync(join(profile, "outside.log"), join(paths.userData, "logs/current/link.log"))
  const { output, files, manifest } = await exported()
  expect(readFileSync(output).length).toBeLessThanOrEqual(manifest.limits.archiveBytes)
  expect([...files.values()].reduce((n, text) => n + Buffer.byteLength(text), 0)).toBeLessThanOrEqual(
    manifest.limits.archiveBytes,
  )
  const events = files
    .get(`runtime/${attempt}`)!
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  expect(events.at(-1)).toEqual({ event: "latest-failure" })
  expect(events.length).toBeLessThan(3001)
  expect(manifest.files.find((file: any) => file.name === `runtime/${attempt}`).truncated).toBe(true)
  expect([...files.keys()].some((name) => name.endsWith("link.log"))).toBe(false)
  expect([...files.keys()].some((name) => name.endsWith("private.dmp"))).toBe(false)
  expect([...files.values()].join("\n")).not.toContain("private outside profile")
  expect(manifest.files.some((file: any) => file.reason === "archive-budget")).toBe(true)
})

test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_RUNTIME)(
  "exports real attempt journals through the Desktop export function",
  async () => {
    const source = process.env.LOGINOM_AI_AGENT_TEST_RUNTIME!
    const copy = (dir: string, relative = "") => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const name = join(relative, item.name)
        if (item.isDirectory()) copy(join(dir, item.name), name)
        else if (item.isFile() && /(?:execution-events|events)\.jsonl$/.test(item.name)) {
          mkdirSync(dirname(runtime(name)), { recursive: true })
          copyFileSync(join(dir, item.name), runtime(name))
        }
      }
    }
    copy(source)
    const { output, files, manifest } = await exported()
    expect([...files.keys()].some((name) => name.endsWith("/execution-events.jsonl"))).toBe(true)
    expect(
      [...files.keys()].some((name) => name.startsWith("runtime/diagnostics/") && name.endsWith("/events.jsonl")),
    ).toBe(true)
    for (const [name, text] of files) {
      expect(text).not.toContain(homedir())
      if (name.endsWith(".jsonl")) for (const line of text.trim().split("\n")) JSON.parse(line)
    }
    if (process.env.LOGINOM_AI_AGENT_TEST_EXPORT) copyFileSync(output, process.env.LOGINOM_AI_AGENT_TEST_EXPORT)
    console.log(
      JSON.stringify({
        scenario: "desktop-real-log-export",
        status: "PASS",
        files: manifest.files.map(({ name, status, size, truncated }: any) => ({ name, status, size, truncated })),
      }),
    )
  },
)

const sessionHash = createHash("sha256").update("ses_desktop").digest("hex")
function sessionFixture() {
  const attempt = `generations/1/chats/${sessionHash}/attempts/a1`
  put(runtime(`${attempt}/execution-events.jsonl`), JSON.stringify({ phase: "node_step_completed", text: "target-attempt" }) + "\n")
  put(runtime(`${attempt}/session.json`), JSON.stringify({ sessionId: "dock-desktop" }))
  put(runtime("generations/1/chats/other/attempts/b1/execution-events.jsonl"), '{"text":"other-session-attempt"}\n')
  put(join(paths.userData, "logs/current/main.log"), "main log line\n")
  put(join(paths.crashDumps, "pending/a.dmp"), "MDMP\0raw-memory")
  return {
    attempt: `runtime/${attempt}/execution-events.jsonl`,
    chat: { info: { id: "ses_desktop" }, messages: [{ info: { id: "m1", role: "user" }, parts: [{ type: "text", text: "chat-request" }] }] },
  }
}

test("IPC input keeps only a valid session, its chat and boolean groups with owner defaults", () => {
  expect(parseDiagnosticsRequest(undefined)).toEqual({
    sessionID: undefined,
    chat: undefined,
    include: { chat: true, runtime: true, logs: true, dumps: false },
  })
  expect(
    parseDiagnosticsRequest({ sessionID: "../../etc", chat: { info: {} }, include: { dumps: "yes", chat: false } }),
  ).toEqual({ sessionID: undefined, chat: undefined, include: { chat: false, runtime: true, logs: true, dumps: false } })
  expect(parseDiagnosticsRequest({ sessionID: "ses_desktop", chat: { info: {} }, include: { dumps: true } })).toMatchObject({
    sessionID: "ses_desktop",
    chat: { info: {} },
    include: { dumps: true },
  })
})

test("the Desktop archive follows the selected session, its chat and the chosen groups", async () => {
  const fixture = sessionFixture()
  const ready = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat })
  const status = (name: string) => ready.files.find((file) => file.name === name)
  expect(ready.selection).toBe("session")
  expect(status(fixture.attempt)).toMatchObject({ group: "runtime", status: "included" })
  expect(status("chat/session.json")).toMatchObject({ group: "chat", status: "included" })
  expect(status("desktop/current/main.log")).toMatchObject({ group: "logs", status: "included" })
  expect(status("crashpad/pending/a.dmp")).toMatchObject({ group: "dumps", status: "omitted" })
  expect(ready.files.some((file) => file.name.includes("/other/"))).toBe(false)
  // The preview reads the redacted bytes that Save writes.
  expect((await previewDiagnosticsFile(ready.id, "chat/session.json"))?.text).toContain("chat-request")
  expect(await previewDiagnosticsFile(ready.id, "crashpad/pending/a.dmp")).toBeUndefined()
  expect(await previewDiagnosticsFile("stale", "chat/session.json")).toBeUndefined()

  const narrowed = await prepareDiagnostics({
    sessionID: "ses_desktop",
    chat: fixture.chat,
    include: { chat: false, logs: false, dumps: true },
  })
  expect(narrowed.files.some((file) => file.group === "chat" || file.name.startsWith("desktop/"))).toBe(false)
  expect(narrowed.files.find((file) => file.name === "crashpad/pending/a.dmp")).toMatchObject({ status: "included" })
  expect(await previewDiagnosticsFile(ready.id, "chat/session.json")).toBeUndefined()
})

test("only crash dumps are taken from the crash directory", async () => {
  const fixture = sessionFixture()
  put(join(paths.crashDumps, "settings.dat"), "crashpad settings")
  put(join(paths.crashDumps, "pending/a.meta"), "crashpad metadata")
  for (const include of [{}, { dumps: true }]) {
    const ready = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat, include })
    expect(ready.files.filter((file) => file.name.startsWith("crashpad/")).map((file) => file.name)).toEqual([
      "crashpad/pending/a.dmp",
    ])
  }
})

test("Save as offers Downloads, writes the previewed archive privately and honours cancel", async () => {
  const fixture = sessionFixture()
  const ready = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat })
  saveDialogs.length = 0
  saveChoice = { canceled: true }
  expect(await saveDiagnostics(ready.id)).toBeUndefined()
  expect(saveDialogs[0].defaultPath.startsWith(join(paths.downloads, "loginom-diagnostics-"))).toBe(true)
  expect(saveDialogs[0].defaultPath.endsWith(".zip")).toBe(true)
  const target = join(profile, "chosen", "diagnostics.zip")
  mkdirSync(dirname(target), { recursive: true })
  saveChoice = { canceled: false, filePath: target }
  expect(await saveDiagnostics(ready.id)).toBe(target)
  const archive = new ZipReader(new BlobReader(new Blob([readFileSync(target)])))
  const names = (await archive.getEntries()).map((entry) => entry.filename)
  await archive.close()
  expect(names).toContain("chat/session.json")
  expect(names).toContain(fixture.attempt)
  if (process.platform !== "win32") expect(statSync(target).mode & 0o777).toBe(0o600)
  await expect(saveDiagnostics(ready.id)).rejects.toThrow("DIAGNOSTICS_NOT_PREPARED")
})

async function zipNames(path: string) {
  const archive = new ZipReader(new BlobReader(new Blob([readFileSync(path)])))
  try {
    return (await archive.getEntries()).map((entry) => entry.filename)
  } finally {
    await archive.close()
  }
}

test("Save writes the archive checked before Save as even if another window prepares meanwhile", async () => {
  const fixture = sessionFixture()
  const ready = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat, include: { chat: false } })
  const target = join(profile, "chosen", "first.zip")
  mkdirSync(dirname(target), { recursive: true })
  saveChoice = { canceled: false, filePath: target }
  let other: Awaited<ReturnType<typeof prepareDiagnostics>> | undefined
  duringSaveDialog = async () => {
    other = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat, include: { chat: true } })
  }
  expect(await saveDiagnostics(ready.id)).toBe(target)
  expect(other!.files.some((file) => file.name === "chat/session.json" && file.status === "included")).toBe(true)
  expect(readFileSync(target).length).toBe(ready.size)
  expect(await zipNames(target)).not.toContain("chat/session.json")
  // The other window's archive stays prepared for its own Save.
  duringSaveDialog = undefined
  const second = join(profile, "chosen", "second.zip")
  saveChoice = { canceled: false, filePath: second }
  expect(await saveDiagnostics(other!.id)).toBe(second)
  expect(await zipNames(second)).toContain("chat/session.json")
})

test("an older prepare that finishes last does not replace the newer archive", async () => {
  const fixture = sessionFixture()
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  netLog.currentlyLogging = true
  netLog.stopLogging = async () => {
    // Only the first prepare finds the net log running and waits here.
    netLog.currentlyLogging = false
    await held
  }
  netLog.startLogging = async () => {
    netLog.currentlyLogging = true
  }
  const older = prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat, include: { chat: false } })
  const newer = await prepareDiagnostics({ sessionID: "ses_desktop", chat: fixture.chat, include: { chat: true } })
  release()
  const stale = await older
  expect(await previewDiagnosticsFile(newer.id, "chat/session.json")).toBeDefined()
  expect(await previewDiagnosticsFile(stale.id, fixture.attempt)).toBeUndefined()
  const target = join(profile, "chosen", "newer.zip")
  mkdirSync(dirname(target), { recursive: true })
  saveChoice = { canceled: false, filePath: target }
  expect(await saveDiagnostics(newer.id)).toBe(target)
  expect(await zipNames(target)).toContain("chat/session.json")
})
