import { productSlug } from "@loginom-ai-agent/product"
import { MainLogger } from "electron-log"
import log from "electron-log/main.js"
import { app, crashReporter, dialog, netLog, shell, type BrowserWindow } from "electron"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { CredentialCodec } from "@loginom-ai-agent/loginom-host/connection/credentials"
import { buildDiagnosticsArchive, profileSecrets } from "@loginom-ai-agent/loginom-host/diagnostics-export"
import { BUILD_SOURCE, CHANNEL } from "./constants"
import { logRetention } from "./log-retention"

const MAX_LOG_AGE_DAYS = 7
const MAX_LOG_BYTES = 100 * 1024 * 1024
const TAIL_LINES = 1000
const NET_LOG_SIZE = 20 * 1024 * 1024

let root = ""
let run = ""
let netLogPath: string | undefined
let retention: ReturnType<typeof logRetention> | undefined
let exportCodec: CredentialCodec | undefined
const exportValues = new Set<string>()

// Values used only to prime export redaction; never written anywhere.
export function configureDiagnosticsExport(input: { codec?: CredentialCodec; value?: string }) {
  if (input.codec) exportCodec = input.codec
  if (input.value) exportValues.add(input.value)
}

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

// Direct export without preview: recovery dialog and the fatal error page,
// where the renderer may not respond.
export async function exportDebugLogs() {
  const output = join(app.getPath("downloads"), `loginom-ai-agent-debug-${stamp()}.zip`)
  write("main", "exporting debug logs", { output })
  const { zip } = await buildDesktopArchive({})
  writeFileSync(output, zip, { mode: 0o600 })
  shell.showItemInFolder(output)
  return output
}

export type DiagnosticsGroup = "chat" | "runtime" | "logs" | "dumps"
export type DiagnosticsRequest = {
  sessionID?: string
  chat?: unknown
  include: Record<DiagnosticsGroup, boolean>
}
export type DiagnosticsFile = { name: string; group: DiagnosticsGroup; status: string; size?: number; reason?: string }
export type DiagnosticsPrepared = { id: string; size: number; selection: string; files: DiagnosticsFile[] }

// Chat on, crash dump off by default (owner decision diagnostics-export, 13.11).
export const DIAGNOSTICS_DEFAULTS: Record<DiagnosticsGroup, boolean> = { chat: true, runtime: true, logs: true, dumps: false }
const PREVIEW_BYTES = 64 * 1024

// IPC input comes from the renderer: accept only the documented shape.
export function parseDiagnosticsRequest(value: unknown): DiagnosticsRequest {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const include = input.include && typeof input.include === "object" ? (input.include as Record<string, unknown>) : {}
  const sessionID =
    typeof input.sessionID === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(input.sessionID) ? input.sessionID : undefined
  return {
    sessionID,
    chat: sessionID && input.chat && typeof input.chat === "object" ? input.chat : undefined,
    include: Object.fromEntries(
      Object.entries(DIAGNOSTICS_DEFAULTS).map(([key, fallback]) => [
        key,
        typeof include[key] === "boolean" ? include[key] : fallback,
      ]),
    ) as Record<DiagnosticsGroup, boolean>,
  }
}

export function diagnosticsGroup(name: string): DiagnosticsGroup {
  if (name.startsWith("chat/")) return "chat"
  if (name.startsWith("runtime/")) return "runtime"
  if (name.startsWith("crashpad/") && /\.dmp$/i.test(name)) return "dumps"
  return "logs"
}

let prepared: { id: string; zip: Uint8Array; order: number } | undefined
let prepares = 0

// Builds the archive in memory; the preview shows exactly the bytes that Save writes.
// Overlapping prepares keep the one started last, whatever order they finish in.
export async function prepareDiagnostics(value: unknown): Promise<DiagnosticsPrepared> {
  const order = ++prepares
  const request = parseDiagnosticsRequest(value)
  write("main", "preparing diagnostics", { session: !!request.sessionID, include: request.include })
  const { zip, manifest } = await buildDesktopArchive(request)
  const id = randomUUID()
  if (!prepared || order > prepared.order) prepared = { id, zip, order }
  return {
    id,
    size: zip.length,
    selection: manifest.selection,
    files: (manifest.files as Array<Record<string, unknown>>).map((file) => ({
      name: String(file.name),
      group: diagnosticsGroup(String(file.name)),
      status: String(file.status),
      ...(typeof file.size === "number" ? { size: file.size } : {}),
      ...(typeof file.reason === "string" ? { reason: file.reason } : {}),
    })),
  }
}

export async function previewDiagnosticsFile(id: unknown, name: unknown) {
  if (!prepared || id !== prepared.id || typeof name !== "string") return
  if (diagnosticsGroup(name) === "dumps") return
  const reader = new ZipReader(new Uint8ArrayReader(prepared.zip))
  try {
    const entry = (await reader.getEntries()).find((item) => item.filename === name && !item.directory)
    if (!entry?.getData) return
    const data = await entry.getData(new Uint8ArrayWriter())
    return { text: new TextDecoder().decode(data.subarray(0, PREVIEW_BYTES)), truncated: data.length > PREVIEW_BYTES }
  } finally {
    await reader.close()
  }
}

export async function saveDiagnostics(id: unknown, window?: BrowserWindow) {
  if (!prepared || id !== prepared.id) throw new Error("DIAGNOSTICS_NOT_PREPARED")
  // Take the checked archive now: another prepare may replace the slot while Save as is open.
  const zip = prepared.zip
  const options = {
    defaultPath: join(app.getPath("downloads"), `loginom-diagnostics-${stamp()}.zip`),
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return
  writeFileSync(result.filePath, zip, { mode: 0o600 })
  if (prepared?.id === id) prepared = undefined
  write("main", "diagnostics saved", { output: result.filePath })
  shell.showItemInFolder(result.filePath)
  return result.filePath
}

async function buildDesktopArchive(request: Partial<DiagnosticsRequest>) {
  const include = { ...DIAGNOSTICS_DEFAULTS, ...request.include }
  const restartNetLog = netLog.currentlyLogging
  if (restartNetLog) {
    await netLog.stopLogging().catch((error) => write("network", "failed to stop net log", { error }))
  }
  try {
    const loginom = join(app.getPath("userData"), "loginom")
    const known = await profileSecrets({
      loginom,
      data: dataRoot(),
      codec: exportCodec,
      dockHome: process.env.LOGINOM_DOCK_HOME || join(homedir(), ".loginom-dock"),
      extra: [...exportValues],
    })
    return await buildDiagnosticsArchive({
      runtime: include.runtime ? join(loginom, "runtime") : undefined,
      sessionID: request.sessionID,
      chat: include.chat ? request.chat : undefined,
      logs: [
        ...(include.logs
          ? [{ dir: root, prefix: "desktop" }, ...serverLogRoots().map((dir, i) => ({ dir, prefix: `server-${i + 1}` }))]
          : []),
        ...(include.logs || include.dumps ? [{ dir: app.getPath("crashDumps"), prefix: "crashpad" }] : []),
      ],
      attachDumps: include.dumps,
      knownSecrets: known.secrets,
      users: known.users,
      manifest: { ...manifest(), knownSecrets: known.status },
    })
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

function dataRoot() {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(xdgData, productSlug(CHANNEL))
}

function serverLogRoots() {
  return [join(dataRoot(), "log")]
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
