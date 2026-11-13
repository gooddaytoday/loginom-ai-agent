import { createHash } from "node:crypto"
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from "node:fs"
import { isIPv6 } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js"
import { createRedactor } from "../../loginom-runtime/client/lib/redact.mjs"
import { connectionStore } from "./connection/connection-store"
import type { CredentialCodec } from "./connection/credentials"

// Shared by Desktop and the standalone CLI: no Electron, no network, read-only
// access to the profile. Callers supply paths, provenance and known secrets.
export const DIAGNOSTICS_LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  archiveBytes: 20 * 1024 * 1024,
  files: 200,
  recentAttempts: 5,
  windowMs: 24 * 60 * 60 * 1000,
})
const RESERVE = 1024 * 1024

// Hosts that stay readable: Loginom itself, loopback and model providers.
export const PUBLIC_HOSTS = Object.freeze([
  "loginom.ai",
  "localhost",
  "openai.com",
  "chatgpt.com",
  "anthropic.com",
  "openrouter.ai",
  "googleapis.com",
  "deepseek.com",
  "mistral.ai",
  "x.ai",
  "groq.com",
  "together.xyz",
  "fireworks.ai",
  "cerebras.ai",
  "moonshot.ai",
  "moonshot.cn",
  "z.ai",
  "bigmodel.cn",
  "dashscope.aliyuncs.com",
  "minimax.io",
  "minimaxi.com",
  "githubcopilot.com",
  // Model endpoints only: other cloud hosts under these domains may be internal.
  "openai.azure.com",
  "services.ai.azure.com",
  "cognitiveservices.azure.com",
  "models.dev",
  "opencode.ai",
])

export type DiagnosticsEntry = { name: string; path: string; size: number; mtime: number }

export type DiagnosticsInput = {
  /** `<root>/runtime` of the Loginom profile. */
  runtime?: string
  /** opencode session id; without it the latest attempts are exported as before. */
  sessionID?: string
  /** Session export `{ info, messages: [{ info, parts }] }`. */
  chat?: unknown
  /** Extra sources collected for the last 24 hours: the first (current application logs) precedes startup failures, the rest follow them. */
  logs?: { dir: string; prefix: string }[]
  /** Values that must never appear in the archive. */
  knownSecrets?: string[]
  /** Login names replaced by `[user]`. */
  users?: string[]
  publicHosts?: string[]
  /** Build provenance and environment; written to manifest.json after redaction. */
  manifest?: Record<string, unknown>
  limits?: Partial<typeof DIAGNOSTICS_LIMITS>
  /**
   * Attach crash dumps (`*.dmp`) found among the sources as they are. They hold
   * process memory and cannot be redacted, so only an explicit user choice sets this.
   */
  attachDumps?: boolean
}

type Source = { name: string; priority: number; entry?: DiagnosticsEntry; chat?: unknown }
const MAX_DUMP_BYTES = 8 * 1024 * 1024

function readWhole(path: string, limit: number) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = fstatSync(fd)
    if (!info.isFile()) throw Error("not-a-file")
    if (info.size > limit) throw Error("too-large")
    const data = Buffer.alloc(info.size)
    let length = 0
    while (length < data.length) {
      const read = readSync(fd, data, length, data.length - length, length)
      if (!read) break
      length += read
    }
    return data.subarray(0, length)
  } finally {
    closeSync(fd)
  }
}

export function collectDiagnosticFiles(dir: string, prefix: string, pattern?: RegExp, windowMs = DIAGNOSTICS_LIMITS.windowMs) {
  const cutoff = Date.now() - windowMs
  const result: DiagnosticsEntry[] = []
  const walk = (current: string) => {
    // Do not follow links into credentials, browser profiles or other users' data.
    if (!lstatSync(current, { throwIfNoEntry: false })?.isDirectory()) return
    for (const entry of readdirSync(current)) {
      const file = join(current, entry)
      const info = lstatSync(file, { throwIfNoEntry: false })
      if (!info || info.isSymbolicLink()) continue
      if (info.isDirectory()) {
        walk(file)
        continue
      }
      if (!info.isFile()) continue
      const relative = file.slice(dir.length + 1).replace(/\\/g, "/")
      if (pattern ? !pattern.test(relative) : info.mtimeMs < cutoff) continue
      result.push({ name: `${prefix}/${relative}`, path: file, size: info.size, mtime: info.mtimeMs })
    }
  }
  try {
    walk(dir)
  } catch {
    /* Logs may rotate during collection. Other sources remain exportable. */
  }
  return result.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
}

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")

function runtimeSources(runtime: string, sessionID: string | undefined, recent: number): DiagnosticsEntry[][] {
  if (!sessionID) {
    return [
      collectDiagnosticFiles(runtime, "runtime", /^generations\/[^/]+\/chats\/[^/]+\/attempts\/[^/]+\/execution-events\.jsonl$/).slice(0, recent),
      [],
      collectDiagnosticFiles(runtime, "runtime", /^diagnostics\/[^/]+\/events\.jsonl$/).slice(0, recent),
      [],
    ]
  }
  // Runtime keys attempts by sha256(sessionID) (loginom-host/src/host-port.ts).
  const chat = sha256(sessionID)
  const attempts = collectDiagnosticFiles(
    runtime,
    "runtime",
    new RegExp(`^generations/[^/]+/chats/${chat}/attempts/[^/]+/(?:execution-events\\.jsonl|session\\.json)$`),
  )
  // Session diagnostics are keyed by the dock session id from session.json.
  const dock = new Set<string>()
  for (const entry of attempts.filter((item) => item.name.endsWith("/session.json"))) {
    try {
      const id = JSON.parse(readBounded(entry.path).text)?.sessionId
      if (typeof id === "string" && /^[A-Za-z0-9-]{1,100}$/.test(id)) dock.add(sha256("dock:" + id))
    } catch {
      /* An unreadable attempt keeps its journal; its diagnostics are not located. */
    }
  }
  return [
    attempts.filter((item) => item.name.endsWith("/execution-events.jsonl")),
    attempts.filter((item) => item.name.endsWith("/session.json")),
    collectDiagnosticFiles(runtime, "runtime", /^diagnostics\/[a-f0-9]{64}\/events\.jsonl$/).filter((item) =>
      dock.has(item.name.split("/")[2]),
    ),
    collectDiagnosticFiles(runtime, "runtime", /^(?:startup-failures\.jsonl|runtime-close-[^/]+\.json)$/).slice(0, recent),
  ]
}

// This scan is deliberately independent of redact.mjs. Unknown JWTs and any
// credential assignment that survives masking make the whole file ineligible.
export function hasExportSecret(text: string) {
  if (
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(text) ||
    /\b(?:bearer|basic)\s+(?!\[redacted\])[A-Za-z0-9+/_=.-]+/i.test(text)
  )
    return true
  const fields =
    /\b(?:api[_-]?key|authorization|password|passwd|cookie|set-cookie|access[_-]?token|refresh[_-]?token)\b["']?\s*[:=]\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}&]+)/gi
  for (const match of text.matchAll(fields)) {
    const value = match[1].replace(/^["']|["']$/g, "")
    if (value !== "[redacted]" && value !== "") return true
  }
  return false
}

export function exportHome(text: string, home = homedir()) {
  // Cover literal paths and their JSON-escaped Windows spelling, including paths
  // from journals copied between platforms.
  for (const value of new Set([home, home.replace(/\\/g, "/")])) {
    for (const variant of new Set([value, JSON.stringify(value).slice(1, -1)])) text = text.replaceAll(variant, "~")
  }
  return text
    .replace(/(?:\/Users\/|\/home\/)[^/\s"'\\]+/g, "~")
    .replace(/[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/)[^\\/\s"']+/gi, "~")
}

// Spellings in which a known value reaches journals: raw, URL and form
// encoding, single and double JSON escaping, standard and URL-safe base64.
function variants(value: string) {
  const json = JSON.stringify(value).slice(1, -1)
  const base64 = Buffer.from(value).toString("base64")
  const base64url = Buffer.from(value).toString("base64url")
  return new Set([
    value,
    encodeURIComponent(value),
    new URLSearchParams({ v: value }).toString().slice(2),
    json,
    JSON.stringify(json).slice(1, -1),
    base64,
    base64.replace(/=+$/, ""),
    base64url,
  ])
}

export function maskValues(text: string, values: string[], marker: string) {
  for (const value of [...new Set(values)].filter((item) => item.length >= 4).sort((a, b) => b.length - a.length))
    for (const variant of variants(value)) text = text.replaceAll(variant, marker)
  return text
}

// Product defaults and role words are not personal and must keep chat roles intact.
const GENERIC_LOGINS = new Set(["user", "users", "admin", "administrator", "guest", "test", "demo", "root"])
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A login is masked only as a whole token, so `ivan` does not damage `ivanov`.
export function maskLogins(text: string, logins: string[]) {
  const names = [...new Set(logins)].filter((item) => item.length >= 3 && !GENERIC_LOGINS.has(item.toLowerCase()))
  for (const name of names.sort((a, b) => b.length - a.length))
    for (const variant of variants(name))
      if (text.toLowerCase().includes(variant.toLowerCase())) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_.@%-])${escapeRegExp(variant)}(?![\\p{L}\\p{N}_@%-]|\\.[\\p{L}\\p{N}])`, "giu"), "[user]")
  return text
}

// Every IPv4 address identifies a network except loopback and the unspecified one.
function identifyingIPv4(host: string) {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] !== 127 && host !== "0.0.0.0"
}

// Names that look like `file.ts:42` in stack traces are not hosts.
const FILE_EXTENSIONS = new Set(
  "js mjs cjs ts mts cts tsx jsx json jsonl map log txt md csv xml yml yaml html htm css py go rs java cs cpp c h sh ps1 bat exe dll so node wasm lgp zip dmp".split(
    " ",
  ),
)

function publicHost(host: string, allowed: readonly string[]) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (name === "::1" || /^127(?:\.\d{1,3}){3}$/.test(name)) return true
  // Copilot sign-in and Bedrock model endpoints, not every GitHub or AWS host.
  if (["github.com", "api.github.com"].includes(name) || /^bedrock(?:-runtime)?(?:-fips)?\.[a-z0-9-]+\.amazonaws\.com$/.test(name))
    return true
  return allowed.some((item) => name === item || name.endsWith("." + item))
}

const hostLabel = (host: string) => "host-" + sha256(host.toLowerCase()).slice(0, 8)

// Internal server addresses: URL hosts and bare `name:port` outside the public
// list, IPv4/IPv6 literals except loopback and intranet-only names. URL user
// info is always removed. Scheme and port remain readable.
export function maskHosts(text: string, allowed: readonly string[] = PUBLIC_HOSTS) {
  text = text.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)(?:([^\s/?#@"'<>\\`[\]]*)@)?(\[[0-9a-f:.%\w]+\]|[^\s/?#:"'<>\\`@[\]]+)/gi,
    (_match, scheme: string, userinfo: string | undefined, host: string) =>
      scheme + (userinfo === undefined ? "" : "[redacted]@") + (publicHost(host, allowed) ? host : hostLabel(host)),
  )
  // Journals hold megabytes of long tokens: one linear pass over whole tokens
  // with anchored checks instead of scanning every offset per pattern.
  if (
    !/\d\.\d{1,3}\.\d{1,3}\.\d|\.(?:local|lan|corp|internal|intranet|arpa)(?![\w-])|[a-z0-9-]\.[a-z][a-z0-9-]*:\d|::|(?:[0-9a-f]{1,4}:){7}/i.test(
      text,
    )
  )
    return text
  return text.replace(/[\w.:%-]+/g, (token: string, offset: number, source: string) => {
    const body = token.replace(/[.:]+$/, "")
    const tail = token.slice(body.length)
    // IPv6 literals are validated, so times and MAC addresses stay intact.
    if (body.includes(":") && isIPv6(body.split("%")[0])) return body === "::1" ? token : hostLabel(body) + tail
    const [host, port, extra] = body.split(":")
    if (extra !== undefined || (port !== undefined && !/^\d{1,5}$/.test(port))) return token
    const suffix = (port === undefined ? "" : ":" + port) + tail
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return identifyingIPv4(host) ? hostLabel(host) + suffix : token
    if (/^(?:[a-z0-9-]+\.)+(?:local|lan|corp|internal|intranet|home\.arpa)$/i.test(host) && !host.startsWith("-"))
      return hostLabel(host) + suffix
    // Bare `name.with.dots:port`, as Desktop logs a proxy authority; not paths or user info.
    if (port === undefined || Number(port) > 65535 || "@/\\".includes(source[offset - 1] ?? "")) return token
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) || host.startsWith("host-")) return token
    const tld = host.slice(host.lastIndexOf(".") + 1).toLowerCase()
    if (!/^[a-z][a-z0-9-]*$/.test(tld) || FILE_EXTENSIONS.has(tld) || publicHost(host, allowed)) return token
    return hostLabel(host) + suffix
  })
}

function readBounded(path: string, limit = DIAGNOSTICS_LIMITS.fileBytes) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = fstatSync(fd)
    if (!info.isFile()) throw Error("not-a-file")
    const start = Math.max(0, info.size - limit)
    const data = Buffer.alloc(Math.min(info.size, limit))
    let length = 0
    while (length < data.length) {
      const read = readSync(fd, data, length, data.length - length, start + length)
      if (!read) break
      length += read
    }
    let bytes = data.subarray(0, length)
    if (start) {
      const newline = bytes.indexOf(10)
      if (newline < 0) throw Error("no-complete-lines")
      bytes = bytes.subarray(newline + 1)
    }
    if (/\.(?:dmp|heapsnapshot)$/i.test(path) || bytes.includes(0)) throw Error("binary-not-redactable")
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      truncated: start > 0,
      originalSize: info.size,
    }
  } finally {
    closeSync(fd)
  }
}

// Keep the newest complete messages of a session export within the file limit.
function boundedChat(chat: unknown, limit: number) {
  const text = JSON.stringify(chat)
  if (Buffer.byteLength(text) <= limit) return { json: chat, text, truncated: false, originalSize: Buffer.byteLength(text) }
  const value = chat as { info?: unknown; messages?: unknown[] }
  if (!value || typeof value !== "object" || !Array.isArray(value.messages)) throw Error("chat-too-large")
  const messages = [...value.messages]
  let json: unknown = { ...value, messages }
  while (messages.length && Buffer.byteLength(JSON.stringify(json)) > limit) {
    messages.shift()
    json = { ...value, messages }
  }
  const result = JSON.stringify(json)
  if (Buffer.byteLength(result) > limit) throw Error("chat-too-large")
  return { json, text: result, truncated: true, originalSize: Buffer.byteLength(text) }
}

export async function buildDiagnosticsArchive(input: DiagnosticsInput) {
  const limits = { ...DIAGNOSTICS_LIMITS, ...input.limits }
  const allowed = [...PUBLIC_HOSTS, ...(input.publicHosts ?? [])]
  const secrets = (input.knownSecrets ?? []).filter((value) => typeof value === "string" && value.length >= 4)
  const users = (input.users ?? []).filter((value) => typeof value === "string" && value.length >= 3)
  const redactor = createRedactor(secrets)
  const scrub = (text: string) =>
    maskHosts(exportHome(maskLogins(maskValues(text, secrets, "[redacted]"), users)), allowed)

  // Priority order decides what is dropped first when the archive budget is short.
  const [attempts, attemptMeta, diagnostics, startup] = input.runtime
    ? runtimeSources(input.runtime, input.sessionID, limits.recentAttempts)
    : [[], [], [], []]
  const sources: Source[] = [
    ...attempts.map((entry) => ({ name: entry.name, priority: 1, entry })),
    ...(input.chat === undefined ? [] : [{ name: "chat/session.json", priority: 2, chat: input.chat }]),
    ...attemptMeta.map((entry) => ({ name: entry.name, priority: 3, entry })),
    ...diagnostics.map((entry) => ({ name: entry.name, priority: 3, entry })),
    ...(input.logs ?? []).flatMap((source, index) =>
      collectDiagnosticFiles(source.dir, source.prefix, undefined, limits.windowMs).map((entry) => ({
        name: entry.name,
        priority: index === 0 ? 4 : 5 + index,
        entry,
      })),
    ),
    ...startup.map((entry) => ({ name: entry.name, priority: 5, entry })),
  ].sort((a, b) => a.priority - b.priority)

  const writer = new ZipWriter(new BlobWriter("application/zip"))
  const files: Array<Record<string, unknown>> = []
  const prepared: Array<{
    source: Source
    record: Record<string, unknown>
    text: string
    rows?: unknown[]
    json?: unknown
    binary?: Uint8Array
  }> = []
  let selectedBytes = 0
  for (const source of sources.slice(0, limits.files)) {
    const name = scrub(redactor.text(source.name))
    const record: Record<string, unknown> = {
      name: hasExportSecret(name) ? `omitted-${files.length + 1}` : name,
      status: "omitted",
    }
    if (source.entry) {
      record.originalSize = source.entry.size
      record.mtime = new Date(source.entry.mtime).toISOString()
    }
    files.push(record)
    if (hasExportSecret(name)) {
      record.reason = "secret-in-path"
      continue
    }
    const dump = input.attachDumps === true && !!source.entry && /\.dmp$/i.test(source.entry.path)
    const expected = dump ? source.entry!.size : Math.min(source.entry?.size ?? 0, limits.fileBytes)
    if (dump && expected > MAX_DUMP_BYTES) {
      record.reason = "dump-too-large"
      continue
    }
    if (selectedBytes + expected > limits.archiveBytes - RESERVE) {
      record.reason = "archive-budget"
      continue
    }
    try {
      if (source.chat !== undefined) {
        const { json, text, truncated, originalSize } = boundedChat(source.chat, limits.fileBytes)
        Object.assign(record, { originalSize, truncated })
        redactor.prime(json)
        prepared.push({ source, record, text, json })
        selectedBytes += Buffer.byteLength(text)
        continue
      }
      const entry = source.entry!
      if (dump) {
        const binary = readWhole(entry.path, MAX_DUMP_BYTES)
        Object.assign(record, { originalSize: binary.length, kind: "crash-dump", redacted: false })
        prepared.push({ source, record, text: "", binary })
        selectedBytes += binary.length
        continue
      }
      const { text, truncated, originalSize } = readBounded(entry.path, limits.fileBytes)
      record.originalSize = originalSize
      record.truncated = truncated
      if (entry.path.endsWith(".jsonl")) {
        const rows = text
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
        for (const row of rows) redactor.prime(row)
        prepared.push({ source, record, text, rows })
      } else if (/\.(?:json|netlog)$/i.test(entry.path)) {
        const json: unknown = JSON.parse(text)
        redactor.prime(json)
        prepared.push({ source, record, text, json })
      } else {
        prepared.push({ source, record, text })
      }
      selectedBytes += Buffer.byteLength(text)
    } catch {
      // Never expose filesystem errors: they may embed raw paths or log content.
      record.reason = "unreadable-or-not-redactable"
    }
  }
  for (const source of sources.slice(limits.files)) files.push({ name: "omitted", status: "omitted", reason: "file-count" })

  let total = 0
  // Learn credentials across all selected sources before exporting earlier echoes.
  for (const { source, record, text, rows, json, binary } of prepared) {
    try {
      if (binary) {
        if (total + binary.length > limits.archiveBytes - RESERVE) {
          record.reason = "archive-budget"
          continue
        }
        const name = scrub(redactor.text(source.name))
        record.name = name
        await writer.add(name, new BlobReader(new Blob([new Uint8Array(binary)])))
        total += binary.length
        Object.assign(record, { status: "included", size: binary.length, sha256: sha256(binary) })
        continue
      }
      let cleaned = rows
        ? rows.map((row) => JSON.stringify(redactor.redact(row))).join("\n") + "\n"
        : json !== undefined
          ? JSON.stringify(redactor.redact(json))
          : redactor.text(text)
      cleaned = scrub(cleaned)
      if (hasExportSecret(cleaned)) {
        record.reason = "secret-after-redaction"
        continue
      }
      if (cleaned.includes('"type":"redaction_failure"')) {
        record.reason = "redaction-failed"
        continue
      }
      const data = Buffer.from(cleaned)
      if (total + data.length > limits.archiveBytes - RESERVE) {
        record.reason = "archive-budget"
        continue
      }
      const name = scrub(redactor.text(source.name))
      record.name = name
      await writer.add(name, new BlobReader(new Blob([new Uint8Array(data)])))
      total += data.length
      Object.assign(record, { status: "included", size: data.length, sha256: sha256(data) })
    } catch {
      record.reason = "unreadable-or-not-redactable"
    }
  }
  const manifest = {
    ...input.manifest,
    selection: input.sessionID ? "session" : "recent",
    attachDumps: input.attachDumps === true,
    ...(input.sessionID ? { session: sha256(input.sessionID).slice(0, 16) } : {}),
    limits: { archiveBytes: limits.archiveBytes, fileBytes: limits.fileBytes, recentAttempts: limits.recentAttempts },
    files,
  }
  const summary = scrub(JSON.stringify(redactor.redact(manifest), null, 2))
  if (hasExportSecret(summary)) throw Error("LOG_EXPORT_MANIFEST_REDACTION_FAILED")
  await writer.add("manifest.json", new BlobReader(new Blob([summary])))
  const zip = new Uint8Array(await (await writer.close()).arrayBuffer())
  if (zip.length > limits.archiveBytes) throw Error("LOG_EXPORT_BUDGET_EXCEEDED")
  return { zip, manifest: JSON.parse(summary) as typeof manifest }
}

// Secrets of the profile, read in memory only to prime redaction. Missing
// stores are normal; an unreadable one is reported without its contents.
export async function profileSecrets(input: {
  /** `<root>` of the Loginom profile (contains `connection/`). */
  loginom?: string
  /** opencode data directory (contains `auth.json`, `mcp-auth.json`). */
  data?: string
  codec?: CredentialCodec
  /** Dock home `${LOGINOM_DOCK_HOME:-~/.loginom-dock}` with `config.json` (client/bin/dispatch.mjs). */
  dockHome?: string
  extra?: string[]
}) {
  const secrets: string[] = [...(input.extra ?? [])]
  const users: string[] = []
  let status: "ok" | "unavailable" = "ok"
  if (input.loginom) {
    const directory = join(input.loginom, "connection")
    // Never create profile directories: read only an existing store.
    if (lstatSync(join(directory, "connection.json"), { throwIfNoEntry: false })?.isFile()) {
      try {
        if (!input.codec) throw Error("codec-unavailable")
        const active = await connectionStore(directory, input.codec).read()
        if (active) {
          secrets.push(active.apiKey, active.password)
          users.push(active.username)
        }
      } catch {
        status = "unavailable"
      }
    }
  }
  if (input.data) {
    for (const file of ["auth.json", "mcp-auth.json"]) {
      const path = join(input.data, file)
      if (!lstatSync(path, { throwIfNoEntry: false })) continue
      try {
        collectStrings(JSON.parse(readBounded(path, 1024 * 1024).text), secrets)
      } catch {
        status = "unavailable"
      }
    }
  }
  if (input.dockHome) {
    // Dock client key `api_key` (loginom-runtime/client/lib/config.mjs).
    for (const file of ["config.json", join("profiles", "hermes-user.json")]) {
      const path = join(input.dockHome, file)
      if (!lstatSync(path, { throwIfNoEntry: false })) continue
      try {
        const key = JSON.parse(readBounded(path, 1024 * 1024).text)?.api_key
        if (typeof key === "string") secrets.push(key)
      } catch {
        status = "unavailable"
      }
    }
  }
  return { secrets: [...new Set(secrets.filter((value) => typeof value === "string" && value.length >= 4))], users, status }
}

// Credential fields of opencode `auth.json` (auth/index.ts) and `mcp-auth.json` (mcp/auth.ts).
const credentialFields = new Set(["key", "access", "refresh", "token", "accessToken", "refreshToken", "clientSecret", "codeVerifier", "oauthState"])
function collectStrings(value: unknown, out: string[], depth = 0) {
  if (depth > 10 || !value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      if (credentialFields.has(key)) out.push(item)
    } else collectStrings(item, out, depth + 1)
  }
}
