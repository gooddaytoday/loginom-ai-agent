import { desktopServiceProxy, MODEL_PROXY_URLS, probeProxyUrl } from "@loginom-ai-agent/loginom-host/system-proxy"
import { Product } from "@loginom-ai-agent/product"
import { SystemProxy, type SystemProxySetting } from "@opencode/gui-plugins/loginom-gui/contract"
import { systemProxyPreference } from "@opencode/gui-plugins/updater/proxy-preference"
import type { Entry } from "@opencode/plugin/gui/host"
import type { MainContext } from "@opencode/plugin/gui/main"
import { session } from "electron"
import { Effect } from "effect"
import { isQuitting, type State } from "../lifecycle/machine"
import { Shutdown } from "../lifecycle/shutdown"
import { createStorage } from "../plugin/storage"
import type { StateStore } from "../storage/state"
import { getStore } from "../storage/store"

type Detection = Awaited<ReturnType<typeof desktopServiceProxy>>

export function desktopProxyPreference(state: StateStore) {
  return systemProxyPreference(createStorage(state, getStore, "updater", true))
}

export const startSystemProxy = Effect.fn("Desktop.startSystemProxy")(function* (
  appState: () => State,
  preference: ReturnType<typeof desktopProxyPreference>,
  resolve = resolveProxy,
) {
  const shutdown = yield* Shutdown.Service
  const stopped = () => new Error("Background service proxy setup stopped")
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((notify) => notify())

  let current: { controller: AbortController; pending: Promise<Detection> } | undefined
  let result: Detection | undefined

  const start = () => {
    if (current) return current
    const controller = new AbortController()

    const pending = Promise.try(() => resolve(preference.value, controller.signal))
      .catch(async (): Promise<Detection> => {
        const fallback = await desktopServiceProxy({ enabled: false, environment: process.env })

        return { ...fallback, state: "failed", notices: ["internal"] }
      })
      .then((proxy) => {
        if (!controller.signal.aborted) {
          result = proxy
          changed()
        }

        return proxy
      })

    current = { controller, pending }

    return current
  }

  const stop = Effect.sync(() => {
    current?.controller.abort()
    current = undefined
    result = undefined
    changed()
  })

  yield* Effect.acquireRelease(
    shutdown.add({
      stop,
      resume: Effect.sync(() => {
        if (!isQuitting(appState())) start()
      }),
    }),
    (remove) => Effect.sync(remove).pipe(Effect.andThen(stop)),
  )

  if (!isQuitting(appState())) start()

  const setting = (): SystemProxySetting => {
    const enabled = preference.value

    if (!enabled || !result) return { enabled, status: "none" }

    if (result.state === "failed") return { enabled, status: result.notices.includes("timeout") ? "timeout" : "failed" }

    if (result.notices.includes("unreachable")) return { enabled, status: "unreachable" }

    if (result.notices.includes("socks-only")) return { enabled, status: "socks-only" }

    return { enabled, status: "none" }
  }

  return {
    setting,
    set(enabled: boolean) {
      preference.set(enabled)
      changed()
    },
    subscribe(notify: () => void) {
      listeners.add(notify)

      return () => {
        listeners.delete(notify)
      }
    },
    environment(environment: Readonly<Record<string, string>>) {
      return Effect.tryPromise(async () => {
        if (isQuitting(appState())) throw stopped()
        const detection = start()
        const proxy = await detection.pending

        if (detection.controller.signal.aborted || isQuitting(appState())) throw stopped()

        return proxy
      }).pipe(
        Effect.tap(({ state, notices }) => Effect.logInfo("background service proxy", { state, notices })),
        Effect.map((proxy) => ({ ...environment, ...proxy.environment })),
      )
    },
  }
})

export function withSystemProxy(entries: readonly Entry[], proxy: Effect.Success<ReturnType<typeof startSystemProxy>>) {
  const install = (ctx: MainContext) => {
    const provider = ctx.provide(SystemProxy, { state: proxy.setting, get: proxy.setting, set: proxy.set })
    ctx.onCleanup(proxy.subscribe(() => provider.changed()))
  }

  return entries.map((entry): Entry => {
    const main = entry.mainEntry

    if (entry.id !== "loginom-gui" || !main) return entry

    return {
      ...entry,
      mainEntry: async () => {
        const { default: setup } = await main()

        return {
          default(ctx: never) {
            install(ctx)

            return setup(ctx)
          },
        }
      },
    }
  })
}

function resolveProxy(enabled: boolean, signal: AbortSignal) {
  const urls = [...MODEL_PROXY_URLS]
  const catalog = process.env.LOGINOM_AI_AGENT_MODELS_URL || "https://models.opencode.ai"

  for (const url of [catalog, Product.updateFeed]) if (url && URL.canParse(url)) urls.push(url)

  return desktopServiceProxy({
    enabled,
    environment: process.env,
    signal,
    chromium: (url) => session.defaultSession.resolveProxy(url),
    urls,
    probe: (url, abort) => probeProxyUrl(url, 1000, abort),
  })
}
