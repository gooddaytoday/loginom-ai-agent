import { productSlug } from "@loginom-ai-agent/product"
import { MainLogger } from "electron-log"
import log from "electron-log/main.js"
import { app, crashReporter, netLog, shell } from "electron"
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

export async function exportDebugLogs() {
  const restartNetLog = netLog.currentlyLogging
  if (restartNetLog) {
    await netLog.stopLogging().catch((error) => write("network", "failed to stop net log", { error }))
  }

  const output = join(app.getPath("downloads"), `loginom-ai-agent-debug-${stamp()}.zip`)
  try {
    write("main", "exporting debug logs", { output })
    const loginom = join(app.getPath("userData"), "loginom")
    const known = await profileSecrets({
      loginom,
      data: dataRoot(),
      codec: exportCodec,
      dockHome: process.env.LOGINOM_DOCK_HOME || join(homedir(), ".loginom-dock"),
      extra: [...exportValues],
    })
    const { zip } = await buildDiagnosticsArchive({
      runtime: join(loginom, "runtime"),
      logs: [
        { dir: root, prefix: "desktop" },
        ...serverLogRoots().map((dir, i) => ({ dir, prefix: `server-${i + 1}` })),
        { dir: app.getPath("crashDumps"), prefix: "crashpad" },
      ],
      knownSecrets: known.secrets,
      users: known.users,
      manifest: { ...manifest(), knownSecrets: known.status },
    })
    writeFileSync(output, zip, { mode: 0o600 })
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
