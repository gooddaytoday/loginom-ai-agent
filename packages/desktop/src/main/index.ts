import { desktopLoginom } from "./loginom/desktop-service"
import { registerLoginomIpc } from "./loginom/ipc"
import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import * as http from "node:http"
import { createServer } from "node:net"
import { homedir, tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app, BrowserWindow, dialog, session } from "electron"
import { Product, productName } from "@loginom-ai-agent/product"

import { Cause, Deferred, Effect, Fiber } from "effect"
import contextMenu from "electron-context-menu"

import type { ServerReadyData } from "../preload/types"
import { checkAppExists, resolveAppPath } from "./apps"
import { CHANNEL } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { forwardInitializationFailure } from "./initialization"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, startSession, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import {
  finishFirstLaunchOnboarding,
  initializeOldLayoutEligibility,
  isFirstLaunchOnboardingPending,
  isOldLayoutEligible,
} from "./onboarding"
import {
  getDefaultServerUrl,
  preferAppEnv,
  setDefaultServerUrl,
  spawnLocalServer,
  type SidecarListener,
} from "./server"
import { configuredProxy, startWithProxyFallback } from "./proxy-env"
import {
  formatSystemProxyLog,
  loopbackNoProxy,
  publishSystemProxyStatus,
  startSystemProxyDetection,
  statusFromResult,
  subscribeSystemProxyStatus,
  type SystemProxyDetection,
} from "./system-proxy"
import { SYSTEM_PROXY_ENABLED_KEY } from "./store-keys"
import { getStore } from "./store"
import { setupAutoUpdater, showUpdaterDialog } from "./updater"
import { safeWebContentsURL } from "./window-state"
import {
  getLastFocusedWindow,
  registerRendererProtocol,
  setRelaunchHandler,
  setAppQuitting,
  setBackgroundColor,
  setDockIcon,
  restoreMainWindows,
} from "./windows"
import { createWslServersController } from "./wsl/servers"
import { registerWslIpcHandlers } from "./wsl/ipc"
import { spawnWslSidecar } from "./wsl/sidecar"
import { migrate } from "./migrate"
import { cleanupStoreFiles } from "./store-cleanup"
import { startBackgroundCli } from "./background-cli"
import { setNativeTranslations } from "./native-translations"
import { createQuitHandler } from "./shutdown"

const TEST_ONBOARDING = process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING === "1"
const SIDECAR_VERSION = process.env.LOGINOM_AI_AGENT_SIDECAR_V2 === "1" ? "v2" : "v1"
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

let logger: ReturnType<typeof initLogging>
let server: SidecarListener | null = null

const pendingDeepLinks: string[] = []

function useEnvProxy() {
  try {
    // Electron 41.2 runs Node 24.14.1; latest @types/node@24 is 24.12.2.
    ;(http as any).setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  pendingDeepLinks.push(...urls)
  const win = getLastFocusedWindow()
  if (win) sendDeepLinks(win, urls)
}

async function killSidecar() {
  if (!server) return
  const current = server
  await current.stop()
  if (server === current) server = null
}

function ensureLoopbackNoProxy() {
  for (const key of ["NO_PROXY", "no_proxy"]) process.env[key] = loopbackNoProxy(process.env[key])
}

function systemProxyEnabled() {
  const flag = process.env.LOGINOM_AI_AGENT_SYSTEM_PROXY
  if (typeof flag === "string" && ["off", "0", "false"].includes(flag.trim().toLowerCase())) return false
  try {
    return getStore().get(SYSTEM_PROXY_ENABLED_KEY) !== false
  } catch {
    return true
  }
}

const main = Effect.gen(function* () {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

  // on macOS apps run in `/` which can cause issues with ripgrep
  try {
    process.chdir(homedir())
  } catch {}

  process.env.LOGINOM_AI_AGENT_DISABLE_EMBEDDED_WEB_UI = "true"
  process.env.LOGINOM_AI_AGENT_CHANNEL = CHANNEL

  const appId = app.isPackaged ? Product.channels[CHANNEL] : Product.channels.dev
  const onboardingTestRoot = ((): string | undefined => {
    if (!TEST_ONBOARDING) return

    const root = process.env.LOGINOM_AI_AGENT_TEST_ROOT ?? join(tmpdir(), `loginom-ai-agent-onboarding-${randomUUID()}`)
    if (!isAbsolute(root)) throw new Error("Test profile must be absolute")
    ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
      mkdirSync(join(root, dir), { recursive: true }),
    )
    process.env.LOGINOM_AI_AGENT_DB = ":memory:"
    process.env.XDG_DATA_HOME = join(root, "data")
    process.env.XDG_CONFIG_HOME = join(root, "config")
    process.env.XDG_CACHE_HOME = join(root, "cache")
    process.env.XDG_STATE_HOME = join(root, "state")
    return root
  })()
  app.setName(productName(app.isPackaged ? CHANNEL : "dev"))
  app.setAppUserModelId(appId)
  app.setPath(
    "userData",
    onboardingTestRoot ? join(onboardingTestRoot, "desktop") : join(app.getPath("appData"), appId),
  )
  if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))
  initializeOldLayoutEligibility(app.getPath("userData"))
  logger = initLogging()
  initCrashReporter()

  const wslServers = createWslServersController(
    app.getVersion(),
    async (distro) => {
      logger.log("spawning wsl sidecar", { distro })
      return spawnWslSidecar(distro, {
        onLine: (line) => logger.log("wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
    {
      logger: {
        log: (message, meta) => logger.log(message, meta),
        error: (message, meta) => logger.error(message, meta),
      },
    },
  )
  let loginomStarting: ReturnType<typeof desktopLoginom> | undefined
  let serverStarting: ReturnType<typeof spawnLocalServer> | undefined
  let stopping: Promise<void> | undefined
  let systemProxy: SystemProxyDetection | undefined
  const stopSidecars = () => {
    systemProxy?.stop()
    stopping ??= (async () => {
      try {
        // Startup can still be admitting the backend when Cmd+Q arrives.
        await serverStarting?.then((started) => started.listener.stop(), () => undefined)
        await killSidecar()
      } finally {
        wslServers.stopAll()
        await (await loginomStarting)?.close()
      }
    })()
    return stopping
  }
  const relaunch = () => {
    setAppQuitting()
    void stopSidecars().finally(() => {
      app.relaunch()
      app.quit()
    })
  }

  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }

  logger.log("app starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingTestRoot),
  })

  ensureLoopbackNoProxy()
  useEnvProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)
  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222")

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  startSession()
  // Явный прокси из login shell должен быть известен до запуска читателей ОС.
  const shellEnv = preferAppEnv(app.getPath("userData"))
  systemProxy = startSystemProxyDetection({
    environment: process.env,
    enabled: systemProxyEnabled(),
  })
  subscribeSystemProxyStatus((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send("system-proxy-status", status)
    }
  })
  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("loginom-ai-agent://"))
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    const win = getLastFocusedWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })

  app.on(
    "before-quit",
    createQuitHandler({
      markQuitting: setAppQuitting,
      stop: stopSidecars,
      quit: () => app.quit(),
      onError: (error) => logger.error("application shutdown failed", error),
    }),
  )

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: safeWebContentsURL(webContents), details }, "error")
  })

  setRelaunchHandler(() => {
    relaunch()
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      setAppQuitting()
      writeLog("main", "signal received", { signal })
      void stopSidecars().finally(() => app.quit())
    })
  }

  const serverReady = Deferred.makeUnsafe<ServerReadyData, unknown>()

  yield* Effect.promise(() => app.whenReady())
  try {
    systemProxy?.useChromium((url) => session.defaultSession.resolveProxy(url))
  } catch (error) {
    logger.warn("system proxy browser probe unavailable", error)
  }

  if (!TEST_ONBOARDING) migrate()
  yield* Effect.promise(() => cleanupStoreFiles(app.getPath("userData"))).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result.deleted.length === 0) return
        logger.log("cleaned scoped store files", { count: result.deleted.length, scanned: result.scanned })
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to clean scoped store files", error)
      }),
    ),
  )
  app.setAsDefaultProtocolClient(Product.scheme)
  registerRendererProtocol()
  setDockIcon()
  const updater = setupAutoUpdater(stopSidecars)
  const menuDeps = {
    trigger: (id: string) => {
      const win = getLastFocusedWindow()
      if (win) sendMenuCommand(win, id)
    },
    checkForUpdates: () => void showUpdaterDialog(updater, true),
    relaunch,
  }
  if (stopping) return
  loginomStarting = desktopLoginom()
  const loginom = yield* Effect.promise(() => loginomStarting!)
  if (stopping) return
  registerLoginomIpc(loginom.api)
  registerIpcHandlers({
    killSidecar: () => killSidecar(),
    relaunch,
    awaitInitialization: Effect.fnUntraced(
      function* () {
        logger.log("awaiting server ready")
        const res = yield* Deferred.await(serverReady)
        logger.log("server ready", { url: res.url })
        return res
      },
      (e) => Effect.runPromise(e),
    ),
    consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    isFirstLaunchOnboardingPending,
    finishFirstLaunchOnboarding,
    isOldLayoutEligible,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => undefined,
    checkAppExists: (appName) => checkAppExists(appName),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    updater,
    showUpdater: () => showUpdaterDialog(updater, true),
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error) => writeLog("renderer", "fatal renderer error", { ...error }, "error"),
    setNativeTranslations: (bundle) => {
      if (setNativeTranslations(bundle)) createMenu(menuDeps)
    },
    systemProxyEnabled,
  })
  registerWslIpcHandlers(wslServers)
  void updater.start()
  const updateTimer = setInterval(() => void updater.check(), 10 * 60 * 1000)
  updateTimer.unref()
  app.once("will-quit", () => clearInterval(updateTimer))
  yield* Effect.promise(() => startNetLog()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to start net log", error)
      }),
    ),
  )

  const loadingTask = yield* Effect.gen(function* () {
    logger.log("sidecar connection started", { version: SIDECAR_VERSION })
    const proxyResult = yield* Effect.promise(() => systemProxy?.result ?? Promise.resolve(undefined))
    if (proxyResult) {
      logger.log(formatSystemProxyLog(proxyResult))
      publishSystemProxyStatus(statusFromResult(proxyResult, systemProxyEnabled()))
    }

    ensureLoopbackNoProxy()
    useEnvProxy()

    if (SIDECAR_VERSION === "v2") {
      logger.log("spawning v2 sidecar")
      const sidecar = yield* Effect.promise(() =>
        startBackgroundCli(logger, shellEnv?.XDG_STATE_HOME, proxyResult?.environment),
      )
      yield* Deferred.succeed(serverReady, {
        url: sidecar.url,
        username: sidecar.username,
        password: sidecar.password,
      })

      if (process.platform === "win32") {
        void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
      }

      logger.log("loading task finished")
      return
    }

    const port = yield* Effect.gen(function* () {
      const fromEnv = process.env.LOGINOM_AI_AGENT_PORT
      if (fromEnv) {
        const parsed = Number.parseInt(fromEnv, 10)
        if (!Number.isNaN(parsed)) return parsed
      }

      const res = yield* Deferred.make<number, unknown>()
      const socket = createServer()
      socket.on("error", (e) => Deferred.failSync(res, () => e))
      socket.listen(0, "127.0.0.1", () => {
        const address = socket.address()
        if (typeof address !== "object" || !address) {
          socket.close()
          Deferred.failSync(res, () => new Error("Failed to get port"))
          return
        }
        const port = address.port
        socket.close(() => Effect.runSync(Deferred.succeed(res, port)))
      })

      return yield* Deferred.await(res)
    })
    const hostname = "127.0.0.1"
    const url = `http://${hostname}:${port}`
    const password = randomUUID()

    if (stopping) return
    let attempt = 0
    const testSidecarProxy = TEST_ONBOARDING ? process.env.LOGINOM_AI_AGENT_TEST_SIDECAR_PROXY : undefined
    logger.log("spawning sidecar", { url })
    const started = yield* Effect.promise(() =>
      startWithProxyFallback({
        proxy: testSidecarProxy
          ? { HTTPS_PROXY: testSidecarProxy, https_proxy: testSidecarProxy, NODE_USE_ENV_PROXY: "1" }
          : (proxyResult?.environment ?? configuredProxy(process.env)),
        start: (proxy) => {
          attempt += 1
          const starting = spawnLocalServer(hostname, port, password, {
            userDataPath: app.getPath("userData"),
            proxyEnvironment: proxy,
            withoutProxy: attempt > 1,
            loginom,
            onStdout: (message) => writeLog("server", message),
            onStderr: (message) => writeLog("server", message),
            onExit: (code) => writeLog("server", "sidecar exited", { code }, code === 0 ? "info" : "error"),
          })
          serverStarting = starting
          return starting
        },
      }),
    )
    if (started.fallback) {
      logger.log("system proxy: fallback")
      publishSystemProxyStatus({
        state: "failed",
        enabled: systemProxyEnabled(),
        notices: [{ code: "internal", detail: "sidecar" }],
      })
    }
    const { listener, health } = started.value
    server = listener
    if (stopping) {
      void health.wait.catch(() => undefined)
      yield* Effect.promise(() => killSidecar())
      return
    }
    yield* Deferred.succeed(serverReady, {
      url,
      username: "loginom-ai-agent",
      password,
    })

    if (process.platform === "win32") {
      void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
    }

    yield* Effect.promise(() => health.wait).pipe(
      Effect.timeout("30 seconds"),
      Effect.catch((e) =>
        Effect.sync(() => {
          logger.error("sidecar health check failed", e.toString())
        }),
      ),
    )

    logger.log("loading task finished")
  }).pipe(
    Effect.tapCause((cause) =>
      Effect.sync(() => writeLog("main", "initialization failed", { cause: Cause.pretty(cause) }, "error")),
    ),
    forwardInitializationFailure(serverReady),
    Effect.forkChild,
  )

  yield* Fiber.await(loadingTask)
  if (stopping) return

  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return
    app.quit()
  })
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    restoreMainWindows()
  })

  const windows = restoreMainWindows()
  if (windows.length) createMenu(menuDeps)
})

const fiber = Effect.runFork(
  main.pipe(
    Effect.tapCause((cause) =>
      Effect.sync(() => writeLog("main", "main process failed", { cause: Cause.pretty(cause) }, "error")),
    ),
  ),
)

void Effect.runPromise(
  Fiber.join(fiber).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        exitFailedStartup(cause)
      }),
    ),
  ),
)

function exitFailedStartup(cause: Cause.Cause<unknown>) {
  const message = Cause.pretty(cause)
  try {
    writeLog("main", "main process failed", { cause: message }, "error")
  } catch {
    // Журнал мог ещё не открыться: ранний сбой всё равно должен завершить процесс.
  }
  process.stderr.write(`main process failed\n${message}\n`)
  if (BrowserWindow.getAllWindows().length > 0) return
  try {
    if (app.isPackaged) {
      const russian = app.getLocale().toLowerCase().startsWith("ru")
      dialog.showErrorBox(
        "Loginom AI Agent",
        russian
          ? "Приложение не смогло запуститься. Подробности записаны в журнал."
          : "The application could not start. Details were written to the log.",
      )
    }
  } catch {
    // Диалог недоступен до готовности приложения.
  }
  app.exit(1)
}
