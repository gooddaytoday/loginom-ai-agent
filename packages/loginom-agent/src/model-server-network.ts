import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP } from "node:net"
import { Readable } from "node:stream"
import { ServiceHost } from "./host"

const blocked = new BlockList()
blocked.addSubnet("169.254.0.0", 16)
blocked.addSubnet("fe80::", 10, "ipv6")
blocked.addAddress("fd00:ec2::254", "ipv6")
blocked.addAddress("100.100.100.200")

const loopback = new BlockList()
loopback.addSubnet("127.0.0.0", 8)
loopback.addAddress("::1", "ipv6")

const familyOf = (address: string) => (address.includes(":") ? "ipv6" : "ipv4")
const canTryNextAddress = (error: unknown) =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "ECONNREFUSED" || error.code === "ENETUNREACH" || error.code === "EHOSTUNREACH")

export async function resolveModelServer(input: string, deviceOnly: boolean, signal: AbortSignal) {
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
  if (deviceOnly && answers.some((answer) => !loopback.check(answer, familyOf(answer))))
    return { ok: false, issue: "modelServerDeviceOnly" } as const

  const send = url.protocol === "https:" ? httpsRequest : httpRequest
  return {
    ok: true,
    request: async (init: Request | RequestInit) => {
      const request = init instanceof Request ? init : new Request(url.href, init)
      const headers = Object.fromEntries(request.headers)
      const body = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined

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
              agent: false,
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

export const modelServerFetch = Object.assign(
  async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
    const target = await resolveModelServer(request.url, ServiceHost.connectionSettings.deviceOnly(), request.signal)
    if (!target.ok) throw new Error("Model server address is not allowed")
    return target.request(request)
  },
  { preconnect: fetch.preconnect },
)
