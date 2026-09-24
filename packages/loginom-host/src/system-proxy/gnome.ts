import { parseProxyAddress } from "./address"
import { emptySettings, invalidSettings, type SystemProxySettings } from "./types"

export function parseGnomeSettings(input: string): SystemProxySettings {
  if (typeof input !== "string") return invalidSettings("gnome", "gnome")
  const values = new Map<string, unknown>()
  for (const line of input.split(/\r?\n/)) {
    const match = /^(org\.gnome\.system\.proxy(?:\.[a-z]+)?) ([\w-]+) (.*)$/.exec(line.trim())
    if (!match) continue
    values.set(`${match[1]}.${match[2]}`, parseGVariant(match[3]))
  }
  const settings = emptySettings("gnome", "gnome")
  const mode = values.get("org.gnome.system.proxy.mode")
  const manual = mode === "manual"
  settings.bypass = gnomeBypass(values.get("org.gnome.system.proxy.ignore-hosts"))
  const http = manual ? gnomeProxy("http", values, settings) : ""
  const https = manual ? gnomeProxy("https", values, settings) || http : ""
  const socks = manual ? gnomeProxy("socks", values, settings) : ""
  settings.http = http
  settings.https = https
  settings.socks = socks
  settings.authRequired = values.get("org.gnome.system.proxy.http.use-authentication") === true
  if (mode === "auto") {
    settings.mode = "automatic"
    settings.automatic = true
    const url = values.get("org.gnome.system.proxy.autoconfig-url")
    if (typeof url === "string" && url.trim()) settings.pacUrl = url.trim()
  }
  if (mode === "manual" && (http || https || socks)) settings.mode = "manual"
  if (mode !== "none" && mode !== "manual" && mode !== "auto" && mode !== undefined) settings.invalid = true
  if (settings.invalid) return invalidSettings("gnome", "gnome")
  return settings
}

function gnomeProxy(scheme: string, values: Map<string, unknown>, settings: SystemProxySettings) {
  const host = values.get(`org.gnome.system.proxy.${scheme}.host`)
  const port = values.get(`org.gnome.system.proxy.${scheme}.port`)
  if (host === "" && port === 0) return ""
  if (host === undefined && port === undefined) return ""
  if (typeof host !== "string" || typeof port !== "number" || !Number.isInteger(port)) {
    settings.invalid = true
    return ""
  }
  if (!host || port === 0) return ""
  const parsed = parseProxyAddress(joinHostPort(host, port))
  if (parsed.kind !== "http") {
    settings.invalid = true
    return ""
  }
  if (parsed.auth) settings.authRequired = true
  return parsed.url
}

function joinHostPort(host: string, port: number) {
  const stripped = host.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
  if (stripped.startsWith("[")) {
    const end = stripped.indexOf("]")
    const name = end > 1 ? stripped.slice(1, end) : stripped
    return `[${name}]:${port}`
  }
  const colon = stripped.lastIndexOf(":")
  const hostPort = colon > 0 && stripped.indexOf(":") === colon && /^\d+$/.test(stripped.slice(colon + 1))
  const bare = hostPort ? stripped.slice(0, colon) : stripped
  if (bare.includes(":")) return `[${bare}]:${port}`
  return `${bare}:${port}`
}

function gnomeBypass(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (typeof item === "string" ? item.split(",") : [])).map((item) => item.trim())
}

export function parseGVariant(value: string): unknown {
  const text = value.trim()
  if (text.startsWith("@as ")) return parseGVariant(text.slice(4).trim())
  if (text === "true") return true
  if (text === "false") return false
  if (text === "nothing" || text === "null") return undefined
  if (/^-?\d+$/.test(text)) return Number(text)
  if (text.startsWith("'")) return unquote(text)
  if (text.startsWith("[")) return parseArray(text)
  return text
}

function unquote(value: string) {
  if (!value.endsWith("'") || value.length < 2) return value
  return value
    .slice(1, -1)
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
}

function parseArray(value: string): unknown[] {
  if (!value.endsWith("]")) return []
  const body = value.slice(1, -1).trim()
  if (!body) return []
  const items: string[] = []
  let current = ""
  let quote = false
  let escape = false
  for (const char of body) {
    if (escape) {
      current += char
      escape = false
      continue
    }
    if (char === "\\") {
      current += char
      escape = true
      continue
    }
    if (char === "'") quote = !quote
    if (char === "," && !quote) {
      items.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  if (current.trim()) items.push(current.trim())
  return items.map((item) => parseGVariant(item))
}
