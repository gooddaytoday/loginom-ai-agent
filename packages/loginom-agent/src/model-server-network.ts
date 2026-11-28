import { modelServerSecretMinLength } from "@loginom-ai-agent/loginom-host/model-server-key"
import { Buffer } from "node:buffer"
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

function redactBody(body: ReadableStream<Uint8Array>, key: string) {
  const needles = Array.from(new Set([JSON.stringify(key).slice(1, -1), key]), (value) => Buffer.from(value))
  const mask = Buffer.from("[redacted]".includes(key) ? "…" : "[redacted]")
  let pending = Buffer.alloc(0)

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, stream) {
        const bytes = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)
        let offset = 0

        while (offset < bytes.length) {
          let first = bytes.length
          let length = 0
          for (const needle of needles) {
            const found = bytes.indexOf(needle, offset)
            if (found < 0 || found >= first) continue
            first = found
            length = needle.length
          }
          if (!length) break
          if (first > offset) stream.enqueue(bytes.subarray(offset, first))
          stream.enqueue(mask)
          offset = first + length
        }

        let end = bytes.length
        for (const needle of needles) {
          for (let start = Math.max(offset, bytes.length - needle.length + 1); start < end; start++) {
            if (!bytes.subarray(start).equals(needle.subarray(0, bytes.length - start))) continue
            end = start
            break
          }
        }
        if (end > offset) stream.enqueue(bytes.subarray(offset, end))
        pending = Buffer.from(bytes.subarray(end))
      },
      flush(stream) {
        if (pending.length) stream.enqueue(pending)
      },
    }),
  )
}

export const modelServerFetch = Object.assign(
  async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
    const target = await resolveModelServer(request.url, request.signal)
    if (!target.ok) throw new Error("Model server address is not allowed")
    const reply = await target.request(request)
    const key = request.headers.get("authorization")?.match(/^Bearer (.+)$/iu)?.[1]
    if (!key || key.length < modelServerSecretMinLength || !reply.body) return reply

    const headers = new Headers(reply.headers)
    headers.delete("content-length")
    return new Response(redactBody(reply.body, key), { status: reply.status, statusText: reply.statusText, headers })
  },
  { preconnect: fetch.preconnect },
)
