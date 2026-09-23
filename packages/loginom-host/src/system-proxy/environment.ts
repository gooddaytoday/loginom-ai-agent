import { proxyHostPort } from "./address"
import { mergeNoProxy } from "./bypass"
import type { SystemProxyResult } from "./types"

export function buildAppliedEnvironment(input: {
  platform: NodeJS.Platform
  environment: NodeJS.ProcessEnv
  http: string
  https: string
  noProxy: string[]
}) {
  const noProxy = mergeNoProxy(input.noProxy, input.environment).join(",")
  const upper: Record<string, string> = {
    HTTP_PROXY: input.http,
    HTTPS_PROXY: input.https,
    NO_PROXY: noProxy,
    NODE_USE_ENV_PROXY: "1",
  }
  // В Windows имена переменных окружения без учёта регистра, поэтому одной записи достаточно.
  if (input.platform === "win32") return upper
  return {
    ...upper,
    http_proxy: input.http,
    https_proxy: input.https,
    no_proxy: noProxy,
  }
}

export function appliedResult(input: {
  platform: NodeJS.Platform
  environment: NodeJS.ProcessEnv
  source: SystemProxyResult["summary"]["source"]
  http: string
  https: string
  noProxy: string[]
  skipped: string[]
  notices: SystemProxyResult["notices"]
}): SystemProxyResult {
  const environment = buildAppliedEnvironment(input)
  return {
    state: "applied",
    environment,
    summary: {
      http: proxyHostPort(input.http),
      https: proxyHostPort(input.https),
      source: input.source,
      noProxy: environment.NO_PROXY,
      skipped: input.skipped,
    },
    notices: input.notices,
  }
}

export function explicitProxy(environment: NodeJS.ProcessEnv) {
  const http = first(environment, ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"])
  if (http) return { kind: "http" as const, value: http }
  const all = first(environment, ["ALL_PROXY", "all_proxy"])
  if (!all) return undefined
  if (/^socks\d*:/i.test(all)) return { kind: "socks" as const, value: all }
  return { kind: "http" as const, value: all }
}

export function systemProxyDisabled(environment: NodeJS.ProcessEnv, enabled?: boolean) {
  if (enabled === false) return true
  const flag = environment.LOGINOM_AI_AGENT_SYSTEM_PROXY
  if (typeof flag !== "string") return false
  return ["off", "0", "false"].includes(flag.trim().toLowerCase())
}

function first(environment: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = environment[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}
