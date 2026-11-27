export * as DesktopLogging from "./logging"

import log from "electron-log/main.js"
import { app, crashReporter, netLog, shell } from "electron"
import { LOG_DAY_MS, redactLogValues } from "@loginom-ai-agent/loginom-host/local-logs"
import { Product } from "@loginom-ai-agent/product"
import { Cause, Context, Effect, Exit, FiberSet, FileSystem, Layer, Logger, Path, Predicate, References } from "effect"
import { homedir } from "node:os"
import { join } from "node:path"
import { VERSION } from "../constants"
import { marks } from "../lifecycle/marks"
import { LoginomResources } from "../loginom/resources"
import { directory, serviceData } from "../service/service-identity"
import { logFiles, NET_LOG_SIZE, serviceSecrets, stamp } from "./log-files"
import {
  EXPORT_ARCHIVE_TIMEOUT_MS,
  initialLoggingState,
  NETLOG_TIMEOUT_MS,
  transitionLogging,
  type ExportReply,
  type LoggingCommand,
  type LoggingEvent,
} from "./logging-machine"

export interface Interface {
  readonly startNetwork: Effect.Effect<void>
  readonly startCrashReporter: Effect.Effect<void>
  readonly exportDebug: Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("opencode/desktop/DesktopLogging") {}

const serviceLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* initLogging()
    marks.logging = Date.now()
    yield* Effect.logInfo("app starting", {
      version: VERSION,
      packaged: app.isPackaged,
      onboardingTest: process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING === "1",
      marks,
    })
    const fibers = yield* FiberSet.make()
    const runFiber = yield* FiberSet.runtime(fibers)()
    const current = { state: initialLoggingState() }

    const dispatch = (event: LoggingEvent) => {
      const next = transitionLogging(current.state, event)
      current.state = next.state
      next.commands.forEach(perform)
    }

    // Every exit, defects included, reports back as an event. An interrupt only happens on disposal, which the
    // machine already left.
    const report = (
      effect: Effect.Effect<LoggingEvent, unknown>,
      failed: (error: Error) => Effect.Effect<LoggingEvent>,
    ) =>
      void runFiber(
        effect.pipe(
          Effect.exit,
          Effect.flatMap((exit) => {
            if (Exit.isSuccess(exit)) return Effect.sync(() => dispatch(exit.value))

            if (Cause.hasInterruptsOnly(exit.cause)) return Effect.void

            const error = Cause.squash(exit.cause)

            return failed(error instanceof Error ? error : new Error(String(error))).pipe(
              Effect.flatMap((event) => Effect.sync(() => dispatch(event))),
            )
          }),
        ),
      )

    const perform = (command: LoggingCommand) => {
      if (command.type === "start-netlog") {
        const attempt = command.attempt

        return report(
          Effect.suspend(() => {
            const target = path.join(logFiles().run, "network.netlog")

            if (netLog.currentlyLogging) return Effect.succeed(target)

            return Effect.tryPromise(() =>
              netLog.startLogging(target, { captureMode: "default", maxFileSize: NET_LOG_SIZE }),
            ).pipe(Effect.as(target))
          }).pipe(
            Effect.timeoutOrElse({
              duration: NETLOG_TIMEOUT_MS,
              orElse: () => Effect.fail(new Error("net log timed out")),
            }),
            Effect.tap((target) => scoped("network", Effect.logInfo("net log started", { path: target }))),
            Effect.map((target): LoggingEvent => ({ type: "netlog.started", attempt, path: target })),
          ),
          (error) =>
            scoped("network", Effect.logWarning(`failed to ${command.mode} net log`, { error })).pipe(
              Effect.map((): LoggingEvent => ({ type: "netlog.start-failed", attempt })),
            ),
        )
      }

      if (command.type === "stop-netlog") {
        const attempt = command.attempt

        return report(
          Effect.suspend(() =>
            netLog.currentlyLogging ? Effect.tryPromise(() => netLog.stopLogging()) : Effect.void,
          ).pipe(
            Effect.timeoutOrElse({
              duration: NETLOG_TIMEOUT_MS,
              orElse: () => Effect.fail(new Error("net log timed out")),
            }),
            Effect.map((): LoggingEvent => ({ type: "netlog.stopped", attempt })),
          ),
          (error) =>
            scoped("network", Effect.logWarning("failed to stop net log", { error })).pipe(
              Effect.map((): LoggingEvent => ({ type: "netlog.stopped", attempt })),
            ),
        )
      }

      if (command.type === "write-archive") {
        const attempt = command.attempt

        return report(
          writeDebugArchive(fs, path, command.netLogPath).pipe(
            Effect.timeoutOrElse({
              duration: EXPORT_ARCHIVE_TIMEOUT_MS,
              orElse: () => Effect.fail(new Error("Debug log export timed out")),
            }),
            Effect.map((output): LoggingEvent => ({ type: "archive.succeeded", attempt, output })),
          ),
          (error) =>
            Effect.logError("failed to export debug logs", { error }).pipe(
              Effect.map((): LoggingEvent => ({ type: "archive.failed", attempt, error })),
            ),
        )
      }

      if (command.type === "resolve-export") return command.replies.forEach((reply) => reply.resolve(command.output))

      command.replies.forEach((reply) => reply.reject(command.error))
    }

    yield* Effect.addFinalizer(() => Effect.sync(() => dispatch({ type: "disposed" })))

    return Service.of({
      startNetwork: Effect.sync(() => dispatch({ type: "network.requested" })),
      // Starting crashpad spawns its handler process, ~60 ms on the main thread, so the first window
      // and its IPC port come first.
      startCrashReporter: initCrashReporter(fs, path).pipe(
        Effect.tap(() => Effect.sync(() => (marks.crash = Date.now()))),
        Effect.catch((error) => Effect.logWarning("failed to start crash reporter", { error })),
      ),
      // A second export while one runs (another window, a retry after the error page gave up) joins it.
      exportDebug: Effect.callback<string>((resume) => {
        const reply: ExportReply = {
          resolve: (output) => resume(Effect.succeed(output)),
          reject: (error) => resume(Effect.die(error)),
        }

        dispatch({ type: "export.requested", reply })

        return Effect.sync(() => dispatch({ type: "export.cancelled", reply }))
      }),
    })
  }),
)

const nativeLogger = Logger.make((options) => {
  try {
    if (!log.transports.retained) return
    const entry = Logger.formatStructured.log(options)
    const scope = Predicate.isString(entry.annotations.scope) ? entry.annotations.scope : "main"
    const annotations = Object.fromEntries(Object.entries(entry.annotations).filter(([key]) => key !== "scope"))

    const context = Object.fromEntries(
      Object.entries({
        annotations: Object.keys(annotations).length === 0 ? undefined : annotations,
        spans: Object.keys(entry.spans).length === 0 ? undefined : entry.spans,
        cause: entry.cause,
      }).filter(([, value]) => value !== undefined),
    )

    const messages = Array.isArray(options.message) ? options.message : [options.message]
    log
      .scope(safeLogName(scope))
      [methods[options.logLevel]](...messages, ...(Object.keys(context).length === 0 ? [] : [context]))
  } catch {
    // Logging must not interrupt application work.
  }
})

const methods = {
  All: "silly",
  Trace: "silly",
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
  Fatal: "error",
  None: "silly",
} as const

const nativeLoggerLayer = Layer.merge(
  Logger.layer([nativeLogger], { mergeWithExisting: false }),
  Layer.succeed(References.MinimumLogLevel, "All"),
)

export const layer = serviceLayer.pipe(Layer.provideMerge(nativeLoggerLayer))

function initLogging() {
  return Effect.gen(function* () {
    const files = logFiles()
    files.prune()
    const timer = setInterval(files.prune, LOG_DAY_MS).unref()
    log.hooks.push((message) => ({ ...message, data: redactLogValues(message.data, serviceSecrets()) }))
    log.transports.file.level = false
    log.transports.retained = Object.assign(
      (message: Parameters<typeof log.transports.file>[0]) => {
        const scope = safeLogName(
          message.scope ?? (message.variables?.processType === "renderer" ? "renderer" : "main"),
        )

        files.append(
          join(files.run, `${scope}.log`),
          JSON.stringify({
            timestamp: message.date.toISOString(),
            level: message.level,
            scope,
            data: message.data,
          }),
        )
      },
      { level: "silly", transforms: [] } satisfies Pick<typeof log.transports.file, "level" | "transforms">,
    )
    log.initialize({ preload: false, spyRendererConsole: true })
    initConsoleTransport()
    yield* Effect.addFinalizer(() => Effect.sync(() => clearInterval(timer)))
  })
}

function initCrashReporter(fs: FileSystem.FileSystem, path: Path.Path) {
  return Effect.gen(function* () {
    const dir = path.join(app.getPath("userData"), "Crashpad")
    yield* fs.makeDirectory(dir, { recursive: true })
    yield* Effect.sync(() => {
      app.setPath("crashDumps", dir)
      crashReporter.start({ uploadToServer: false, compress: true })
    })
    yield* scoped("crash", Effect.logInfo("crash reporter started", { path: dir }))
  })
}

function writeDebugArchive(fs: FileSystem.FileSystem, path: Path.Path, netLogPath: string | undefined) {
  return Effect.gen(function* () {
    const output = path.join(app.getPath("downloads"), `${Product.slug}-debug-${stamp()}.zip`)
    yield* Effect.logInfo("exporting debug logs", { output })

    const { zip } = yield* Effect.tryPromise(async () => {
      const { cliCredentials } = await import("@loginom-ai-agent/loginom-host/connection/cli-credentials")

      const { buildDiagnosticsArchive, profileSecrets } = await import(
        "@loginom-ai-agent/loginom-host/diagnostics-export"
      )

      const data = serviceData()
      const loginom = path.join(data, "loginom")
      const installation = LoginomResources.installation(app)
      const resources = installation.packaged ? installation.resources : process.env.LOGINOM_AI_AGENT_RESOURCES

      const known = await profileSecrets({
        loginom,
        data,
        codec: cliCredentials(process.platform, resources ? { root: loginom, resources } : undefined),
        dockHome: process.env.LOGINOM_DOCK_HOME || path.join(homedir(), ".loginom-dock"),
        extra: serviceSecrets(),
      })

      return buildDiagnosticsArchive({
        logs: [
          { dir: logFiles().root, prefix: "desktop", match: /\.(?:log|netlog)$/ },
          ...serverLogRoots(path).map((dir, i) => ({ dir, prefix: `server-${i + 1}`, match: /\.log$/ })),
        ],
        knownSecrets: known.secrets,
        users: known.users,
        manifest: { ...manifest(path, netLogPath), knownSecrets: known.status },
      })
    })

    yield* fs.writeFile(output, zip, { mode: 0o600 })
    yield* Effect.sync(() => shell.showItemInFolder(output))

    return output
  })
}

function safeLogName(name: string) {
  return name.replace(/[^a-z0-9_.-]/gi, "_") || "main"
}

function manifest(path: Path.Path, netLogPath: string | undefined) {
  return {
    generated: new Date().toISOString(),
    version: VERSION,
    name: app.getName(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    versions: process.versions,
    uptime: process.uptime(),
    userData: app.getPath("userData"),
    logs: logFiles().root,
    currentRun: logFiles().run,
    crashDumps: app.getPath("crashDumps"),
    serverLogs: serverLogRoots(path),
    netLog: netLogPath,
  }
}

function serverLogRoots(path: Path.Path) {
  const xdgData = process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share")

  return [...new Set([path.join(xdgData, directory, "log"), path.join(app.getPath("userData"), directory, "log")])]
}

function initConsoleTransport() {
  if (app.isPackaged) {
    log.transports.console.level = false

    return
  }

  const writeConsole = log.transports.console.writeFn.bind(log.transports.console)
  log.transports.console.writeFn = (options) => {
    try {
      writeConsole(options)
    } catch (err) {
      if (!isBrokenPipe(err)) throw err
      log.transports.console.level = false
    }
  }
}

function isBrokenPipe(cause: unknown) {
  return Predicate.hasProperty(cause, "code") && cause.code === "EPIPE"
}

export function scoped(name: string, effect: Effect.Effect<void>) {
  return effect.pipe(Effect.annotateLogs("scope", name))
}
