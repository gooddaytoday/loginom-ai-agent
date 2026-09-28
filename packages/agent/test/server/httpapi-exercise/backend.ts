import { Product } from "@loginom-ai-agent/product"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { parse } from "./assertions"
import { runtime, type Runtime } from "./runtime"
import type { ActiveScenario, BackendApp, CallResult, CaptureMode, SeededContext } from "./types"

type CallOptions = {
  auth?: {
    password?: string
    username?: string
  }
}

export function call(scenario: ActiveScenario, ctx: SeededContext<unknown>, options: CallOptions = {}) {
  return Effect.promise(async () =>
    capture(await app(await runtime(), options).request(toRequest(scenario, ctx)), scenario.capture),
  )
}

export function callAuthProbe(scenario: ActiveScenario, credentials: "missing" | "valid" = "missing") {
  return Effect.promise(async () => {
    const controller = new AbortController()
    const request = Promise.resolve().then(async () => {
      const response = await app(await runtime(), { auth: { password: "secret", username: Product.slug } }).request(
        toAuthProbeRequest(scenario, credentials, controller.signal),
      )
      if (scenario.capture !== "stream") return capture(response, scenario.capture)
      // Authentication only needs the response status. Reading the first SSE
      // event can race the outer deadline and leave a live subscription behind.
      try {
        await response.body?.cancel("auth probe complete")
      } catch {
        disposalUnknown = true
        throw new Error("auth probe stream closure unconfirmed")
      }
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        text: "",
        body: undefined,
        timedOut: false,
      } satisfies CallResult
    })
    // Observe both outcomes so the losing request can never reject unhandled.
    const settled = request.then(
      (value) => ({ kind: "result" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    )
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const first = await Promise.race([
        settled,
        new Promise<{ kind: "timeout" }>((resolve) => {
          deadline = setTimeout(() => {
            controller.abort("auth probe timed out")
            resolve({ kind: "timeout" })
          }, authProbeTimeoutMs)
        }),
      ])
      if (first.kind === "result") return first.value
      if (first.kind === "error") throw first.error
      // Aborting is a request, not proof of closure. Keep the app unavailable
      // if the handler/stream does not actually settle within this bound.
      let settlementDeadline: ReturnType<typeof setTimeout> | undefined
      try {
        const afterAbort = await Promise.race([
          settled,
          new Promise<{ kind: "unconfirmed" }>((resolve) => {
            settlementDeadline = setTimeout(() => resolve({ kind: "unconfirmed" }), authProbeTimeoutMs)
          }),
        ])
        if (afterAbort.kind === "unconfirmed") {
          disposalUnknown = true
          throw new Error("auth probe cancellation unconfirmed")
        }
      } finally {
        if (settlementDeadline) clearTimeout(settlementDeadline)
      }
      return { status: 0, contentType: "", text: "auth probe timed out", body: undefined, timedOut: true }
    } finally {
      if (deadline) clearTimeout(deadline)
      controller.abort("auth probe complete")
    }
  })
}

type CachedApp = BackendApp & { readonly dispose: () => Promise<void> }

const appCache: Partial<Record<string, CachedApp>> = {}
const authProbeTimeoutMs = 5_000
const disposeTimeoutMs = 10_000
let disposalUnknown = false

export function assertDisposalReady() {
  if (disposalUnknown) throw new Error("HttpApi app disposal is unconfirmed")
}

export async function disposeApps() {
  assertDisposalReady()
  const apps = Object.values(appCache)
  if (apps.length === 0) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const pending = Promise.all(apps.flatMap((app) => (app === undefined ? [] : [app.dispose()])))
    await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("HttpApi app disposal timed out")), disposeTimeoutMs)
      }),
    ])
    for (const key of Object.keys(appCache)) delete appCache[key]
  } catch (error) {
    // A pending dispose may still be running. Never start another scenario or
    // retry disposal against resources whose ownership is now unknown.
    disposalUnknown = true
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function app(modules: Runtime, options: CallOptions) {
  assertDisposalReady()
  const username = options.auth?.username
  const password = options.auth?.password
  const cacheKey = `${username ?? ""}:${password ?? ""}`
  if (appCache[cacheKey]) return appCache[cacheKey]

  const web = HttpRouter.toWebHandler(
    modules.HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ LOGINOM_AI_AGENT_SERVER_PASSWORD: password, LOGINOM_AI_AGENT_SERVER_USERNAME: username }),
        ),
      ),
    ),
    { disableLogger: true, memoMap: modules.memoMap },
  )
  return (appCache[cacheKey] = {
    dispose: web.dispose,
    request(input: string | URL | Request, init?: RequestInit) {
      return web.handler(
        input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
        modules.HttpApiApp.context,
      )
    },
  })
}

function toRequest(scenario: ActiveScenario, ctx: SeededContext<unknown>) {
  const spec = scenario.request(ctx, ctx.state)
  return new Request(new URL(spec.path, "http://localhost"), {
    method: scenario.method,
    headers: spec.body === undefined ? spec.headers : { "content-type": "application/json", ...spec.headers },
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  })
}

function toAuthProbeRequest(scenario: ActiveScenario, credentials: "missing" | "valid", signal: AbortSignal) {
  const spec = scenario.authProbe ?? {
    path: authProbePath(scenario.path),
    body: scenario.method === "GET" ? undefined : {},
  }
  const headers = {
    ...(spec.body === undefined ? {} : { "content-type": "application/json" }),
    ...spec.headers,
    ...(credentials === "valid" ? { authorization: basic(Product.slug, "secret") } : {}),
  }
  return new Request(new URL(spec.path, "http://localhost"), {
    method: scenario.method,
    headers,
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
    signal,
  })
}

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

function authProbePath(path: string) {
  return path
    .replace(/\{([^}]+)\}/g, (_match, key: string) => `auth_${key}`)
    .replace(/:([^/]+)/g, (_match, key: string) => `auth_${key}`)
}

async function capture(response: Response, mode: CaptureMode): Promise<CallResult> {
  const text = mode === "stream" ? await captureStream(response) : await response.text()
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    text,
    body: parse(text),
    timedOut: false,
  }
}

async function captureStream(response: Response) {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const read = reader.read().then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  )
  const winner = await Promise.race([read, Bun.sleep(1_000).then(() => ({ timeout: true }))])
  if ("timeout" in winner) {
    await reader.cancel("timed out waiting for stream chunk").catch(() => undefined)
    throw new Error("timed out waiting for stream chunk")
  }
  if ("error" in winner) throw winner.error
  await reader.cancel().catch(() => undefined)
  if (winner.result.done) return ""
  return new TextDecoder().decode(winner.result.value)
}
