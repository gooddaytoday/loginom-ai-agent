import { Schema } from "effect"
import { ProxySource, type ProxyStatus } from "../network-settings-rpc"
import { proxyHostPort } from "./address"
import { systemProxyDisabled } from "./environment"

// The Desktop launcher passes only the discovery source. Hosts come from the service's actual environment.
export const serviceProxySourceKey = "LOGINOM_AI_AGENT_RUNTIME_PROXY_SOURCE"

export function serviceProxyStatus(environment: NodeJS.ProcessEnv, configured: NodeJS.ProcessEnv = {}): ProxyStatus {
  const all = proxyValue(environment, configured, "all_proxy", "ALL_PROXY")
  const selected = [
    proxyValue(environment, configured, "http_proxy", "HTTP_PROXY") ?? all,
    proxyValue(environment, configured, "https_proxy", "HTTPS_PROXY") ?? all,
  ].filter((proxy) => proxy !== undefined)
  const hosts = [
    ...new Set(
      selected.flatMap(({ value }) => {
        const host = proxyHostPort(value.includes("://") ? value : `http://${value}`)
        return host ? [host] : []
      }),
    ),
  ]
  const discovered = environment[serviceProxySourceKey]
  const source = Schema.is(ProxySource)(discovered) ? discovered : undefined
  if (selected.length) {
    const override = selected.some((proxy) => proxy.configured)
    return {
      source:
        !override && source && source !== "none" && source !== "disabled" && source !== "unavailable"
          ? source
          : "environment",
      hosts,
    }
  }
  return { source: source ?? (systemProxyDisabled(environment) ? "disabled" : "none"), hosts }
}

function proxyValue(
  environment: NodeJS.ProcessEnv,
  configured: NodeJS.ProcessEnv,
  lower: string,
  upper: string,
) {
  const lowercase = environment[lower]?.trim()
  const uppercase = environment[upper]?.trim()
  const value = lowercase || uppercase
  if (!value) return undefined

  const key = lowercase ? lower : upper
  return {
    value,
    configured:
      configured[key]?.trim() === value ||
      // On Windows the lowercase lookup can resolve the uppercase environment entry.
      (process.platform === "win32" && lowercase === uppercase && configured[upper]?.trim() === value),
  }
}
