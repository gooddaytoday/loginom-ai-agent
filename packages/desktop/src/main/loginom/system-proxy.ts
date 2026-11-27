import { onceDesktopServiceProxy, MODEL_PROXY_URLS, probeProxyUrl } from "@loginom-ai-agent/loginom-host/system-proxy"
import { Product } from "@loginom-ai-agent/product"
import { app, session } from "electron"
import { Effect } from "effect"
import { Shutdown } from "../lifecycle/shutdown"
import { getStore } from "../storage/store"

const key = "systemProxyEnabled"

const controller = new AbortController()

let stopping = false

const detect = onceDesktopServiceProxy(() => {
  const urls = [...MODEL_PROXY_URLS]
  const catalog = process.env.LOGINOM_AI_AGENT_MODELS_URL || "https://models.opencode.ai"

  for (const url of [catalog, Product.updateFeed]) if (url && URL.canParse(url)) urls.push(url)

  return {
    enabled: systemProxyEnabled(),
    environment: process.env,
    signal: controller.signal,
    chromium: (url) => session.defaultSession.resolveProxy(url),
    urls,
    probe: (url, signal) => probeProxyUrl(url, 1000, signal),
  }
})

const detection = () => app.whenReady().then(detect)

export const startSystemProxy = Effect.gen(function* () {
  const shutdown = yield* Shutdown.Service

  const stop = Effect.sync(() => {
    stopping = true
    controller.abort()
  })

  yield* Effect.acquireRelease(
    shutdown.add({
      stop,
      resume: Effect.sync(() => {
        stopping = false
      }),
    }),
    (remove) => stop.pipe(Effect.andThen(Effect.sync(remove))),
  )
  yield* Effect.forkScoped(Effect.promise(detection))
})

function systemProxyEnabled() {
  try {
    return getStore().get(key) !== false
  } catch {
    return true
  }
}

export function setSystemProxyEnabled(enabled: boolean) {
  getStore().set(key, enabled)
}

export async function systemProxySetting() {
  const { notices } = await detection()

  return {
    enabled: systemProxyEnabled(),
    unreachable: notices.includes("unreachable"),
    socksOnly: notices.includes("socks-only"),
  }
}

export function backgroundServiceEnvironment(environment: Readonly<Record<string, string>>) {
  return Effect.promise(detection).pipe(
    Effect.tap(({ state, notices }) => Effect.logInfo("background service proxy", { state, notices })),
    Effect.flatMap((proxy) => (stopping ? Effect.interrupt : Effect.succeed({ ...environment, ...proxy.environment }))),
  )
}
