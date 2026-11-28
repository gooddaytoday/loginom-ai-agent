import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP } from "node:net"
import { Readable } from "node:stream"
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

function redactEventStream(body: ReadableStream<Uint8Array>, key: string, mask: string) {
  const redact = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /u, ""))
      .join("\n")
    if (!data || data === "[DONE]" || data === ": keepalive") return frame

    try {
      const event: unknown = JSON.parse(data)
      if (typeof event !== "object" || event === null || !("error" in event) || !event.error) return frame
      const error = event.error
      if (typeof error === "object" && "message" in error && typeof error.message === "string") {
        const code = "code" in error ? error.code : undefined
        return `data: ${JSON.stringify({
          error: {
            message: error.message.replaceAll(key, mask),
            code: typeof code === "string" ? code.replaceAll(key, mask) : typeof code === "number" ? code : undefined,
          },
        })}`
      }
    } catch {}

    return `data: ${data
      .replaceAll(JSON.stringify(key).slice(1, -1), mask)
      .replaceAll(key, mask)
      .replaceAll("\n", "\ndata: ")}`
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
