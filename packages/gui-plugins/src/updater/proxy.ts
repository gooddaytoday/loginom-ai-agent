import type { ProxyConfig } from "electron"

export function updateProxy(environment: NodeJS.ProcessEnv) {
  const first = (...values: (string | undefined)[]) => values.find((value) => value?.trim())?.trim()
  const all = first(environment.ALL_PROXY, environment.all_proxy)
  const http = first(environment.HTTP_PROXY, environment.http_proxy)
  const https = first(environment.HTTPS_PROXY, environment.https_proxy)

  const routes = Object.entries({ http: http ?? all, https: https ?? http ?? all }).flatMap(([scheme, value]) => {
    if (!value) return []

    try {
      const url = new URL(value.includes("://") ? value : `http://${value}`)

      if (!["http:", "https:", "socks4:", "socks5:"].includes(url.protocol) || !url.hostname) throw new Error()

      return [
        {
          rule: `${scheme}=${url.protocol}//${url.host}`,
          host: url.hostname.replace(/^\[|\]$/g, ""),
          port: Number(url.port || (url.protocol === "https:" ? 443 : url.protocol.startsWith("socks") ? 1080 : 80)),
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        },
      ]
    } catch {
      throw new Error("LOGINOM_UPDATE_PROXY_INVALID")
    }
  })

  const disabled = ["off", "0", "false"].includes(environment.LOGINOM_AI_AGENT_SYSTEM_PROXY?.trim().toLowerCase() ?? "")

  const config: ProxyConfig = routes.length
    ? {
        mode: "fixed_servers",
        proxyRules: routes.map(({ rule }) => rule).join(";"),
        proxyBypassRules: `${environment.NO_PROXY ?? ""},${environment.no_proxy ?? ""},localhost,127.0.0.1,[::1]`
          .split(/[\s,]+/)
          .filter((item) => item && item.toLowerCase() !== "<-loopback>")
          .join(";"),
      }
    : { mode: disabled ? "direct" : "system" }

  return {
    config,
    credentials(auth: { isProxy: boolean; host: string; port: number }) {
      if (!auth.isProxy) return undefined
      const host = auth.host.replace(/^\[|\]$/g, "").toLowerCase()

      return routes.find(
        (route) => route.host === host && route.port === auth.port && (route.username || route.password),
      )
    },
  }
}
