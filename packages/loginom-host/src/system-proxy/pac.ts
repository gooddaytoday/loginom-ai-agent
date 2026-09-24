import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { tokenizer, tokTypes } from "acorn"

import { parseProxyAddress } from "./address"

const PAC_MAX_BYTES = 1024 * 1024

export type PacProxy = {
  http: string
  socks: string
  ambiguous: boolean
}

export async function loadPacScript(url: string) {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      readPacScript(url, abort.signal),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          abort.abort()
          resolve(undefined)
        }, 1500)
      }),
    ])
  } catch {
    return
  } finally {
    clearTimeout(timer)
    abort.abort()
  }
}

async function readPacScript(url: string, signal: AbortSignal) {
  if (url.startsWith("file:")) {
    const file = new URL(url)
    // Каналы и устройства могут зависнуть уже при открытии; PAC должен быть обычным файлом.
    const info = await stat(file)
    if (!info.isFile() || info.size > PAC_MAX_BYTES) return
    signal.throwIfAborted()
    return readPacText(createReadStream(file, { signal }))
  }
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) return
  return readPacText(responseChunks(response.body))
}

async function* responseChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
      yield chunk.value
    }
  } finally {
    await reader.cancel()
  }
}

async function readPacText(chunks: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  for await (const chunk of chunks) {
    bytes += chunk.byteLength
    if (bytes > PAC_MAX_BYTES) return
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}

// CLI не исполняет PAC. Если в скрипте ровно один HTTP(S)-адрес, берём его:
// так устроены локальные PAC многих VPN-клиентов.
export function proxyFromPacScript(script: string): PacProxy {
  const tokens = pacTokens(script)
  if (!tokens || hasStandaloneDirect(tokens.source, tokens.quoted)) return { http: "", socks: "", ambiguous: true }
  const http = new Set<string>()
  const socks = new Set<string>()
  const pattern = /\b(DIRECT|QUIC|PROXY|HTTPS|SOCKS4|SOCKS5|SOCKS)\b(?:\s+("[^"]+"|'[^']+'|[^\s;"']+))?/gi
  for (const match of tokens.source.matchAll(pattern)) {
    const kind = match[1].toUpperCase()
    const token = match[2]?.replace(/^['"]|['"]$/g, "")
    if (kind === "DIRECT" || kind === "QUIC" || !token) continue
    const parsed = parseProxyAddress(
      token.includes("://") ? token : `${kind === "HTTPS" ? "https" : "http"}://${token}`,
    )
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

function pacTokens(script: string) {
  const source: string[] = []
  const quoted: string[] = []
  try {
    // Токенизатор пропускает комментарии и различает regexp и деление, не исполняя PAC.
    for (const token of tokenizer(script, { ecmaVersion: "latest" })) {
      if (token.type === tokTypes.regexp) continue
      const text = script.slice(token.start, token.end)
      if (token.type === tokTypes.string || token.type === tokTypes.template) quoted.push(text)
      source.push(text)
    }
    return { source: source.join(" "), quoted }
  } catch {
    return undefined
  }
}

function hasStandaloneDirect(script: string, quoted: string[]) {
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
    const parsed = parseProxyAddress(
      match[2].includes("://") ? match[2] : `${kind === "HTTPS" ? "https" : "http"}://${match[2]}`,
    )
    if (parsed.kind !== "http" && parsed.kind !== "socks") return { direct: false, http: "", socks: "" }
    if (kind === "PROXY" || kind === "HTTPS") return { direct: false, http: parsed.url, socks: "" }
    return { direct: false, http: "", socks: parsed.url }
  }
  return { direct: true, http: "", socks: "" }
}
