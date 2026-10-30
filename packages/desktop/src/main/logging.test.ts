import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
const sourceSHA = process.env.LOGINOM_AI_AGENT_TEST_SOURCE_SHA ?? "a".repeat(40)
const paths = {
  userData: join(profile, "desktop"),
  downloads: join(profile, "downloads"),
  crashDumps: join(profile, "crash"),
}
const scoped = { info() {}, warn() {}, error() {} }
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
  netLog: { currentlyLogging: false },
  shell: { showItemInFolder() {} },
  crashReporter: {},
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
const { exportDebugLogs, initLogging } = await import("./logging")

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
  rmSync(profile, { recursive: true, force: true })
  for (const dir of Object.values(paths)) mkdirSync(dir, { recursive: true })
  initLogging()
})
afterAll(() => {
  mock.restore()
  if (previousDataHome === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = previousDataHome
  rmSync(profile, { recursive: true, force: true })
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
