import { proxyHostPort } from "./address"
import { LOOPBACK, mergeNoProxy } from "./bypass"
import { explicitProxy, runtimeNoProxyKey } from "./environment"
import { resolveSystemProxy, type ResolveSystemProxyInput } from "./resolve"
import { failedResult, type SystemProxyResult } from "./types"

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
  return {
    environment,
    state: result.state,
    notices: result.notices.map((notice) => notice.code),
    status: serviceProxyStatus(result, input.environment ?? {}),
  }
}

function serviceProxyStatus(result: SystemProxyResult, environment: NodeJS.ProcessEnv) {
  // Disabling system discovery still leaves explicit proxy variables in the service's inherited environment.
  const explicit = explicitProxy(environment)
  if (explicit) {
    const url = explicit.value.includes("://") ? explicit.value : `http://${explicit.value}`
    const host = proxyHostPort(url)
    return { source: "environment" as const, hosts: host ? [host] : [] }
  }
  if (result.state === "applied") {
    const { source, http, https } = result.summary
    return { source, hosts: [...new Set([http, https].filter((host) => host !== undefined))] }
  }
  return {
    source:
      result.state === "failed"
        ? ("unavailable" as const)
        : result.state === "off"
          ? ("disabled" as const)
          : ("none" as const),
    hosts: [],
  }
}

function abortResult(signal: AbortSignal) {
  const { promise, resolve } = Promise.withResolvers<ReturnType<typeof failedResult>>()
  const abort = () => resolve(failedResult("timeout"))
  signal.addEventListener("abort", abort, { once: true })
  return { result: promise, [Symbol.dispose]: () => signal.removeEventListener("abort", abort) }
}
