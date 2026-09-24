import { readFile } from "node:fs/promises"

import { parseProxyAddress } from "./address"

export type PacProxy = {
  http: string
  socks: string
  ambiguous: boolean
}

// CLI не исполняет PAC. Если в скрипте ровно один HTTP(S)-адрес, берём его:
// так устроены локальные PAC многих VPN-клиентов.
export async function loadPacScript(url: string) {
  try {
    if (url.startsWith("file:")) {
      const text = await readFile(new URL(url), "utf8")
      if (text.length > 1024 * 1024) return
      return text
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return
    const text = await response.text()
    if (text.length > 1024 * 1024) return
    return text
  } catch {
    return
  }
}

export function proxyFromPacScript(script: string): PacProxy {
  const source = script.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
  if (hasStandaloneDirect(source)) return { http: "", socks: "", ambiguous: true }
  const http = new Set<string>()
  const socks = new Set<string>()
  const pattern = /\b(DIRECT|QUIC|PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\b(?:\s+("[^"]+"|'[^']+'|[^\s;"']+))?/gi
  for (const match of source.matchAll(pattern)) {
    const kind = match[1].toUpperCase()
    const token = match[2]?.replace(/^['"]|['"]$/g, "")
    if (kind === "DIRECT" || kind === "QUIC" || !token) continue
    const parsed = parseProxyAddress(token.includes("://") ? token : `${kind === "HTTPS" ? "https" : "http"}://${token}`)
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

function hasStandaloneDirect(script: string) {
  const quoted = script.match(/['"][^'"]*['"]/g) ?? []
  if (quoted.some((quote) => /\bDIRECT\b/i.test(quote) && !/\b(?:PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\b/i.test(quote)))
    return true
  return /\breturn\s+DIRECT\b/i.test(script)
}

export function parseChromiumResolution(resolution: string) {
  const first = resolution
    .split(";")
    .map((part) => part.trim())
    .find(Boolean)
  if (!first || !/^DIRECT$/i.test(first)) {
    const match = first ? /^(PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\s+(\S+)$/i.exec(first) : undefined
    if (!match) return { direct: false, http: "", socks: "" }
    const kind = match[1].toUpperCase()
    const parsed = parseProxyAddress(match[2].includes("://") ? match[2] : `${kind === "HTTPS" ? "https" : "http"}://${match[2]}`)
    if (parsed.kind !== "http" && parsed.kind !== "socks") return { direct: false, http: "", socks: "" }
    if (kind === "PROXY" || kind === "HTTPS") return { direct: false, http: parsed.url, socks: "" }
    return { direct: false, http: "", socks: parsed.url }
  }
  return { direct: true, http: "", socks: "" }
}
