import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { TextWriter, Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { DIAGNOSTICS_LIMITS, buildDiagnosticsArchive, profileSecrets } from "../src/diagnostics-export"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function profile() {
  const root = mkdtempSync(join(tmpdir(), "loginom-diagnostics-"))
  roots.push(root)
  return { root, loginom: join(root, "loginom"), runtime: join(root, "loginom", "runtime"), data: join(root, "data"), logs: join(root, "logs") }
}
function put(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, text, { mode: 0o600 })
}
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
function attemptDir(runtime: string, sessionID: string, attempt: string) {
  return join(runtime, "generations", "1", "chats", sha(sessionID), "attempts", attempt)
}
async function unpack(zip: Uint8Array) {
  const reader = new ZipReader(new Uint8ArrayReader(zip))
  try {
    const files = new Map<string, Uint8Array>()
    for (const entry of await reader.getEntries()) {
      if (!entry.directory) files.set(entry.filename, await entry.getData!(new Uint8ArrayWriter()))
    }
    const text = (name: string) => new TextDecoder().decode(files.get(name)!)
    return { files, text, manifest: JSON.parse(text("manifest.json")) }
  } finally {
    await reader.close()
  }
}

test("secrets planted in the real profile stores never reach any archived byte", async () => {
  const p = profile()
  const store = connectionStore(join(p.loginom, "connection"), credentials("linux"))
  await store.stage({
    generation: 1,
    revision: 1,
    url: "https://app.loginom.ai",
    username: "fixture-person",
    apiKey: "fixture-loginom-api-value",
    password: "fixture-loginom-pass-value",
  })
  await store.activate(1)
  put(
    join(p.data, "auth.json"),
    JSON.stringify({
      openai: { type: "oauth", access: "fixture-oauth-access-value", refresh: "fixture-oauth-refresh-value", expires: 1 },
      openrouter: { type: "api", key: "fixture-provider-key-value" },
    }),
  )
  put(
    join(p.data, "mcp-auth.json"),
    JSON.stringify({
      server: { tokens: { accessToken: "fixture-mcp-token-value" }, clientInfo: { clientId: "id", clientSecret: "fixture-mcp-client-value" } },
    }),
  )
  const planted = [
    "fixture-loginom-api-value",
    "fixture-loginom-pass-value",
    "fixture-oauth-access-value",
    "fixture-oauth-refresh-value",
    "fixture-provider-key-value",
    "fixture-mcp-token-value",
    "fixture-mcp-client-value",
    "fixture-sidecar-value",
  ]
  // Echoes under neutral keys, so only known values can catch them.
  const echo = planted.flatMap((value) => [value, encodeURIComponent(`q=${value}&`), JSON.stringify({ nested: value })])
  const hosts = [
    "proxy http://10.1.2.3:8080/api",
    "open https://loginom.corp.local/app",
    "stand https://app.loginom.ai/app/",
    "connect ECONNREFUSED 192.168.5.6:3128",
    "upload /fixture-person/input.csv",
  ]
  const target = attemptDir(p.runtime, "ses_target", "a1")
  put(
    join(target, "execution-events.jsonl"),
    [...echo, ...hosts].map((text) => JSON.stringify({ phase: "node_step_completed", text })).join("\n") + "\n",
  )
  put(join(target, "session.json"), JSON.stringify({ sessionId: "dock-1" }))
  put(join(p.runtime, "diagnostics", sha("dock:dock-1"), "events.jsonl"), JSON.stringify({ event: "tool.end", output: echo.join(" ") }) + "\n")
  put(join(attemptDir(p.runtime, "ses_other", "b1"), "execution-events.jsonl"), '{"text":"other-session-marker"}\n')
  put(join(p.logs, "run", "main.log"), [...echo, ...hosts].join("\n") + "\n")
  const chat = {
    info: { id: "ses_target", title: "fixture chat" },
    messages: [{ info: { id: "m1", role: "user" }, parts: [{ type: "text", text: [...echo, ...hosts].join(" ") }] }],
  }

  const known = await profileSecrets({ loginom: p.loginom, data: p.data, codec: credentials("linux"), extra: ["fixture-sidecar-value"] })
  expect(known.status).toBe("ok")
  const { zip, manifest } = await buildDiagnosticsArchive({
    runtime: p.runtime,
    sessionID: "ses_target",
    chat,
    logs: [{ dir: p.logs, prefix: "desktop" }],
    knownSecrets: known.secrets,
    users: known.users,
    manifest: { version: "fixture" },
  })
  const archive = await unpack(zip)
  const bytes = Buffer.concat([...archive.files].flatMap(([name, data]) => [Buffer.from(name), Buffer.from(data)]))
  const all = bytes.toString("utf8")
  for (const value of planted)
    for (const variant of [value, encodeURIComponent(value), Buffer.from(value).toString("base64")]) {
      expect(bytes.includes(Buffer.from(variant))).toBe(false)
      expect(Buffer.from(zip).includes(Buffer.from(variant))).toBe(false)
    }
  for (const internal of ["10.1.2.3", "loginom.corp.local", "192.168.5.6", "fixture-person", "other-session-marker"])
    expect(all).not.toContain(internal)
  expect(all).toContain("https://app.loginom.ai/app/")
  expect(all).toContain("http://host-")
  expect(all).toContain("/[user]/input.csv")
  expect(manifest.selection).toBe("session")
  const included = manifest.files.filter((file: any) => file.status === "included").map((file: any) => file.name).sort()
  expect(included).toEqual(
    [
      "chat/session.json",
      "desktop/run/main.log",
      `runtime/diagnostics/${sha("dock:dock-1")}/events.jsonl`,
      `runtime/generations/1/chats/${sha("ses_target")}/attempts/a1/execution-events.jsonl`,
      `runtime/generations/1/chats/${sha("ses_target")}/attempts/a1/session.json`,
    ].sort(),
  )
  for (const file of manifest.files.filter((file: any) => file.status === "included"))
    expect(file).toMatchObject({ size: archive.files.get(file.name)!.length, sha256: sha(archive.files.get(file.name)!) })
})

test("reading profile secrets creates nothing in a missing profile", async () => {
  const p = profile()
  const known = await profileSecrets({ loginom: p.loginom, data: p.data, codec: credentials("linux") })
  expect(known).toEqual({ secrets: [], users: [], status: "ok" })
  expect(existsSync(p.loginom)).toBe(false)
  expect(existsSync(p.data)).toBe(false)
})

test("keeps a 2 MiB tail per file from a complete event and the archive within 20 MiB", async () => {
  const p = profile()
  const line = JSON.stringify({ event: "filler", text: "x".repeat(1000) }) + "\n"
  const journal = join(attemptDir(p.runtime, "ses_big", "a1"), "execution-events.jsonl")
  put(journal, line.repeat(3200) + '{"event":"latest-failure"}\n')
  for (let i = 0; i < 12; i++) put(join(p.logs, `run/${i}.log`), `log ${i}\n`.repeat(330_000))
  const chat = {
    info: { id: "ses_big" },
    messages: Array.from({ length: 40 }, (_, i) => ({ info: { id: `m${i}` }, parts: [{ type: "text", text: `${i}:` + "y".repeat(100_000) }] })),
  }
  const { zip, manifest } = await buildDiagnosticsArchive({ runtime: p.runtime, sessionID: "ses_big", chat, logs: [{ dir: p.logs, prefix: "desktop" }] })
  const archive = await unpack(zip)
  expect(zip.length).toBeLessThanOrEqual(DIAGNOSTICS_LIMITS.archiveBytes)
  expect(DIAGNOSTICS_LIMITS).toMatchObject({ fileBytes: 2 * 1024 * 1024, archiveBytes: 20 * 1024 * 1024 })
  const total = [...archive.files.values()].reduce((sum, data) => sum + data.length, 0)
  expect(total).toBeLessThanOrEqual(DIAGNOSTICS_LIMITS.archiveBytes)
  const name = `runtime/generations/1/chats/${sha("ses_big")}/attempts/a1/execution-events.jsonl`
  const events = archive.text(name).trim().split("\n").map((row) => JSON.parse(row))
  expect(archive.files.get(name)!.length).toBeLessThanOrEqual(DIAGNOSTICS_LIMITS.fileBytes)
  expect(events.at(-1)).toEqual({ event: "latest-failure" })
  expect(manifest.files.find((file: any) => file.name === name)).toMatchObject({ status: "included", truncated: true })
  // The chat keeps its newest complete messages.
  const kept = JSON.parse(archive.text("chat/session.json")).messages
  expect(kept.at(-1).info.id).toBe("m39")
  expect(kept.length).toBeLessThan(40)
  expect(manifest.files.find((file: any) => file.name === "chat/session.json")).toMatchObject({ status: "included", truncated: true })
  expect(manifest.files.some((file: any) => file.reason === "archive-budget")).toBe(true)
})

test("drops lower-priority sources first when the archive budget is short", async () => {
  const p = profile()
  const kib = (n: number, tag: string) => JSON.stringify({ tag, text: "z".repeat(n * 1024) }) + "\n"
  const attempt = attemptDir(p.runtime, "ses_order", "a1")
  put(join(attempt, "execution-events.jsonl"), kib(200, "attempt"))
  put(join(attempt, "session.json"), JSON.stringify({ sessionId: "dock-order" }))
  put(join(p.runtime, "diagnostics", sha("dock:dock-order"), "events.jsonl"), kib(100, "diagnostics"))
  put(join(p.runtime, "startup-failures.jsonl"), kib(100, "startup"))
  for (let i = 0; i < 2; i++) put(join(p.logs, `run/${i}.log`), "l".repeat(50 * 1024) + "\n")
  for (let i = 2; i < 6; i++) put(join(p.logs, `run/${i}.log`), "l".repeat(200 * 1024) + "\n")
  const chat = { info: { id: "ses_order" }, messages: [{ info: { id: "m1" }, parts: [{ type: "text", text: "c".repeat(100 * 1024) }] }] }
  const { manifest } = await buildDiagnosticsArchive({
    runtime: p.runtime,
    sessionID: "ses_order",
    chat,
    logs: [{ dir: p.logs, prefix: "desktop" }],
    limits: { fileBytes: 256 * 1024, archiveBytes: 1024 * 1024 + 520 * 1024 },
  })
  const status = (name: string) => manifest.files.find((file: any) => file.name === name)?.status
  expect(status(`runtime/generations/1/chats/${sha("ses_order")}/attempts/a1/execution-events.jsonl`)).toBe("included")
  expect(status("chat/session.json")).toBe("included")
  expect(status(`runtime/diagnostics/${sha("dock:dock-order")}/events.jsonl`)).toBe("included")
  // Application logs precede startup failures; both yield to the session sources.
  expect(status("desktop/run/0.log")).toBe("included")
  expect(status("desktop/run/1.log")).toBe("included")
  expect(status("runtime/startup-failures.jsonl")).toBe("omitted")
  const omitted = manifest.files.filter((file: any) => file.status === "omitted")
  expect(omitted.map((file: any) => file.name).sort()).toEqual(
    ["desktop/run/2.log", "desktop/run/3.log", "desktop/run/4.log", "desktop/run/5.log", "runtime/startup-failures.jsonl"].sort(),
  )
  for (const file of omitted) expect(file.reason).toBe("archive-budget")
})
