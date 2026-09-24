import { isIPv6 } from "node:net"

export type ParsedAddress =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "http"; url: string; auth: boolean }
  | { kind: "socks"; url: string; auth: boolean }

// Учётные данные из адреса ОС не переносятся: в env попадает только http://host:port.
export function parseProxyAddress(value: string): ParsedAddress {
  const raw = value.trim()
  if (!raw) return { kind: "empty" }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)
  if (scheme) return parseUrlAddress(raw, scheme[1].toLowerCase())
  const at = raw.lastIndexOf("@")
  const body = at >= 0 ? raw.slice(at + 1) : raw
  const parsed = splitHostPort(body)
  if (!parsed) return { kind: "invalid" }
  return { kind: "http", url: formatHttp(parsed.host, parsed.port), auth: at >= 0 }
}

function parseUrlAddress(raw: string, protocol: string): ParsedAddress {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { kind: "invalid" }
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) return { kind: "invalid" }
  const auth = url.username !== "" || url.password !== ""
  if (!validHost(url.hostname)) return { kind: "invalid" }
  if (url.port && !validPort(url.port)) return { kind: "invalid" }
  if (protocol === "socks" || protocol === "socks4" || protocol === "socks5")
    return { kind: "socks", url: formatHttp(url.hostname, url.port || "1080"), auth }
  if (protocol !== "http" && protocol !== "https") return { kind: "invalid" }
  if (protocol === "https") return { kind: "http", url: formatHttps(url.hostname, url.port || "443"), auth }
  return { kind: "http", url: formatHttp(url.hostname, url.port), auth }
}

function splitHostPort(body: string): { host: string; port: string } | undefined {
  if (body.startsWith("[")) {
    const end = body.indexOf("]")
    if (end < 1) return undefined
    const host = body.slice(1, end)
    const rest = body.slice(end + 1)
    if (rest && !rest.startsWith(":")) return undefined
    if (!validHost(host) || (rest.slice(1) && !validPort(rest.slice(1)))) return undefined
    return { host, port: rest.slice(1) }
  }
  const colon = body.lastIndexOf(":")
  if (colon > 0 && body.indexOf(":") === colon) {
    const host = body.slice(0, colon)
    const port = body.slice(colon + 1)
    if (!validHost(host) || !validPort(port)) return undefined
    return { host, port }
  }
  if (!validHost(body)) return undefined
  return { host: body, port: "" }
}

function formatHttp(host: string, port: string) {
  return formatScheme("http", host, port)
}

function formatHttps(host: string, port: string) {
  const bare = unbracket(host)
  const shown = bare.includes(":") ? `[${bare}]` : bare
  return `https://${shown}:${port || "443"}`
}

function formatScheme(protocol: "http", host: string, port: string) {
  const bare = unbracket(host)
  const shown = bare.includes(":") ? `[${bare}]` : bare
  if (!port || port === "80") return `${protocol}://${shown}`
  return `${protocol}://${shown}:${port}`
}

function validPort(port: string) {
  if (!/^\d+$/.test(port)) return false
  const value = Number(port)
  return value >= 1 && value <= 65535
}

function validHost(host: string) {
  const bare = unbracket(host)
  if (!bare || bare.length > 253) return false
  if (bare.includes(":")) return isIPv6(bare)
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare)) return bare.split(".").every((part) => Number(part) <= 255)
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(bare)
}

function unbracket(host: string) {
  if (host.startsWith("[") && host.endsWith("]") && host.length > 2) return host.slice(1, -1)
  return host
}

export function proxyHostPort(url: string) {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}
