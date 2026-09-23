import { parseProxyAddress } from "./address"

export type PacProxy = {
  http: string
  socks: string
  ambiguous: boolean
}

// CLI не исполняет PAC. Если в скрипте ровно один HTTP(S)-адрес, берём его:
// так устроены локальные PAC многих VPN-клиентов.
export function proxyFromPacScript(script: string): PacProxy {
  const http = new Set<string>()
  const socks = new Set<string>()
  const pattern = /\b(DIRECT|QUIC|PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\b(?:\s+("[^"]+"|'[^']+'|[^\s;"']+))?/gi
  for (const match of script.matchAll(pattern)) {
    const kind = match[1].toUpperCase()
    const token = match[2]?.replace(/^['"]|['"]$/g, "")
    if (kind === "DIRECT" || kind === "QUIC" || !token) continue
    const parsed = parseProxyAddress(token.includes("://") ? token : `http://${token}`)
    if (parsed.kind !== "http" && parsed.kind !== "socks") continue
    if (kind === "SOCKS" || kind === "SOCKS4" || kind === "SOCKS5" || parsed.kind === "socks") socks.add(parsed.url)
    else http.add(parsed.url)
  }
  return {
    http: http.size === 1 ? [...http][0] : "",
    socks: socks.size === 1 ? [...socks][0] : "",
    ambiguous: http.size > 1 || (http.size === 0 && socks.size > 1),
  }
}

export function parseChromiumResolution(resolution: string) {
  let http = ""
  let socks = ""
  let sawDirect = false
  for (const part of resolution.split(";")) {
    const token = part.trim()
    if (!token) continue
    if (/^DIRECT$/i.test(token)) {
      sawDirect = true
      continue
    }
    const match = /^(PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\s+(\S+)$/i.exec(token)
    if (!match) continue
    const kind = match[1].toUpperCase()
    const parsed = parseProxyAddress(match[2].includes("://") ? match[2] : `http://${match[2]}`)
    if (parsed.kind !== "http" && parsed.kind !== "socks") continue
    if (kind === "PROXY" || kind === "HTTPS") {
      if (!http) http = parsed.url
      continue
    }
    if (!socks) socks = parsed.url
  }
  return { direct: sawDirect && !http && !socks, http, socks }
}
