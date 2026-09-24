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

export class SidecarStartError extends Error {
  reason: "exit" | "error" | "stall"
  constructor(reason: "exit" | "error" | "stall", message?: string) {
    super(message ?? reason)
    this.reason = reason
  }
}

export async function startWithProxyFallback<T>(input: {
  proxy?: Record<string, string>
  start: (proxy: Record<string, string> | undefined) => Promise<T>
}) {
  const proxy = hasProxy(input.proxy) ? input.proxy : undefined
  try {
    return { value: await input.start(proxy), fallback: false }
  } catch (error) {
    if (!proxy || !(error instanceof SidecarStartError) || error.reason === "stall") throw error
    return { value: await input.start(undefined), fallback: true }
  }
}

export function configuredProxy(environment: NodeJS.ProcessEnv) {
  const proxy: Record<string, string> = {}
  for (const key of PROXY_KEYS) {
    const value = environment[key]
    if (typeof value === "string" && value.trim()) proxy[key] = value
  }
  return Object.keys(proxy).length ? proxy : undefined
}

function hasProxy(proxy: Record<string, string> | undefined) {
  if (!proxy) return false
  return PROXY_KEYS.some((key) => Boolean(proxy[key]?.trim()))
}

export function assignProxyEnvironment(target: NodeJS.ProcessEnv, proxy: Record<string, string>) {
  for (const key of PROXY_KEYS) {
    if (proxy[key] !== undefined) target[key] = proxy[key]
  }
}

export function withoutProxyEnvironment(base: NodeJS.ProcessEnv) {
  const env = { ...base }
  for (const key of PROXY_KEYS) delete env[key]
  return env
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
