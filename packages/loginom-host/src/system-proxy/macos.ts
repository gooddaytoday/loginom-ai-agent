import { emptySettings, invalidSettings, type SystemProxySettings } from "./types"

export function parseMacosSettings(input: string): SystemProxySettings {
  if (typeof input !== "string" || !/^<dictionary>\s*\{/.test(input.trim())) return invalidSettings("macos", "macos")
  const parsed = readDictionary(input)
  if (!parsed) return invalidSettings("macos", "macos")
  const settings = emptySettings("macos", "macos")
  settings.scopedIgnored = parsed.scoped
  if (parsed.scoped) settings.log.push("scoped")
  const enabled = (key: string) => flag(parsed.values, key, settings)
  settings.automatic = enabled("ProxyAutoConfigEnable") || enabled("ProxyAutoDiscoveryEnable")
  settings.simpleHostnames = enabled("ExcludeSimpleHostnames")
  settings.pacUrl = parsed.values.get("ProxyAutoConfigURLString") ?? ""
  settings.bypass = parsed.exceptions
  const http = endpoint("HTTP", enabled, parsed.values, settings)
  const https = endpoint("HTTPS", enabled, parsed.values, settings)
  const socks = endpoint("SOCKS", enabled, parsed.values, settings)
  if (settings.invalid) return invalidSettings("macos", "macos")
  if (enabled("FTPEnable")) settings.log.push("ftp")
  settings.authRequired =
    (enabled("HTTPEnable") && enabled("HTTPRequiresPassword")) ||
    (enabled("HTTPSEnable") && enabled("HTTPSRequiresPassword")) ||
    (enabled("SOCKSEnable") && enabled("SOCKSRequiresPassword"))
  settings.http = http
  settings.https = https
  settings.socks = socks
  if (http || https || socks) settings.mode = "manual"
  else if (settings.pacUrl || enabled("ProxyAutoConfigEnable")) settings.mode = "pac"
  else if (settings.automatic) settings.mode = "automatic"
  return settings
}

function endpoint(
  scheme: string,
  enabled: (key: string) => boolean,
  values: Map<string, string>,
  settings: SystemProxySettings,
) {
  if (!enabled(`${scheme}Enable`)) return ""
  const host = values.get(`${scheme}Proxy`) ?? ""
  const port = values.get(`${scheme}Port`) ?? ""
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !host) {
    settings.invalid = true
    return ""
  }
  const shown = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
  if (port === "80") return `http://${shown}`
  return `http://${shown}:${port}`
}

function flag(values: Map<string, string>, key: string, settings: SystemProxySettings) {
  const value = values.get(key)
  if (value === undefined) return false
  if (value !== "0" && value !== "1") {
    settings.invalid = true
    return false
  }
  return value === "1"
}

function readDictionary(input: string) {
  const values = new Map<string, string>()
  const exceptions: string[] = []
  let depth = 0
  let scoped = false
  let exceptionsDepth = -1
  let duplicate = false
  for (const line of input.split(/\r?\n/)) {
    const match = /^(\s*)(.+?) : (.*)$/.exec(line)
    if (match && depth === 1) {
      const key = match[2].trim()
      if (values.has(key)) duplicate = true
      values.set(key, match[3].trim())
      if (key === "__SCOPED__" || key === "__SUPPLEMENTAL__") scoped = true
      if (key === "ExceptionsList" && match[3].includes("<array>")) exceptionsDepth = depth + 1
    } else if (match && depth === exceptionsDepth) exceptions.push(match[3].trim())
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
    if (exceptionsDepth > 0 && depth < exceptionsDepth) exceptionsDepth = -1
    if (depth < 0) return undefined
  }
  if (duplicate || depth !== 0) return undefined
  return { values, exceptions, scoped }
}
