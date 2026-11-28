import { Schema } from "effect"
import { ProxySource, type ProxyStatus } from "../network-settings-rpc"
import { proxyHostPort } from "./address"
import { systemProxyDisabled } from "./environment"

// The Desktop launcher passes only the discovery source. Hosts come from the service's actual environment.
export const serviceProxySourceKey = "LOGINOM_AI_AGENT_RUNTIME_PROXY_SOURCE"

export function serviceProxyStatus(environment: NodeJS.ProcessEnv, configured: NodeJS.ProcessEnv = {}): ProxyStatus {
  const http = proxyValue(environment, "http_proxy", "HTTP_PROXY")
  const https = proxyValue(environment, "https_proxy", "HTTPS_PROXY")
  const all = proxyValue(environment, "all_proxy", "ALL_PROXY")
  const hosts = [
    ...new Set(
      [http ?? all, https ?? all].flatMap((value) => {
        if (!value) return []
        const host = proxyHostPort(value.includes("://") ? value : `http://${value}`)
        return host ? [host] : []
      }),
    ),
  ]
  const discovered = environment[serviceProxySourceKey]
  const source = Schema.is(ProxySource)(discovered) ? discovered : undefined
  const override =
    proxyValue(configured, "http_proxy", "HTTP_PROXY") ||
    proxyValue(configured, "https_proxy", "HTTPS_PROXY") ||
    proxyValue(configured, "all_proxy", "ALL_PROXY")
  if (http || https || all) {
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

function proxyValue(environment: NodeJS.ProcessEnv, lower: string, upper: string) {
  return environment[lower]?.trim() || environment[upper]?.trim()
}
