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
    "bucket https://corp-data.s3.amazonaws.com/x",
    "tenant https://corp-tenant.azure.com/x",
    "model https://bedrock-runtime.us-east-1.amazonaws.com/model",
    "model https://fixture-res.openai.azure.com/openai",
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

  // Without a codec the stored connection cannot prime redaction; say so.
  expect((await profileSecrets({ loginom: p.loginom })).status).toBe("unavailable")
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
  for (const internal of ["10.1.2.3", "loginom.corp.local", "192.168.5.6", "fixture-person", "other-session-marker", "corp-data.s3", "corp-tenant"])
    expect(all).not.toContain(internal)
  expect(all).toContain("https://app.loginom.ai/app/")
  expect(all).toContain("https://bedrock-runtime.us-east-1.amazonaws.com/model")
  expect(all).toContain("https://fixture-res.openai.azure.com/openai")
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
  for (const file of manifest.files.filter((file: any) => file.status === "included") as any[])
    expect(file).toMatchObject({ size: archive.files.get(file.name)!.length, sha256: sha(archive.files.get(file.name)!) })
})

test("profile secrets include every connection generation, not only the active one", async () => {
  const p = profile()
  const store = connectionStore(join(p.loginom, "connection"), credentials("linux"))
  const accounts = [
    { username: "fixture-account-a", apiKey: "fixture-key-of-a", password: "fixture-pass-of-a" },
    { username: "fixture-account-b", apiKey: "fixture-key-of-b", password: "fixture-pass-of-b" },
  ]
  for (const [i, account] of accounts.entries()) {
    await store.stage({ generation: i + 1, revision: 1, url: "https://app.loginom.ai", ...account })
    await store.activate(i + 1)
  }
  const known = await profileSecrets({ loginom: p.loginom, codec: credentials("linux") })
  expect(known.status).toBe("ok")
  expect(known.secrets).toEqual(expect.arrayContaining(accounts.flatMap((item) => [item.apiKey, item.password])))
  expect(known.users).toEqual(expect.arrayContaining(accounts.map((item) => item.username)))
  // An unreadable generation keeps the others and is reported, never silently "ok".
  put(join(p.loginom, "connection", "generations", "3.json"), "{not a record")
  const partial = await profileSecrets({ loginom: p.loginom, codec: credentials("linux") })
  expect(partial.status).toBe("unavailable")
  expect(partial.secrets).toEqual(expect.arrayContaining(["fixture-pass-of-a", "fixture-pass-of-b"]))
})

test("masks a login only as a whole token and keeps generic logins and chat roles", async () => {
  const p = profile()
  const chat = {
    info: { id: "ses_login" },
    messages: [{ info: { id: "m1", role: "user" }, parts: [{ type: "text", text: "upload /ivan/input.csv by ivan for ivanov, users list" }] }],
  }
  const { zip } = await buildDiagnosticsArchive({ runtime: p.runtime, sessionID: "ses_login", chat, users: ["ivan", "user"] })
  const text = (await unpack(zip)).text("chat/session.json")
  expect(text).toContain('"role":"user"')
  expect(text).toContain("upload /[user]/input.csv by [user] for ivanov, users list")
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

test("attaches crash dumps unchanged only on explicit request", async () => {
  const p = profile()
  const dump = Buffer.concat([Buffer.from("MDMP"), Buffer.from([0, 1, 2, 255]), Buffer.from("raw-memory")])
  put(join(p.root, "crash", "pending", "a.dmp"), "")
  writeFileSync(join(p.root, "crash", "pending", "a.dmp"), dump)
  const sources = { runtime: p.runtime, logs: [{ dir: join(p.root, "crash"), prefix: "crashpad" }] }
  const off = await buildDiagnosticsArchive(sources)
  expect((await unpack(off.zip)).files.has("crashpad/pending/a.dmp")).toBe(false)
  expect(off.manifest.attachDumps).toBe(false)
  expect(off.manifest.files.find((file: any) => file.name === "crashpad/pending/a.dmp")).toMatchObject({
    status: "omitted",
    reason: "unreadable-or-not-redactable",
  })
  const on = await buildDiagnosticsArchive({ ...sources, attachDumps: true })
  const archive = await unpack(on.zip)
  expect(Buffer.from(archive.files.get("crashpad/pending/a.dmp")!)).toEqual(dump)
  expect(on.manifest.attachDumps).toBe(true)
  expect(on.manifest.files.find((file: any) => file.name === "crashpad/pending/a.dmp")).toMatchObject({
    status: "included",
    kind: "crash-dump",
    redacted: false,
    sha256: sha(dump),
  })
})

// Review #1075 (LAB-1553): every check reads the raw bytes of the archive.
async function archiveBytes(input: { lines: string[]; knownSecrets?: string[] }) {
  const p = profile()
  put(join(p.logs, "run", "main.log"), input.lines.join("\n") + "\n")
  put(
    join(attemptDir(p.runtime, "ses_review", "a1"), "execution-events.jsonl"),
    input.lines.map((text) => JSON.stringify({ phase: "node_step_completed", text })).join("\n") + "\n",
  )
  const { zip } = await buildDiagnosticsArchive({
    runtime: p.runtime,
    sessionID: "ses_review",
    logs: [{ dir: p.logs, prefix: "desktop" }],
    knownSecrets: input.knownSecrets,
  })
  const archive = await unpack(zip)
  return Buffer.concat([Buffer.from(zip), ...[...archive.files].flatMap(([name, data]) => [Buffer.from(name), Buffer.from(data)])])
}
const expectAbsent = (bytes: Buffer, values: string[]) => {
  for (const value of values) expect({ value, found: bytes.includes(Buffer.from(value)) }).toEqual({ value, found: false })
}

test("P1: bare proxy authorities, public IPv4 and global IPv6 are masked", async () => {
  const bytes = await archiveBytes({
    lines: [
      "system proxy: applied proxy.corp.example:3128",
      JSON.stringify({ proxy: "proxy.company.ru:3128" }),
      "connect 203.0.113.5:8080",
      "connect [2001:db8:85a3::8a2e:370:7334]:443 and 2001:db8::7",
      "trace at logging.ts:42:5, time 12:30:45, mac aa:bb:cc:dd:ee:ff, loopback 127.0.0.1:3000 and [::1]:9",
      "stand app.loginom.ai:443",
    ],
  })
  expectAbsent(bytes, ["proxy.corp.example", "proxy.company.ru", "203.0.113.5", "2001:db8:85a3", "2001:db8::7"])
  const text = bytes.toString("utf8")
  for (const kept of ["logging.ts:42:5", "12:30:45", "aa:bb:cc:dd:ee:ff", "127.0.0.1:3000", "[::1]:9", "app.loginom.ai:443"])
    expect(text).toContain(kept)
  expect(text).toMatch(/applied host-[0-9a-f]{8}:3128/)
})

test("P2.1: known values are masked in base64, base64url, double JSON and form encodings", async () => {
  const values = ["S3cretPw!", 'a"b\\c9x', "p ss!word", "url?safe>>key~"]
  const bytes = await archiveBytes({
    knownSecrets: values,
    lines: values.flatMap((value) => {
      const json = JSON.stringify(value).slice(1, -1)
      return [
        `b64 ${Buffer.from(value).toString("base64")}`,
        `b64url ${Buffer.from(value).toString("base64url")}`,
        `json2 ${JSON.stringify(json).slice(1, -1)}`,
        `form ${new URLSearchParams({ v: value }).toString().slice(2)}`,
      ]
    }),
  })
  expectAbsent(bytes, ["UzNjcmV0UHch", 'a\\\\\\"b\\\\\\\\c9x', "p+ss%21word"])
  for (const value of values)
    expectAbsent(bytes, [
      Buffer.from(value).toString("base64").replace(/=+$/, ""),
      Buffer.from(value).toString("base64url"),
      JSON.stringify(JSON.stringify(value).slice(1, -1)).slice(1, -1),
      new URLSearchParams({ v: value }).toString().slice(2),
    ])
})

test("P2.2: URL user info is removed for every scheme and the host is masked", async () => {
  const bytes = await archiveBytes({
    lines: ["proxy socks5://alice:S3cretPw@proxy.company.ru:1080", "db postgres://svc:Pg-Pass-77@10.9.8.7:5432/app"],
  })
  expectAbsent(bytes, ["alice", "S3cretPw", "proxy.company.ru", "svc:", "Pg-Pass-77", "10.9.8.7"])
  expect(bytes.toString("utf8")).toMatch(/socks5:\/\/\[redacted\]@host-[0-9a-f]{8}:1080/)
})

test("P2.3: the Dock configuration api_key is a known value", async () => {
  const p = profile()
  put(join(p.root, "dock", "config.json"), JSON.stringify({ api_key: "fixture-dock-api-value", account: "loginom-dock" }))
  put(join(p.root, "dock", "profiles", "hermes-user.json"), JSON.stringify({ api_key: "fixture-hermes-api-value" }))
  const known = await profileSecrets({ dockHome: join(p.root, "dock") })
  expect(known.secrets).toEqual(expect.arrayContaining(["fixture-dock-api-value", "fixture-hermes-api-value"]))
  const bytes = await archiveBytes({
    knownSecrets: known.secrets,
    lines: ["echo fixture-dock-api-value", "echo fixture-hermes-api-value"],
  })
  expectAbsent(bytes, ["fixture-dock-api-value", "fixture-hermes-api-value"])
})
