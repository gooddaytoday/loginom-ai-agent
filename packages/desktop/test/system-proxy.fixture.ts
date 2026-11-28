import { expect, mock } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MessageChannel } from "node:worker_threads"
import { desktopServiceProxy } from "@loginom-ai-agent/loginom-host/system-proxy"
import { builtins } from "@opencode/gui-plugins/main"
import { systemProxyPreference } from "@opencode/gui-plugins/updater/proxy-preference"
import { Scope } from "@opencode/plugin/gui/host"
import { Effect, Layer, ManagedRuntime } from "effect"
import { RpcServer } from "effect/rpc"
import { PluginRpcs } from "../src/shared/ipc-rpc/plugins"
import { call, sender, serverPort, success } from "../src/main/ipc-test-wire"
import { IpcPortHandoff, IpcServerProtocolLive } from "../src/main/ipc-transport"
import { createDriver } from "../src/main/lifecycle/machine"
import { Shutdown } from "../src/main/lifecycle/shutdown"
import { BackgroundServiceMachine } from "../src/main/service/background-service-machine"
import { openDatabase } from "../src/main/storage/database"
import { SETTINGS_STORE } from "../src/main/storage/keys"
import { createStateStore } from "../src/main/storage/state"

const profile = mkdtempSync(join(tmpdir(), "desktop-proxy-"))

const contents = Object.assign(sender(1), { getURL: () => "oc://renderer/index.html" })

const electron = {
  app: { isPackaged: false, getVersion: () => "0.0.0", getPath: () => profile, on() {} },
  BrowserWindow: { fromWebContents: () => ({ id: 1, isDestroyed: () => false, webContents: contents }) },
  Menu: {},
  screen: {},
  shell: {},
  crashReporter: {},
  netLog: {},
  dialog: {},
  nativeImage: {},
  nativeTheme: {},
  protocol: {},
  net: {},
  ImageView: {},
  ipcMain: { on() {} },
  session: {},
  clipboard: {},
  webContents: {},
  safeStorage: {},
}

mock.module("electron", () => ({ ...electron, default: electron }))

const { startSystemProxy, desktopProxyPreference, systemProxyPlugin } = await import("../src/main/loginom/system-proxy")

const { createHost } = await import("../src/main/plugin/host")

const { createStorage } = await import("../src/main/plugin/storage")

const { Plugins } = await import("../src/main/plugin")

const { pluginHandlers } = await import("../src/main/ipc-handlers/plugins")

const { getStore } = await import("../src/main/storage/store")

const scenario = process.argv[2]

const restart = scenario === "failed update handoff"

const legacyOff = scenario === "legacy off"

const windows = {
  autoDetect: false,
  autoConfigUrl: "",
  proxy: scenario === "socks-only" ? "socks=proxy.invalid:1080" : "proxy.invalid:8080",
  bypass: "",
}

const database = openDatabase(":memory:")

const state = createStateStore(database.db)

const shutdownRuntime = ManagedRuntime.make(Shutdown.layer)

const shutdown = await shutdownRuntime.runPromise(Shutdown.Service)

const lifecycle = createDriver({
  stop: () => shutdownRuntime.runPromise(shutdown.stop),
  resume: () => shutdownRuntime.runPromise(shutdown.resume),
  exit: () => undefined,
})

const attempts: AbortSignal[] = []

const awaitingDetection = Promise.withResolvers<void>()

const launches: Array<Readonly<Record<string, string>>> = []

try {
  getStore(SETTINGS_STORE).set("systemProxyEnabled", !legacyOff)
  const preference = desktopProxyPreference(state)
  const updaterPreference = systemProxyPreference(createStorage(state, getStore, "updater", true))
  expect(updaterPreference.value).toBe(!legacyOff)

  await shutdownRuntime.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const proxy = yield* startSystemProxy(lifecycle.state, preference, (enabled: boolean, signal: AbortSignal) => {
          attempts.push(signal)

          if (scenario === "failed")
            return desktopServiceProxy({ enabled, signal, environment: {}, read: () => Promise.reject(new Error()) })

          if (scenario === "timeout" || (restart && attempts.length === 1))
            return desktopServiceProxy(
              {
                enabled,
                signal,
                environment: {},
                read: () => {
                  awaitingDetection.resolve()

                  return new Promise(() => undefined)
                },
              },
              scenario === "timeout" ? 10 : 10_000,
            )

          return desktopServiceProxy({
            platform: "win32",
            enabled,
            signal,
            environment: {},
            windows,
            probe: async () => (scenario === "unreachable" ? "closed" : "other"),
          })
        })

        if (restart) {
          const enteringEnsure = Promise.withResolvers<void>()

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: () =>
              Effect.sync(enteringEnsure.resolve).pipe(
                Effect.andThen(proxy.environment({})),
                Effect.map((env) => {
                  launches.push(env)

                  return { url: "http://127.0.0.1:1", password: null }
                }),
              ),
            stop: Effect.void,
            publish: () => undefined,
          })

          yield* Effect.promise(() => Promise.all([enteringEnsure.promise, awaitingDetection.promise]))
          const keep = Scope.make("updater", { timeout: 1_000, log: () => undefined })
          const failure = new Error("fixture handoff failed")
          yield* Effect.promise(async () => {
            await expect(
              lifecycle.restart(keep, () => {
                expect(attempts[0]?.aborted).toBe(true)
                expect(launches).toEqual([])
                throw failure
              }),
            ).rejects.toBe(failure)
          })
          yield* machine.connection
          expect(attempts).toHaveLength(2)
          expect(launches).toEqual([expect.objectContaining({ HTTPS_PROXY: "http://proxy.invalid:8080" })])

          return
        }

        const env = yield* proxy.environment({ SENTINEL: "inherited" })
        expect(env.SENTINEL).toBe("inherited")
        expect(env.HTTPS_PROXY).toBe(scenario === "unreachable" ? "http://proxy.invalid:8080" : undefined)
        expect(env.NO_PROXY?.split(",")).toContain("localhost")
        expect(yield* proxy.environment({ SENTINEL: "inherited" })).toEqual(env)
        expect(attempts).toHaveLength(1)

        const host = createHost({
          db: database.db,
          state,
          builtins: builtins(systemProxyPlugin(proxy)).filter((entry) => entry.id === "loginom"),
          cli: { version: "0.0.0", command: [], development: true },
          subscriptions: new Map(),
          servers: new Map(),
          appState: lifecycle.state,
          restart: lifecycle.restart,
          log: () => undefined,
          write: () => undefined,
        })

        yield* Effect.promise(host.start)

        const plugins = Layer.succeed(Plugins.Service)({
          host: async () => host,
          loaded: () => host,
          start: Effect.void,
          subscribe: (ipc, window) => host.snapshot(ipc, window),
          configure: () => undefined,
        })

        const runtime = ManagedRuntime.make(
          RpcServer.layer(PluginRpcs).pipe(
            Layer.provide(pluginHandlers),
            Layer.provideMerge(IpcServerProtocolLive),
            Layer.provide(plugins),
          ),
        )

        const channel = new MessageChannel()
        yield* Effect.promise(async () => {
          try {
            const handoff = await runtime.runPromise(IpcPortHandoff)
            handoff.bind(contents, serverPort(channel.port1))
            const ipc = "loginom.system-proxy"
            expect((await call(channel.port2, 1, "PluginCall", { ipc, method: "get" })).exit).toEqual(
              success({ enabled: !legacyOff, status: legacyOff ? "none" : scenario }),
            )
            expect((await call(channel.port2, 2, "PluginCall", { ipc, method: "set", input: "false" })).exit._tag).toBe(
              "Failure",
            )
            expect(updaterPreference.value).toBe(!legacyOff)
            expect(
              (await call(channel.port2, 3, "PluginCall", { ipc, method: "set", input: legacyOff })).exit._tag,
            ).toBe("Success")
            expect(updaterPreference.value).toBe(legacyOff)
            expect((await call(channel.port2, 4, "PluginCall", { ipc, method: "get" })).exit).toEqual(
              success({ enabled: legacyOff, status: "none" }),
            )
          } finally {
            channel.port2.close()
            await runtime.dispose()
            await host.stop()
          }
        })
      }),
    ),
  )
} finally {
  await shutdownRuntime.dispose()
  state.close()
  database.close()
  rmSync(profile, { recursive: true, force: true })
}
