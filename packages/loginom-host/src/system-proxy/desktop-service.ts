import { LOOPBACK, mergeNoProxy } from "./bypass"
import { runtimeNoProxyKey } from "./environment"
import { resolveSystemProxy, type ResolveSystemProxyInput } from "./resolve"
import { failedResult } from "./types"

export function onceDesktopServiceProxy(input: () => ResolveSystemProxyInput) {
  let detection: ReturnType<typeof desktopServiceProxy> | undefined
  return () => (detection ??= desktopServiceProxy(input()))
}

export async function desktopServiceProxy(input: ResolveSystemProxyInput, timeoutMs = 10_000) {
  const controller = new AbortController()
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  using abort = signal.aborted ? undefined : abortResult(signal)
  const result = await Promise.resolve(
    abort ? Promise.race([resolveSystemProxy({ ...input, signal }), abort.result]) : failedResult("timeout"),
  ).finally(() => clearTimeout(timer))
  const noProxy = mergeNoProxy(LOOPBACK, input.environment ?? {}).join(",")
  const applied = result.environment
  const environment: Record<string, string> = applied
    ? {
        ...applied,
        [runtimeNoProxyKey]: JSON.stringify([applied.HTTP_PROXY, applied.HTTPS_PROXY, applied.NO_PROXY, noProxy]),
      }
    : { NO_PROXY: noProxy, ...((input.platform ?? process.platform) !== "win32" ? { no_proxy: noProxy } : {}) }
  return { environment, state: result.state, notices: result.notices.map((notice) => notice.code) }
}

function abortResult(signal: AbortSignal) {
  const { promise, resolve } = Promise.withResolvers<ReturnType<typeof failedResult>>()
  const abort = () => resolve(failedResult("timeout"))
  signal.addEventListener("abort", abort, { once: true })
  return { result: promise, [Symbol.dispose]: () => signal.removeEventListener("abort", abort) }
}
