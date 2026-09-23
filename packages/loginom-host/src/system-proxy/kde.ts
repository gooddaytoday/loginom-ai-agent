import { parseProxyAddress } from "./address"
import { emptySettings, invalidSettings, type SystemProxySettings } from "./types"

export function parseKdeSettings(input: string): SystemProxySettings {
  if (typeof input !== "string") return invalidSettings("kde", "kde")
  const section = readProxySection(input)
  const settings = emptySettings("kde", "kde")
  const type = Number(section.get("ProxyType") ?? "0")
  if (!Number.isInteger(type) || type < 0 || type > 4) return invalidSettings("kde", "kde")
  settings.reversedExceptions = /^(1|true)$/i.test(section.get("ReversedException") ?? "")
  settings.authRequired = /^(1|true)$/i.test(section.get("AuthMode") ?? "") && section.get("AuthMode") !== "0"
  settings.pacUrl = section.get("Proxy Config Script") ?? ""
  settings.bypass = (section.get("NoProxyFor") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  const http = kdeProxy(section.get("httpProxy") ?? "")
  const https = kdeProxy(section.get("httpsProxy") ?? "")
  const socks = kdeProxy(section.get("socksProxy") ?? "")
  if (http === "invalid" || https === "invalid" || socks === "invalid") return invalidSettings("kde", "kde")
  settings.http = http
  settings.https = https
  settings.socks = socks
  if (type === 1 && (http || https || socks)) settings.mode = "manual"
  if (type === 2) {
    settings.mode = "pac"
    settings.automatic = true
  }
  if (type === 3) {
    settings.mode = "automatic"
    settings.automatic = true
  }
  if (settings.reversedExceptions) settings.log.push("reversed")
  return settings
}

function kdeProxy(value: string) {
  const raw = value.trim()
  if (!raw) return ""
  const spaced = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\S+)\s+(\d+)$/i.exec(raw)
  const address = spaced ? `${spaced[1]}:${spaced[2]}` : raw
  const parsed = parseProxyAddress(address)
  if (parsed.kind === "invalid") return "invalid"
  if (parsed.kind === "empty") return ""
  return parsed.url
}

function readProxySection(input: string) {
  const values = new Map<string, string>()
  let active = false
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      active = trimmed.toLowerCase() === "[proxy settings]"
      continue
    }
    if (!active) continue
    const index = trimmed.indexOf("=")
    if (index < 0) continue
    values.set(trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim())
  }
  return values
}
