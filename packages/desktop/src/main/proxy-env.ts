const LOOPBACK = ["127.0.0.1", "localhost", "::1", "[::1]"]

export function loopbackNoProxy(current: string | undefined) {
  const items = (current ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  for (const host of LOOPBACK) {
    if (items.some((value) => value.toLowerCase() === host)) continue
    items.push(host)
  }
  return items.join(",")
}

const PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
  "NODE_USE_ENV_PROXY",
]

export function assignProxyEnvironment(target: NodeJS.ProcessEnv, proxy: Record<string, string>) {
  for (const key of PROXY_KEYS) {
    if (proxy[key] !== undefined) target[key] = proxy[key]
  }
}

export function sidecarEnvironment(base: NodeJS.ProcessEnv, proxy?: Record<string, string>) {
  const env = Object.fromEntries(
    Object.entries(base).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  )
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  if (!proxy) return env
  return { ...env, ...proxy }
}
