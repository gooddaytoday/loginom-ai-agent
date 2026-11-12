import { createServer, type IncomingMessage } from "node:http"
import { connect, isIP, type Socket } from "node:net"
import { Transform, type Duplex } from "node:stream"
import tls from "node:tls"
import type { SystemProxyStatus } from "@opencode-ai/app/system-proxy"

type Notice = SystemProxyStatus["notices"][number]
type Target = { host: string; port: number; authority: string }
type Route = { kind: "DIRECT" } | (Target & { kind: "PROXY" | "HTTPS" | "SOCKS5" })
const TIMEOUT = 5000
const STATUS_URL = "https://api.openai.com/v1/models"
const MAX_HEADER = 64 * 1024

export function shouldUseProxyRelay(enabled: boolean, environment: NodeJS.ProcessEnv) {
  if (!enabled || ["off", "0", "false"].includes(environment.LOGINOM_AI_AGENT_SYSTEM_PROXY?.trim().toLowerCase() ?? ""))
    return false
  return !["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some((key) =>
    environment[key]?.trim(),
  )
}

export async function startProxyRelay(input: {
  resolveProxy: (url: string) => Promise<string>
  onNotice?: (notice: Notice) => void
  onStatus?: (status: SystemProxyStatus) => void
}) {
  const sockets = new Set<Socket>()
  const busy = new WeakSet<Duplex>()
  let stopped = false
  let lastError: Notice | undefined
  const server = createServer((request, response) => {
    // One HTTP exchange per client socket: no pooled connection can pin a route.
    // CONNECT switches to an opaque tunnel and may live as long as the caller needs.
    const client = request.socket
    if (busy.has(client)) return client.destroy()
    busy.add(client)
    request.pause()
    void forwardHttp(request).catch(() => {
      if (!client.destroyed) response.writeHead(502, { Connection: "close" }).end()
    })
  })
  server.on("connection", track)
  server.on("connect", (request, client, head) => {
    client.pause()
    void (async () => {
      const target = parseTarget(request.url ?? "")
      const selected = await select(`https://${target.authority}/`, target, true, client)
      if (!selected) return
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      selected.socket.write(head)
      tunnel(client, selected.socket)
    })().catch(() => {
      if (!client.destroyed) client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("PROXY_RELAY_ADDRESS")
  const port = address.port
  const url = `http://127.0.0.1:${port}`
  const noProxy = "127.0.0.1,localhost,::1,[::1]"
  let closing: Promise<void> | undefined
  return {
    url,
    environment: {
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      NODE_USE_ENV_PROXY: "1",
      NO_PROXY: noProxy,
      no_proxy: noProxy,
    } satisfies Record<string, string>,
    async status(): Promise<SystemProxyStatus> {
      try {
        // First of MODEL_PROXY_URLS: the product talks to OpenAI by default.
        return statusFor(await resolveRoutes(STATUS_URL))
      } catch (error) {
        const code = error instanceof Error && error.message === "PROXY_RESOLVE_TIMEOUT" ? "timeout" : "internal"
        return { state: "failed", enabled: true, notices: [lastError ?? { code }] }
      }
    },
    stop() {
      stopped = true
      closing ??= new Promise<void>((resolve) => {
        server.close(() => resolve())
        for (const socket of sockets) socket.destroy()
      })
      return closing
    },
  }

  function track(socket: Socket) {
    sockets.add(socket)
    // Readers install their own rejection handler. Keep errors between async
    // handshake steps from becoming unhandled process errors.
    socket.on("error", () => undefined)
    socket.once("close", () => sockets.delete(socket))
    return socket
  }

  async function resolveRoutes(targetUrl: string) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const routes = parseRoutes(
        await Promise.race([
          input.resolveProxy(targetUrl),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("PROXY_RESOLVE_TIMEOUT")), TIMEOUT)
          }),
        ]),
      )
      if (!routes.length) throw new Error("PROXY_RESOLVE_EMPTY")
      return routes
    } finally {
      clearTimeout(timer)
    }
  }

  function statusFor(routes: Route[]): SystemProxyStatus {
    const first = routes[0]
    const target = first && first.kind !== "DIRECT" ? first.authority : undefined
    return {
      state: lastError?.code === "unreachable" ? "failed" : target ? "applied" : "direct",
      enabled: true,
      http: target,
      https: target,
      notices: lastError ? [lastError] : [],
    }
  }

  // Publish only when the outcome changes: every connection reaches here, and
  // each status update is broadcast to all windows.
  function report(notice: Notice, routes: Route[]) {
    const changed = lastError?.code !== notice.code || lastError?.detail !== notice.detail
    lastError = notice
    if (!changed) return
    input.onNotice?.(notice)
    input.onStatus?.(statusFor(routes))
  }

  async function select(targetUrl: string, target: Target, connectRequest: boolean, client: Duplex) {
    const routes = await resolveRoutes(targetUrl).catch(() => {
      report({ code: "unreachable", detail: target.authority }, [])
      throw new Error("PROXY_RESOLVE_FAILED")
    })
    let failed = target.authority
    for (const route of routes) {
      if (stopped || client.destroyed) throw new Error("PROXY_RELAY_CLOSED")
      const endpoint = route.kind === "DIRECT" ? target : route
      failed = endpoint.authority
      // A misconfigured PAC pointing at this listener must not recurse either.
      if (endpoint.port === port && (["localhost", "::1", "0.0.0.0"].includes(endpoint.host) || endpoint.host.startsWith("127.")))
        continue
      // Deliberately never use http.request/fetch: main's global env proxy may
      // be active, and routing through it would bypass Chromium or form a loop.
      const socket = track(
        route.kind === "HTTPS"
          ? tls.connect({
              host: endpoint.host,
              port: endpoint.port,
              servername: isIP(endpoint.host) ? undefined : endpoint.host,
            })
          : connect({ host: endpoint.host, port: endpoint.port }),
      )
      const cancel = () => socket.destroy()
      client.once("close", cancel)
      socket.once("close", () => client.removeListener("close", cancel))
      const timer = setTimeout(() => socket.destroy(new Error("PROXY_CONNECT_TIMEOUT")), TIMEOUT)
      try {
        await new Promise<void>((resolve, reject) => {
          const ready = route.kind === "HTTPS" ? "secureConnect" : "connect"
          const done = () => {
            cleanup()
            resolve()
          }
          const error = () => {
            cleanup()
            reject(new Error("PROXY_CONNECT_FAILED"))
          }
          const cleanup = () => {
            socket.removeListener(ready, done)
            socket.removeListener("error", error)
            socket.removeListener("close", error)
          }
          socket.once(ready, done)
          socket.once("error", error)
          socket.once("close", error)
        })
        if (route.kind === "SOCKS5") await socksConnect(socket, target)
        if (connectRequest && (route.kind === "PROXY" || route.kind === "HTTPS")) {
          socket.write(`CONNECT ${target.authority} HTTP/1.1\r\nHost: ${target.authority}\r\n\r\n`)
          const header = await readHeader(socket)
          const code = responseCode(header)
          if (code === 407) {
            report({ code: "auth-required", detail: route.authority }, routes)
            client.write(header)
            tunnel(client, socket)
            return
          }
          if (code < 200 || code >= 300) throw new Error("PROXY_CONNECT_REJECTED")
        }
        if (lastError) {
          lastError = undefined
          input.onStatus?.(statusFor(routes))
        }
        return { socket, route, routes }
      } catch {
        socket.destroy()
      } finally {
        clearTimeout(timer)
      }
    }
    report({ code: "unreachable", detail: failed }, routes)
    throw new Error("PROXY_UPSTREAM_UNREACHABLE")
  }

  async function forwardHttp(request: IncomingMessage) {
    const client = request.socket
    const destination = new URL(request.url ?? "")
    if (destination.protocol !== "http:" || destination.username || destination.password)
      throw new Error("PROXY_HTTP_URL")
    const target = parseTarget(destination.host, 80)
    const selected = await select(destination.href, target, false, client)
    if (!selected) return
    const upstream = selected.socket
    const absolute = selected.route.kind === "PROXY" || selected.route.kind === "HTTPS"
    const path = absolute ? destination.href : `${destination.pathname}${destination.search}`
    const headers = request.rawHeaders
      .flatMap((value, i, raw) => {
        if (i % 2 || ["connection", "proxy-connection", "proxy-authorization"].includes(value.toLowerCase())) return []
        return [`${value}: ${raw[i + 1]}\r\n`]
      })
      .join("")
    upstream.write(`${request.method} ${path} HTTP/${request.httpVersion}\r\n${headers}Connection: close\r\n\r\n`)
    // IncomingMessage decodes chunk framing. Re-encode it without buffering the
    // body so uploads keep backpressure and trailers remain valid on the wire.
    const chunked = Boolean(request.headers["transfer-encoding"])
    const body = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        callback(
          null,
          chunked
            ? Buffer.concat([Buffer.from(`${chunk.length.toString(16)}\r\n`), chunk, Buffer.from("\r\n")])
            : chunk,
        )
      },
      flush(callback) {
        if (chunked) {
          this.push("0\r\n")
          for (let i = 0; i < request.rawTrailers.length; i += 2)
            this.push(`${request.rawTrailers[i]}: ${request.rawTrailers[i + 1]}\r\n`)
          this.push("\r\n")
        }
        callback()
      },
    })
    request.once("error", () => upstream.destroy())
    body.on("error", () => upstream.destroy())
    upstream.once("close", () => {
      request.unpipe(body)
      body.destroy()
    })
    request.pipe(body).pipe(upstream, { end: false })
    try {
      let header = await readHeader(upstream)
      while (responseCode(header) < 200) {
        client.write(header)
        header = await readHeader(upstream)
      }
      if (responseCode(header) === 407 && absolute)
        report(
          {
            code: "auth-required",
            detail: selected.route.kind === "DIRECT" ? target.authority : selected.route.authority,
          },
          selected.routes,
        )
      // The request explicitly asks upstream to close. Advertise that on the
      // response too, including upstreams which insist on keep-alive.
      // 407 too: the client must not retry on this socket, the relay serves one request per connection.
      client.write(
        Buffer.from(
          header
            .toString("latin1")
            .replace(/\r\nConnection:[^\r\n]*/gi, "")
            .replace(/\r\n\r\n$/, "\r\nConnection: close\r\n\r\n"),
          "latin1",
        ),
      )
      upstream.once("error", () => client.destroy())
      upstream.once("close", () => client.end())
      upstream.pipe(client)
    } catch {
      upstream.destroy()
      report(
        { code: "unreachable", detail: selected.route.kind === "DIRECT" ? target.authority : selected.route.authority },
        selected.routes,
      )
      throw new Error("PROXY_HTTP_RESPONSE")
    }
  }
}

function parseTarget(authority: string, defaultPort?: number): Target {
  const url = new URL(`http://${authority}`)
  const port = Number(url.port || defaultPort || (/:80$/.test(authority) ? 80 : 0))
  if (
    !url.hostname ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    (!port && !/:0$/.test(authority)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("PROXY_TARGET")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  return { host, port, authority: `${isIP(host) === 6 ? `[${host}]` : host}:${port}` }
}

function parseRoutes(resolution: string): Route[] {
  return resolution.split(";").flatMap((entry): Route[] => {
    const value = entry.trim()
    if (value.toUpperCase() === "DIRECT") return [{ kind: "DIRECT" }]
    const match = /^(PROXY|HTTPS|SOCKS5|SOCKS)\s+(.+)$/i.exec(value)
    if (!match) return []
    const kind = match[1].toUpperCase()
    try {
      return [{ ...parseTarget(match[2]), kind: kind === "SOCKS" ? "SOCKS5" : (kind as "PROXY" | "HTTPS" | "SOCKS5") }]
    } catch {
      return []
    }
  })
}

function tunnel(client: Duplex, upstream: Socket) {
  client.once("error", () => upstream.destroy())
  upstream.once("error", () => client.destroy())
  client.once("close", () => upstream.destroy())
  upstream.once("close", () => client.end())
  client.pipe(upstream).pipe(client)
}

function responseCode(header: Buffer) {
  const match = /^HTTP\/1\.[01] (\d{3})(?:\s|\r)/.exec(header.toString("latin1"))
  if (!match) throw new Error("PROXY_RESPONSE")
  return Number(match[1])
}

function readHeader(socket: Socket) {
  return readSocket(socket, (buffer) => {
    const end = buffer.indexOf("\r\n\r\n")
    return end < 0 ? 0 : end + 4
  })
}

function readSocket(socket: Socket, size: number | ((buffer: Buffer) => number)) {
  return new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const cleanup = () => {
      socket.pause()
      socket.removeListener("data", data)
      socket.removeListener("error", fail)
      socket.removeListener("end", fail)
      socket.removeListener("close", fail)
    }
    const fail = () => {
      cleanup()
      reject(new Error("PROXY_SOCKET_CLOSED"))
    }
    const data = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      const end = typeof size === "number" ? (buffer.length >= size ? size : 0) : size(buffer)
      if (end > MAX_HEADER || (!end && buffer.length > MAX_HEADER)) return fail()
      if (!end) return
      cleanup()
      if (buffer.length > end) socket.unshift(buffer.subarray(end))
      resolve(buffer.subarray(0, end))
    }
    if (socket.destroyed || socket.readableEnded) return fail()
    socket.on("data", data)
    socket.once("error", fail)
    socket.once("end", fail)
    socket.once("close", fail)
    socket.resume()
  })
}

async function socksConnect(socket: Socket, target: Target) {
  socket.write(Buffer.from([5, 1, 0]))
  const greeting = await readSocket(socket, 2)
  if (greeting[0] !== 5 || greeting[1] !== 0) throw new Error("PROXY_SOCKS_AUTH")
  const address = socksAddress(target.host)
  const port = Buffer.alloc(2)
  port.writeUInt16BE(target.port)
  socket.write(Buffer.concat([Buffer.from([5, 1, 0]), address, port]))
  const reply = await readSocket(socket, 4)
  if (reply[0] !== 5 || reply[1] !== 0 || reply[2] !== 0) throw new Error("PROXY_SOCKS_CONNECT")
  if (reply[3] === 1) {
    await readSocket(socket, 6)
    return
  }
  if (reply[3] === 4) {
    await readSocket(socket, 18)
    return
  }
  if (reply[3] === 3) {
    const length = await readSocket(socket, 1)
    await readSocket(socket, length[0] + 2)
    return
  }
  throw new Error("PROXY_SOCKS_ADDRESS")
}

function socksAddress(host: string) {
  if (isIP(host) === 4) return Buffer.from([1, ...host.split(".").map(Number)])
  if (isIP(host) === 6) {
    const [start, end = ""] = host.split("::")
    const left = start.split(":").filter(Boolean)
    const right = end.split(":").filter(Boolean)
    const words = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    const bytes = Buffer.alloc(17)
    bytes[0] = 4
    words.forEach((word, i) => bytes.writeUInt16BE(parseInt(word, 16), 1 + i * 2))
    return bytes
  }
  // Domain form keeps DNS resolution on the SOCKS server.
  const bytes = Buffer.from(host)
  if (bytes.length > 255) throw new Error("PROXY_SOCKS_HOST")
  return Buffer.concat([Buffer.from([3, bytes.length]), bytes])
}
