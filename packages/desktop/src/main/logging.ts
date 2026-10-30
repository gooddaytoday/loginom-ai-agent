import { productSlug } from "@loginom-ai-agent/product"
import { MainLogger } from "electron-log"
import log from "electron-log/main.js"
import { app, crashReporter, netLog, shell } from "electron"
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  writeFileSync,
} from "node:fs"
import { createHash } from "node:crypto"
import { ZipWriter, BlobWriter, BlobReader } from "@zip.js/zip.js"
import { join } from "node:path"
import { homedir } from "node:os"
import { BUILD_SOURCE, CHANNEL } from "./constants"
import { logRetention } from "./log-retention"
import { createRedactor } from "../../../loginom-runtime/client/lib/redact.mjs"

const MAX_LOG_AGE_DAYS = 7
const MAX_LOG_BYTES = 100 * 1024 * 1024
const TAIL_LINES = 1000
const EXPORT_WINDOW = 24 * 60 * 60 * 1000
const MAX_EXPORT_FILE_SIZE = 2 * 1024 * 1024
const MAX_EXPORT_BYTES = 20 * 1024 * 1024
const MAX_EXPORT_FILES = 200
const RECENT_ATTEMPTS = 5
const NET_LOG_SIZE = 20 * 1024 * 1024

let root = ""
let run = ""
let netLogPath: string | undefined
let retention: ReturnType<typeof logRetention> | undefined

let logger: MainLogger
export const getLogger = () => logger

export function initLogging() {
  initRunDirectory()
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.resolvePathFn = (_vars, message) =>
    join(
      run,
      `${safeLogName(message?.scope ?? (message?.variables?.processType === "renderer" ? "renderer" : "main"))}.log`,
    )
  log.initialize({ preload: false, spyRendererConsole: true })
  log.errorHandler.startCatching()
  initConsoleTransport()
  return (logger = log)
}

export function startSession() {
  retention = logRetention({
    root,
    run,
    crashDumps: app.getPath("crashDumps"),
    legacy: serverLogRoots().map((dir) => join(dir, "loginom-ai-agent.log")),
    maxBytes: MAX_LOG_BYTES,
    maxAge: MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000,
    reserve: { log: log.transports.file.maxSize, netlog: NET_LOG_SIZE },
  })
  const archive = log.transports.file.archiveLogFn
  log.transports.file.archiveLogFn = (file) => {
    archive(file)
    retention?.prune()
  }
  const previous = retention.start()
  if (previous) write("crash", "previous session ended unexpectedly", { run: previous.run, dumps: previous.dumps }, "error")
  app.once("quit", (_event, exitCode) => endSession("app quit", { exitCode }))
}

export function endSession(reason: string, extra?: Record<string, unknown>) {
  write("main", reason, extra)
  retention?.end()
}

export function initCrashReporter() {
  const dir = join(app.getPath("userData"), "Crashpad")
  mkdirSync(dir, { recursive: true })
  app.setPath("crashDumps", dir)
  crashReporter.start({ uploadToServer: false, compress: true })
  write("crash", "crash reporter started", { path: dir })
}

export async function startNetLog() {
  if (netLog.currentlyLogging) return
  netLogPath = join(run, "network.netlog")
  await netLog.startLogging(netLogPath, { captureMode: "default", maxFileSize: NET_LOG_SIZE })
  write("network", "net log started", { path: netLogPath })
}

export async function exportDebugLogs() {
  const restartNetLog = netLog.currentlyLogging
  if (restartNetLog) {
    await netLog.stopLogging().catch((error) => write("network", "failed to stop net log", { error }))
  }

  const output = join(app.getPath("downloads"), `loginom-ai-agent-debug-${stamp()}.zip`)
  try {
    write("main", "exporting debug logs", { output })
    const runtime = join(app.getPath("userData"), "loginom", "runtime")
    await writeZip(output, [
      ...collect(
        runtime,
        "runtime",
        /^generations\/[^/]+\/chats\/[^/]+\/attempts\/[^/]+\/execution-events\.jsonl$/,
      ).slice(0, RECENT_ATTEMPTS),
      ...collect(runtime, "runtime", /^diagnostics\/[^/]+\/events\.jsonl$/).slice(0, RECENT_ATTEMPTS),
      ...collect(root, "desktop"),
      ...serverLogRoots().flatMap((dir, i) => collect(dir, `server-${i + 1}`)),
      ...collect(app.getPath("crashDumps"), "crashpad"),
    ])
    shell.showItemInFolder(output)
    return output
  } finally {
    if (restartNetLog) {
      await startNetLog().catch((error) => write("network", "failed to restart net log", { error }))
    }
  }
}

export function write(
  name: string,
  message: string,
  extra?: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
) {
  if (!run) return
  const scoped = log.scope(safeLogName(name))
  if (extra !== undefined) {
    scoped[level](message, extra)
    return
  }
  scoped[level](message)
}

export function tail(): string {
  try {
    const path = log.transports.file.getFile().path
    const contents = readFileSync(path, "utf8")
    const lines = contents.split("\n")
    return lines.slice(Math.max(0, lines.length - TAIL_LINES)).join("\n")
  } catch {
    return ""
  }
}

function initRunDirectory() {
  root = join(app.getPath("userData"), "logs")
  run = join(root, stamp())
  mkdirSync(run, { recursive: true })
}

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
}

function safeLogName(name: string) {
  return name.replace(/[^a-z0-9_.-]/gi, "_") || "main"
}

function manifest() {
  return {
    generated: new Date().toISOString(),
    version: app.getVersion(),
    channel: CHANNEL,
    ...BUILD_SOURCE,
    browserRecovery: import.meta.env?.LOGINOM_AI_AGENT_BROWSER_RECOVERY === true,
    name: app.getName(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    uptime: process.uptime(),
    userData: app.getPath("userData"),
    logs: root,
    currentRun: run,
    crashDumps: app.getPath("crashDumps"),
    serverLogs: serverLogRoots(),
    netLog: netLogPath,
  }
}

function serverLogRoots() {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return [join(xdgData, productSlug(CHANNEL), "log")]
}

type Entry = { name: string; path: string; size: number; mtime: number }

function collect(dir: string, prefix: string, pattern?: RegExp): Entry[] {
  const cutoff = Date.now() - EXPORT_WINDOW
  const result: Entry[] = []
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

// This scan is deliberately independent of redact.mjs. Unknown JWTs and any
// credential assignment that survives masking make the whole file ineligible.
function hasExportSecret(text: string) {
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

function exportHome(text: string) {
  // Cover literal paths and their JSON-escaped Windows spelling, including paths
  // from journals copied between platforms.
  for (const home of new Set([homedir(), homedir().replace(/\\/g, "/")])) {
    for (const variant of new Set([home, JSON.stringify(home).slice(1, -1)])) text = text.replaceAll(variant, "~")
  }
  return text
    .replace(/(?:\/Users\/|\/home\/)[^/\s"'\\]+/g, "~")
    .replace(/[A-Za-z]:(?:\\+|\/)Users(?:\\+|\/)[^\\/\s"']+/gi, "~")
}

function readExportTail(entry: Entry) {
  const fd = openSync(entry.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const info = fstatSync(fd)
    if (!info.isFile()) throw Error("not-a-file")
    const start = Math.max(0, info.size - MAX_EXPORT_FILE_SIZE)
    const data = Buffer.alloc(Math.min(info.size, MAX_EXPORT_FILE_SIZE))
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
    if (/\.(?:dmp|heapsnapshot)$/i.test(entry.path) || bytes.includes(0)) throw Error("binary-not-redactable")
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      truncated: start > 0,
      originalSize: info.size,
    }
  } finally {
    closeSync(fd)
  }
}

async function writeZip(output: string, entries: Entry[]) {
  const writer = new ZipWriter(new BlobWriter("application/zip"))
  const redactor = createRedactor()
  const files: Array<Record<string, unknown>> = []
  const prepared: Array<{
    entry: Entry
    record: Record<string, unknown>
    text: string
    rows?: unknown[]
    json?: unknown
  }> = []
  let selectedBytes = 0
  for (const entry of entries.slice(0, MAX_EXPORT_FILES)) {
    const name = exportHome(redactor.text(entry.name))
    const record: Record<string, unknown> = {
      name: hasExportSecret(name) ? `omitted-${files.length + 1}` : name,
      originalSize: entry.size,
      mtime: new Date(entry.mtime).toISOString(),
      status: "omitted",
    }
    files.push(record)
    if (hasExportSecret(name)) {
      record.reason = "secret-in-path"
      continue
    }
    if (selectedBytes + Math.min(entry.size, MAX_EXPORT_FILE_SIZE) > MAX_EXPORT_BYTES - 1024 * 1024) {
      record.reason = "archive-budget"
      continue
    }
    try {
      const { text, truncated, originalSize } = readExportTail(entry)
      record.originalSize = originalSize
      record.truncated = truncated
      if (entry.path.endsWith(".jsonl")) {
        const rows = text
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
        for (const row of rows) redactor.prime(row)
        prepared.push({ entry, record, text, rows })
      } else if (/\.(?:json|netlog)$/i.test(entry.path)) {
        const json: unknown = JSON.parse(text)
        redactor.prime(json)
        prepared.push({ entry, record, text, json })
      } else {
        prepared.push({ entry, record, text })
      }
      selectedBytes += Buffer.byteLength(text)
    } catch {
      // Never expose filesystem errors: they may embed raw paths or log content.
      record.reason = "unreadable-or-not-redactable"
    }
  }
  let total = 0
  // Learn credentials across all selected sources before exporting earlier echoes.
  for (const { entry, record, text, rows, json } of prepared) {
    try {
      let cleaned = rows
        ? rows.map((row) => JSON.stringify(redactor.redact(row))).join("\n") + "\n"
        : json !== undefined
          ? JSON.stringify(redactor.redact(json))
          : redactor.text(text)
      cleaned = exportHome(cleaned)
      if (hasExportSecret(cleaned)) {
        record.reason = "secret-after-redaction"
        continue
      }
      if (cleaned.includes('"type":"redaction_failure"')) {
        record.reason = "redaction-failed"
        continue
      }
      const data = Buffer.from(cleaned)
      if (total + data.length > MAX_EXPORT_BYTES - 1024 * 1024) {
        record.reason = "archive-budget"
        continue
      }
      const name = exportHome(redactor.text(entry.name))
      record.name = name
      await writer.add(name, new BlobReader(new Blob([new Uint8Array(data)])))
      total += data.length
      Object.assign(record, {
        status: "included",
        size: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      })
    } catch {
      record.reason = "unreadable-or-not-redactable"
    }
  }
  const summary = exportHome(
    JSON.stringify(
      redactor.redact({
        ...manifest(),
        limits: { archiveBytes: MAX_EXPORT_BYTES, fileBytes: MAX_EXPORT_FILE_SIZE, recentAttempts: RECENT_ATTEMPTS },
        selectionOmitted: Math.max(0, entries.length - MAX_EXPORT_FILES),
        files,
      }),
      null,
      2,
    ),
  )
  if (hasExportSecret(summary)) throw Error("LOG_EXPORT_MANIFEST_REDACTION_FAILED")
  await writer.add("manifest.json", new BlobReader(new Blob([summary])))
  const zip = await writer.close()
  if (zip.size > MAX_EXPORT_BYTES) throw Error("LOG_EXPORT_BUDGET_EXCEEDED")
  writeFileSync(output, Buffer.from(await zip.arrayBuffer()), { mode: 0o600 })
}

function initConsoleTransport() {
  if (app.isPackaged) {
    log.transports.console.level = false
    return
  }

  const write = log.transports.console.writeFn.bind(log.transports.console)
  log.transports.console.writeFn = (options) => {
    try {
      write(options)
    } catch (err) {
      if (!isBrokenPipe(err)) throw err
      log.transports.console.level = false
    }
  }
}

function isBrokenPipe(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "EPIPE"
}
