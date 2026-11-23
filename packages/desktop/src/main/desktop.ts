import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { app } from "electron"
import { Effect, Layer, Runtime } from "effect"
import { Plugins } from "./plugin"
import { Ipc } from "./ipc"
import { DesktopInitialization } from "./lifecycle/desktop-initialization"
import { DesktopCredentials } from "./loginom/credentials"
import { installContextMenu } from "./lifecycle/environment"
import { ApplicationLifecycle } from "./lifecycle"
import { DesktopLogging } from "./native/logging"
import { BackgroundService } from "./service/background-service"
import { DesktopCli } from "./service/desktop-cli"
import { marks } from "./lifecycle/marks"

// Everything above has been loaded and evaluated by now; the layers start below.
marks.bundle = Date.now()

const runIpc = Effect.fn("Desktop.runIpc")(function* () {
  const lifecycle = yield* ApplicationLifecycle.Service
  const plugins = yield* Plugins.Service
  marks.layers = Date.now()
  yield* Effect.logInfo("layers ready", { marks })
  const ipc = yield* Ipc.registerIpcHandlers
  // Main GUI plugins start with the window: servers they restore feed the first paint's server
  // list, and menu items they contribute are present at startup. Their heavy modules load lazily on
  // first use.
  yield* Effect.forkScoped(plugins.start)

  if (lifecycle.restoreWindows().length) ipc.installMenu()
  // The first window's renderer now has its IPC port and is hydrating its stores over it. The crash
  // reporter (spawns a process) and the context menu (a dependency tree) are not worth answering late.
  yield* Effect.sleep("500 millis")
  const logging = yield* DesktopLogging.Service
  yield* logging.startCrashReporter
  yield* installContextMenu
  yield* Effect.callback<void>((resume) => {
    const quit = () => resume(Effect.void)
    app.once("will-quit", quit)

    return Effect.sync(() => app.off("will-quit", quit))
  })
})

// Loginom AI Agent (B4.10): SIGINT and SIGTERM quit through the app lifecycle (`lifecycle/index.ts`), which stops the
// plugins and the background service first, as 0.4's signal handler did. `NodeRuntime.runMain` is this runner plus its
// own SIGINT and SIGTERM handler, which interrupts the main fiber and exits before any `Shutdown` participant stops.
const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
  fiber.addObserver((exit) =>
    teardown(exit, (code) => {
      if (code !== 0) process.exit(code)
    }),
  )
})

runIpc().pipe(
  Effect.provide(Ipc.layer),
  Effect.provide(BackgroundService.layer),
  Effect.provide(DesktopCredentials.layer),
  Effect.provide(DesktopCli.layer),
  Effect.provide(DesktopInitialization.layer),
  Effect.provide(ApplicationLifecycle.layer),
  Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)),
  Effect.scoped,
  runMain,
)
