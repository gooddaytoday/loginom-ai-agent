import { parseProxyAddress } from "./address"
import { emptySettings, invalidSettings, type SystemProxySettings } from "./types"

export function parseWindowsSettings(input: unknown): SystemProxySettings {
  if (!isWindowsSettings(input)) return invalidSettings("windows", "windows")
  const settings = emptySettings("windows", "windows")
  settings.automatic = input.autoDetect || input.autoConfigUrl.trim() !== ""
  settings.pacUrl = input.autoConfigUrl.trim()
  settings.bypass = input.bypass.split(";")
  const routes = parseWindowsProxy(input.proxy, settings)
  if (routes.invalid) return invalidSettings("windows", "windows")
  settings.http = routes.http
  settings.https = routes.https
  settings.socks = routes.socks
  if (settings.http || settings.https || settings.socks) settings.mode = "manual"
  else if (settings.pacUrl) settings.mode = "pac"
  else if (input.autoDetect) settings.mode = "automatic"
  return settings
}

function isWindowsSettings(input: unknown): input is {
  autoDetect: boolean
  autoConfigUrl: string
  proxy: string
  bypass: string
} {
  if (!input || typeof input !== "object") return false
  const value = input as Record<string, unknown>
  return (
    typeof value.autoDetect === "boolean" &&
    typeof value.autoConfigUrl === "string" &&
    typeof value.proxy === "string" &&
    typeof value.bypass === "string"
  )
}

function parseWindowsProxy(proxy: string, settings: SystemProxySettings) {
  const entries = proxy
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
  const routes = new Map<string, string>()
  let socks = ""
  let invalidCount = 0
  let parsed = 0
  const assign = (scheme: string, address: string) => {
    parsed += 1
    const result = parseProxyAddress(address)
    if (result.kind === "empty") return
    if (result.kind === "invalid") {
      invalidCount += 1
      settings.log.push(`address:${scheme || "proxy"}`)
      return
    }
    if (result.auth) settings.authRequired = true
    if (result.kind === "socks" || scheme === "socks" || scheme === "socks4" || scheme === "socks5") {
      if (!socks) socks = result.url
      else settings.log.push(`duplicate:${scheme || "socks"}`)
      return
    }
    const key = scheme || "both"
    if (routes.has(key)) {
      settings.log.push(`duplicate:${key}`)
      return
    }
    routes.set(key, result.url)
  }
  if (entries.length === 1 && !entries[0].includes("=")) assign("", entries[0])
  else
    for (const entry of entries) {
      const index = entry.indexOf("=")
      if (index < 0) {
        settings.log.push(`route:${entry}`)
        invalidCount += 1
        continue
      }
      const scheme = entry.slice(0, index).trim().toLowerCase()
      const address = entry.slice(index + 1).trim()
      if (scheme === "ftp") {
        settings.log.push("ftp")
        continue
      }
      if (!["http", "https", "socks", "socks4", "socks5", ""].includes(scheme)) {
        settings.log.push(`scheme:${scheme}`)
        continue
      }
      assign(scheme, address)
    }
  if (parsed > 0 && invalidCount === parsed && routes.size === 0 && !socks) return { invalid: true, http: "", https: "", socks: "" }
  const both = routes.get("both")
  return {
    invalid: false,
    http: both ?? routes.get("http") ?? "",
    https: both ?? routes.get("https") ?? "",
    socks,
  }
}
