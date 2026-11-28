import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP } from "node:net"
import { Readable } from "node:stream"
import { OpenAIChatEvent } from "@opencode/ai/protocols/openai-chat"
import type { SchemaAST } from "effect"
import { HttpsProxyAgent } from "https-proxy-agent"

const blocked = new BlockList()
blocked.addSubnet("169.254.0.0", 16)
blocked.addSubnet("fe80::", 10, "ipv6")
blocked.addAddress("fd00:ec2::254", "ipv6")
blocked.addAddress("100.100.100.200")

const familyOf = (address: string) => (address.includes(":") ? "ipv6" : "ipv4")
const canTryNextAddress = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ECONNREFUSED" || error.code === "ENETUNREACH" || error.code === "EHOSTUNREACH")

function proxyFor(url: URL) {
  const env = (name: string) => process.env[name.toLowerCase()] || process.env[name]
  const unbracket = (host: string) => host.replace(/^\[|\]$/gu, "")
  const hostname = unbracket(url.hostname.toLowerCase())
  const port = url.port || (url.protocol === "https:" ? "443" : "80")
  if (
    env("NO_PROXY")
      ?.toLowerCase()
      .split(/[\s,]+/u)
      .some((rule) => {
        if (rule === "*") return true
        const match = /^([^:]+|\[[^\]]+\]):(\d+)$/u.exec(rule)
        if (match && match[2] !== port) return false
        const host = unbracket(match?.[1] ?? rule)
        if (host.startsWith("*")) return hostname.endsWith(host.slice(1))
        return host.startsWith(".") ? hostname.endsWith(host) : hostname === host
      })
  )
    return
  return env(url.protocol === "https:" ? "HTTPS_PROXY" : "HTTP_PROXY") || env("ALL_PROXY")
}

export async function resolveModelServer(input: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const url = new URL(input)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Invalid model server protocol")
  const hostname = url.hostname.replace(/^\[|\]$/gu, "")
  const literal = isIP(hostname) !== 0
  const answers = literal ? [hostname] : (await lookup(hostname, { all: true })).map(({ address }) => address)
  signal.throwIfAborted()
  if (!answers.length) throw new Error("Could not resolve model server")
  if (answers.some((answer) => blocked.check(answer, familyOf(answer))))
    return { ok: false, issue: "modelServerAddressBlocked" } as const

  const send = url.protocol === "https:" ? httpsRequest : httpRequest
  return {
    ok: true,
    request: async (init: Request | RequestInit) => {
      const request = init instanceof Request ? init : new Request(url.href, init)
      const headers = Object.fromEntries(request.headers)
      const body = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined
      const proxy = proxyFor(url)
      const proxyURL = proxy ? new URL(proxy) : undefined
      if (proxyURL && proxyURL.protocol !== "http:" && proxyURL.protocol !== "https:")
        throw new Error("Unsupported model server proxy protocol")
      const agent = proxyURL ? new HttpsProxyAgent(proxyURL) : false
      if (agent) agent.connectOpts.signal = request.signal

      const connect = (address: string) =>
        new Promise<Response>((resolve, reject) => {
          const outgoing = send(
            {
              hostname: address,
              servername: literal ? undefined : hostname,
              port: url.port,
              path: `${url.pathname}${url.search}`,
              method: request.method,
              headers: { ...headers, host: url.host, "accept-encoding": "identity" },
              signal: request.signal,
              agent,
            },
            (incoming) => {
              const status = incoming.statusCode ?? 502
              if (status >= 300 && status < 400) {
                incoming.destroy()
                reject(new Error("Model server redirects are not allowed"))
                return
              }
              const headers = new Headers()
              for (const [name, values] of Object.entries(incoming.headers)) {
                for (const value of typeof values === "string" ? [values] : (values ?? [])) headers.append(name, value)
              }
              const noBody = request.method === "HEAD" || status === 204 || status === 205
              if (noBody) incoming.resume()
              resolve(new Response(noBody ? null : Readable.toWeb(incoming), { status, headers }))
            },
          )
          outgoing.on("error", reject)
          outgoing.end(body)
        })

      for (const [index, address] of answers.entries()) {
        try {
          return await connect(address)
        } catch (error) {
          if (index === answers.length - 1 || !canTryNextAddress(error)) throw error
        }
      }
      throw new Error("Could not reach model server")
    },
  } as const
}

function declaredFields(ast: SchemaAST.AST): string[] {
  switch (ast._tag) {
    case "Objects":
      return ast.propertySignatures.flatMap(({ name, type }) => [String(name), ...declaredFields(type)])
    case "Arrays":
      return [...ast.elements, ...ast.rest].flatMap(declaredFields)
    case "Union":
      return ast.types.flatMap(declaredFields)
    default:
      return []
  }
}

const completionFields = new Set(declaredFields(OpenAIChatEvent.ast))
const sseFields = new Set(["", "data", "event", "id", "retry"])

function redactEventStream(body: ReadableStream<Uint8Array>, key: string, mask: string) {
  const escapedKey = JSON.stringify(key).slice(1, -1)
  const redactRaw = (text: string) => text.replaceAll(escapedKey, mask).replaceAll(key, mask)
  const redact = (frame: string) => {
    const lines = frame.split("\n")
    const payload = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /u, ""))
      .join("\n")
    let data = payload
    if (payload && payload !== "[DONE]" && payload !== ": keepalive") {
      try {
        JSON.parse(payload)
        data = payload.replace(/("(?:[^"\\]|\\.)*")(\s*:)?/gu, (match, token: string, field?: string) => {
          const value: unknown = JSON.parse(token)
          if (typeof value !== "string" || !value.includes(key) || (field && completionFields.has(value))) return match
          return JSON.stringify(value.replaceAll(key, mask)) + (field ?? "")
        })
      } catch {
        data = redactRaw(payload)
      }
    }

    let replaced = false
    return lines
      .flatMap((line) => {
        if (!line.startsWith("data:")) {
          const colon = line.indexOf(":")
          const field = colon < 0 ? line : line.slice(0, colon)
          if (!sseFields.has(field)) return redactRaw(line)
          return colon < 0 ? line : line.slice(0, colon + 1) + redactRaw(line.slice(colon + 1))
        }
        if (data === payload) return line
        if (replaced) return []
        replaced = true
        return data.split("\n").map((value) => `data: ${value}`)
      })
      .join("\n")
  }

  let pending = ""
  let endedWithCR = false
  return body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, stream) {
          if (!chunk) return
          const text = endedWithCR && chunk.startsWith("\n") ? chunk.slice(1) : chunk
          endedWithCR = chunk.endsWith("\r")
          const frames = (pending + text.replace(/\r\n?/gu, "\n")).split("\n\n")
          pending = frames.pop() ?? ""
          if (pending.length > 10 * 1024 * 1024) throw new Error("Model server event is too large")
          for (const frame of frames) stream.enqueue(redact(frame) + "\n\n")
        },
        flush(stream) {
          if (pending) stream.enqueue(redact(pending))
        },
      }),
    )
    .pipeThrough(new TextEncoderStream())
}

export const modelServerFetch = Object.assign(
  async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
    const target = await resolveModelServer(request.url, request.signal)
    if (!target.ok) throw new Error("Model server address is not allowed")
    const reply = await target.request(request)
    const key = request.headers.get("authorization")?.match(/^Bearer (.+)$/iu)?.[1]
    if (!key || !reply.body) return reply

    const mask = "[redacted]".includes(key) ? "…" : "[redacted]"
    const headers = new Headers(reply.headers)
    headers.delete("content-length")
    const response = { status: reply.status, statusText: reply.statusText, headers }
    if (reply.ok) {
      const isEventStream =
        headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "text/event-stream" ||
        new URL(request.url).pathname.endsWith("/chat/completions")
      return isEventStream ? new Response(redactEventStream(reply.body, key, mask), response) : reply
    }

    const text = await reply.text()
    let body = text
    try {
      body = JSON.stringify(JSON.parse(text))
    } catch {}
    body = body.replaceAll(JSON.stringify(key).slice(1, -1), mask).replaceAll(key, mask)
    return new Response(body, response)
  },
  { preconnect: fetch.preconnect },
)
