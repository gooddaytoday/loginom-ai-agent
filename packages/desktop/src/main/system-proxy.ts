import { spawnSync } from "node:child_process"

// Node does not read GNOME's proxy settings, unlike Electron's Chromium network stack.
// Apply the system route after loading the shell so stale shell variables cannot override it.
export function systemProxyEnvironment(settings: string, environment: NodeJS.ProcessEnv) {
  const values = new Map(
    settings.split("\n").flatMap((line) => {
      const match = /^(org\.gnome\.system\.proxy(?:\.[a-z]+)?) ([\w-]+) (.*)$/.exec(line)
      return match ? [[`${match[1]}.${match[2]}`, match[3]] as const] : []
    }),
  )
  const get = (key: string) => values.get(`org.gnome.system.proxy.${key}`)
  if (get("mode") !== "'manual'") return undefined
  if (get("http.use-authentication") === "true") throw new Error("SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED")

  const proxy = (scheme: string) => {
    if (get(`${scheme}.host`) === "''" && Number(get(`${scheme}.port`)) === 0) return ""
    const host = get(`${scheme}.host`)?.match(/^'([a-zA-Z0-9.:[\]-]+)'$/)?.[1]
    const port = Number(get(`${scheme}.port`))
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SYSTEM_PROXY_ADDRESS_INVALID")
    const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
    return `http://${address}:${port}`
  }
  const http = proxy("http")
  const https = get("use-same-proxy") === "true" ? http : proxy("https")
  // Some desktop proxy managers store a comma-separated list as a single GVariant item.
  const bypass = Array.from((get("ignore-hosts") ?? "").matchAll(/'([^']*)'/g))
    .flatMap((match) => match[1].split(","))
    .map((host) => host.trim())
    .filter(Boolean)
  const noProxy = [...new Set([...bypass, "localhost", "127.0.0.1", "::1"])].join(",")
  return {
    ...environment,
    HTTP_PROXY: http,
    http_proxy: http,
    HTTPS_PROXY: https,
    https_proxy: https,
    ALL_PROXY: "",
    all_proxy: "",
    NO_PROXY: noProxy,
    no_proxy: noProxy,
    NODE_USE_ENV_PROXY: "1",
  }
}

export function loadSystemProxyEnvironment(environment: NodeJS.ProcessEnv, platform = process.platform) {
  if (platform !== "linux") return undefined
  const result = spawnSync("gsettings", ["list-recursively", "org.gnome.system.proxy"], {
    env: environment,
    encoding: "utf8",
    timeout: 3000,
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
  if (result.error || result.status !== 0) return undefined
  return systemProxyEnvironment(result.stdout, environment)
}
