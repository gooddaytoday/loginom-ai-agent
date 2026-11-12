import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { once } from "node:events"
import http from "node:http"
import net from "node:net"
import tls from "node:tls"
import { readFileSync } from "node:fs"
// @ts-expect-error Node's TypeScript loader requires an explicit extension.
import { startProxyRelay, shouldUseProxyRelay } from "./proxy-relay.ts"

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function listen(server: net.Server) {
  const sockets = new Set<net.Socket>()
  server.on("connection", (socket) => {
    sockets.add(socket)
    socket.on("error", () => undefined)
    socket.on("close", () => sockets.delete(socket))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  cleanup.push(() => {
    for (const socket of sockets) socket.destroy()
    return new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const address = server.address() as net.AddressInfo
  return `127.0.0.1:${address.port}`
}

async function relay(resolveProxy: (url: string) => Promise<string>) {
  const result = await startProxyRelay({ resolveProxy })
  cleanup.push(() => result.stop())
  return result
}

function exchange(address: string, request: string) {
  const url = new URL(address.startsWith("http") ? address : `http://${address}`)
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port) })
    const chunks: Buffer[] = []
    socket.setTimeout(12_000, () => socket.destroy(new Error("client timeout")))
    socket.on("connect", () => socket.write(request))
    socket.on("data", (chunk) => chunks.push(chunk))
    socket.on("end", () => resolve(Buffer.concat(chunks).toString()))
    socket.on("error", reject)
  })
}

async function echo() {
  return listen(net.createServer((socket) => socket.once("data", (chunk) => socket.end(chunk))))
}

async function proxy() {
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.end("via-proxy")
  })
  server.on("connect", (req, client, head) => {
    requests.push(`CONNECT ${req.url}`)
    const target = new URL(`http://${req.url}`)
    const upstream = net.connect({ host: target.hostname, port: Number(target.port) }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      upstream.write(head)
      client.pipe(upstream).pipe(client)
    })
    upstream.on("error", () => client.destroy())
    client.on("close", () => upstream.destroy())
  })
  return { address: await listen(server), requests }
}

const connectRequest = (target: string) => `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\ntunnel-payload`

test("CONNECT DIRECT forwards the initial head and resolves the exact target URL", async () => {
  const target = await echo()
  const urls: string[] = []
  const local = await relay(async (url) => {
    urls.push(url)
    return "DIRECT"
  })
  const response = await exchange(local.url, connectRequest(target))
  assert.ok(response.includes("200 Connection Established\r\n\r\ntunnel-payload"))
  assert.deepEqual(urls, [`https://${target}/`])
})

test("CONNECT uses an HTTP upstream proxy", async () => {
  const target = await echo()
  const upstream = await proxy()
  const local = await relay(async () => `PROXY ${upstream.address}`)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.deepEqual(upstream.requests, [`CONNECT ${target}`])
})

test("connection refusal falls back in PAC order to DIRECT", async () => {
  const target = await echo()
  const local = await relay(async () => "PROXY 127.0.0.1:0; DIRECT")
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.deepEqual((await local.status()).notices, [])
})

test("regression: a new connection uses the changed resolver route without restart", async () => {
  const target = await echo()
  const first = await proxy()
  const second = await proxy()
  let route = `PROXY ${first.address}`
  const local = await relay(async () => route)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  route = `PROXY ${second.address}`
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  route = "DIRECT"
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.deepEqual(first.requests, [`CONNECT ${target}`])
  assert.deepEqual(second.requests, [`CONNECT ${target}`])
  assert.equal((await local.status()).state, "direct")
})

test("all upstreams refused returns 502, logs and reports unreachable with address", async () => {
  const notices: unknown[] = []
  const local = await startProxyRelay({
    resolveProxy: async () => "PROXY 127.0.0.1:0",
    onNotice: (notice) => notices.push(notice),
  })
  cleanup.push(() => local.stop())
  assert.ok((await exchange(local.url, connectRequest("example.test:443"))).includes("502 Bad Gateway"))
  assert.deepEqual((await local.status()).notices.at(-1), { code: "unreachable", detail: "127.0.0.1:0" })
  assert.deepEqual(notices.at(-1), { code: "unreachable", detail: "127.0.0.1:0" })
})

test("plain HTTP DIRECT rewrites origin form and preserves body", async () => {
  const requests: string[] = []
  const target = await listen(
    http.createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      requests.push(`${req.method} ${req.url} ${Buffer.concat(chunks)}`)
      res.end("direct-response")
    }),
  )
  const local = await relay(async () => "DIRECT")
  assert.ok(
    (
      await exchange(
        local.url,
        `POST http://${target}/path?q=1 HTTP/1.1\r\nHost: ${target}\r\nContent-Length: 4\r\n\r\nbody`,
      )
    ).includes("direct-response"),
  )
  assert.deepEqual(requests, ["POST /path?q=1 body"])
})

test("plain HTTP PROXY preserves absolute URI", async () => {
  const upstream = await proxy()
  const local = await relay(async () => `PROXY ${upstream.address}`)
  assert.ok(
    (await exchange(local.url, "GET http://example.test/path?q=1 HTTP/1.1\r\nHost: example.test\r\n\r\n")).includes(
      "via-proxy",
    ),
  )
  assert.deepEqual(upstream.requests, ["GET http://example.test/path?q=1"])
})

test("proxy 407 headers and body pass through without DIRECT fallback", async () => {
  const response =
    "HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Negotiate\r\nContent-Length: 4\r\nConnection: close\r\n\r\nauth"
  const upstream = await listen(net.createServer((socket) => socket.once("data", () => socket.end(response))))
  const local = await relay(async () => `PROXY ${upstream}; DIRECT`)
  assert.equal(await exchange(local.url, connectRequest("example.test:443")), response)
  assert.deepEqual((await local.status()).notices.at(-1), { code: "auth-required", detail: upstream })
})

test("relay uses raw sockets even when the environment points back to itself", async () => {
  const target = await echo()
  let calls = 0
  const local = await relay(async () => {
    calls++
    return "DIRECT"
  })
  const keys = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "NO_PROXY", "no_proxy"]
  const previous = keys.map((key) => process.env[key])
  for (const key of keys) process.env[key] = key.toLowerCase() === "no_proxy" ? "" : local.url
  const proxyHttp = http as typeof http & { setGlobalProxyFromEnv(): void }
  proxyHttp.setGlobalProxyFromEnv()
  try {
    assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
    assert.equal(calls, 1)
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]
      else process.env[key] = previous[i]
    })
    proxyHttp.setGlobalProxyFromEnv()
  }
})

test("CONNECT through HTTPS verifies TLS against a trusted test CA", async () => {
  const requests: string[] = []
  const target = await echo()
  const upstream = await listen(
    tls.createServer(
      {
        key: readFileSync(process.env.LOGINOM_PROXY_TEST_KEY!),
        cert: readFileSync(process.env.NODE_EXTRA_CA_CERTS!),
      },
      (socket) => {
        socket.once("data", (chunk) => {
          requests.push(chunk.toString())
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
          socket.once("data", (body) => socket.end(body))
        })
      },
    ),
  )
  const local = await relay(async () => `HTTPS ${upstream}`)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.ok(requests[0].startsWith(`CONNECT ${target} HTTP/1.1\r\n`))
})

async function socks() {
  const targets: string[] = []
  const address = await listen(
    net.createServer((client) => {
      let phase = 0
      let buffered = Buffer.alloc(0)
      const data = (chunk: Buffer) => {
        buffered = Buffer.concat([buffered, chunk])
        if (phase === 0) {
          if (buffered.length < 3) return
          assert.deepEqual(buffered.subarray(0, 3), Buffer.from([5, 1, 0]))
          buffered = buffered.subarray(3)
          phase = 1
          client.write(Buffer.from([5, 0]))
        }
        if (phase !== 1 || buffered.length < 5) return
        const type = buffered[3]
        const length = type === 1 ? 4 : type === 4 ? 16 : buffered[4]
        const offset = type === 3 ? 5 : 4
        if (buffered.length < offset + length + 2) return
        const host =
          type === 1
            ? [...buffered.subarray(offset, offset + length)].join(".")
            : buffered.subarray(offset, offset + length).toString()
        const port = buffered.readUInt16BE(offset + length)
        targets.push(`${host}:${port}`)
        client.removeListener("data", data)
        const upstream = net.connect({ host, port }, () => {
          client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
          client.pipe(upstream).pipe(client)
        })
        upstream.on("error", () => client.destroy())
        client.on("close", () => upstream.destroy())
      }
      client.on("data", data)
    }),
  )
  return { address, targets }
}

test("SOCKS5 and SOCKS routes tunnel CONNECT and plain HTTP", async () => {
  const target = await echo()
  const upstream = await socks()
  const local = await relay(async () => `SOCKS5 ${upstream.address}`)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  const httpTarget = await listen(http.createServer((req, res) => res.end(`socks:${req.url}`)))
  const plain = await relay(async () => `SOCKS ${upstream.address}`)
  assert.ok(
    (await exchange(plain.url, `GET http://${httpTarget}/socks HTTP/1.1\r\nHost: ${httpTarget}\r\n\r\n`)).includes(
      "socks:/socks",
    ),
  )
  assert.deepEqual(upstream.targets, [target, httpTarget])
})

test("a silent proxy handshake times out after 5 seconds then uses DIRECT", async () => {
  const target = await echo()
  const silent = await listen(net.createServer(() => undefined))
  const local = await relay(async () => `PROXY ${silent}; DIRECT`)
  const start = Date.now()
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.ok(Date.now() - start >= 4900)
})

test("chunked upload framing and trailers survive plain HTTP relay", async () => {
  let body = ""
  let trailer: string | string[] | undefined
  const target = await listen(
    http.createServer(async (req, res) => {
      for await (const chunk of req) body += chunk.toString()
      trailer = req.trailers["x-proof"]
      res.end("uploaded")
    }),
  )
  const local = await relay(async () => "DIRECT")
  assert.ok(
    (
      await exchange(
        local.url,
        `POST http://${target}/upload HTTP/1.1\r\nHost: ${target}\r\nTransfer-Encoding: chunked\r\nTrailer: X-Proof\r\n\r\n4\r\nbody\r\n0\r\nX-Proof: received\r\n\r\n`,
      )
    ).includes("uploaded"),
  )
  assert.equal(body, "body")
  assert.equal(trailer, "received")
})

test("plain HTTP 407 is reported without replaying the request", async () => {
  let count = 0
  const upstream = await listen(
    http.createServer((req, res) => {
      count++
      res.writeHead(407, { "Proxy-Authenticate": "Negotiate" }).end("authenticate")
    }),
  )
  const local = await relay(async () => `PROXY ${upstream}; DIRECT`)
  const response = await exchange(local.url, "GET http://example.test/ HTTP/1.1\r\nHost: example.test\r\n\r\n")
  assert.ok(response.includes("407 Proxy Authentication Required"))
  assert.ok(response.includes("Proxy-Authenticate: Negotiate"))
  assert.ok(response.includes("authenticate"))
  assert.ok(response.includes("Connection: close"))
  assert.equal(count, 1)
  assert.deepEqual((await local.status()).notices, [{ code: "auth-required", detail: upstream }])
})

test("shutdown closes active tunnels and the listener", async () => {
  const target = await listen(net.createServer((socket) => socket.on("data", (chunk) => socket.write(chunk))))
  const local = await relay(async () => "DIRECT")
  const socket = net.connect({ host: "127.0.0.1", port: Number(new URL(local.url).port) })
  await once(socket, "connect")
  socket.write(connectRequest(target))
  await once(socket, "data")
  const closed = once(socket, "close")
  await local.stop()
  socket.resume()
  await closed
  const attempted = net.connect({ host: "127.0.0.1", port: Number(new URL(local.url).port) })
  const [error] = await once(attempted, "error")
  assert.equal(error.code, "ECONNREFUSED")
})

test("status queries resolve Chromium again for the status URL", async () => {
  const urls: string[] = []
  let route = "PROXY 127.0.0.1:3067"
  const local = await relay(async (url) => {
    urls.push(url)
    return route
  })
  assert.equal((await local.status()).https, "127.0.0.1:3067")
  route = "PROXY 127.0.0.1:3068; DIRECT"
  assert.equal((await local.status()).https, "127.0.0.1:3068")
  route = "DIRECT"
  assert.equal((await local.status()).state, "direct")
  assert.deepEqual(urls, Array(3).fill("https://api.openai.com/v1/models"))
})

test("a malformed upstream CONNECT response falls back in order", async () => {
  const target = await echo()
  const upstream = await listen(
    net.createServer((socket) =>
      socket.once("data", () => socket.end("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n")),
    ),
  )
  const local = await relay(async () => `PROXY ${upstream}; DIRECT`)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
})

test("plain HTTP refusal falls back to DIRECT before sending the body", async () => {
  const target = await listen(http.createServer((req, res) => res.end("fallback-direct")))
  const local = await relay(async () => "PROXY 127.0.0.1:0; DIRECT")
  assert.ok(
    (await exchange(local.url, `GET http://${target}/ HTTP/1.1\r\nHost: ${target}\r\n\r\n`)).includes(
      "fallback-direct",
    ),
  )
})

test("a PAC pointing at the relay fails without recursion", async () => {
  let route = "DIRECT"
  let calls = 0
  const local = await relay(async () => {
    calls++
    return route
  })
  route = `PROXY ${new URL(local.url).host}`
  assert.ok((await exchange(local.url, connectRequest("example.test:443"))).includes("502 Bad Gateway"))
  assert.equal(calls, 1)
  assert.equal((await local.status()).notices[0].code, "unreachable")
})

test("status is published only when the outcome changes, not per connection", async () => {
  const target = await echo()
  const published: string[] = []
  let route = "DIRECT"
  const local = await startProxyRelay({
    resolveProxy: async () => route,
    onStatus: (status: { state: string }) => published.push(status.state),
  })
  cleanup.push(() => local.stop())
  for (let i = 0; i < 3; i++) assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.deepEqual(published, [])
  route = "PROXY 127.0.0.1:0"
  for (let i = 0; i < 2; i++) assert.ok((await exchange(local.url, connectRequest(target))).includes("502 Bad Gateway"))
  route = "DIRECT"
  for (let i = 0; i < 2; i++) assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
  assert.deepEqual(published, ["failed", "direct"])
})

test("a CONNECT response split across packets is read whole", async () => {
  const target = await echo()
  const upstream = await listen(
    net.createServer((socket) =>
      socket.once("data", (chunk) => {
        const authority = chunk.toString().split(" ")[1]
        const [host, port] = authority.split(":")
        const forward = net.connect({ host, port: Number(port) }, () => {
          socket.write("HTTP/1.1 200 Conn")
          setTimeout(() => {
            socket.write("ection Established\r\n\r\n")
            socket.pipe(forward).pipe(socket)
          }, 50)
        })
        forward.on("error", () => socket.destroy())
      }),
    ),
  )
  const local = await relay(async () => `PROXY ${upstream}`)
  assert.ok((await exchange(local.url, connectRequest(target))).includes("tunnel-payload"))
})

test("a PAC pointing at the relay through 0.0.0.0 fails without recursion", async () => {
  let route = "DIRECT"
  let calls = 0
  const local = await relay(async () => {
    calls++
    return route
  })
  route = `PROXY 0.0.0.0:${new URL(local.url).port}`
  assert.ok((await exchange(local.url, connectRequest("example.test:443"))).includes("502 Bad Gateway"))
  assert.equal(calls, 1)
})

test("relay selection keeps the existing checkbox, off flag and explicit-env priorities", () => {
  assert.equal(shouldUseProxyRelay(true, {}), true)
  assert.equal(shouldUseProxyRelay(false, {}), false)
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    assert.equal(shouldUseProxyRelay(true, { [key]: "http://explicit.test:8080" }), false)
    assert.equal(shouldUseProxyRelay(true, { [key]: " " }), true)
  }
  for (const value of ["off", "0", " FALSE "]) {
    assert.equal(shouldUseProxyRelay(true, { LOGINOM_AI_AGENT_SYSTEM_PROXY: value }), false)
  }
})

test("only child environments get the relay and only loopback bypasses it", async () => {
  const previous = { ...process.env }
  const local = await relay(async () => "DIRECT")
  assert.ok(
    Object.keys(process.env).length === Object.keys(previous).length &&
      Object.entries(previous).every(([key, value]) => process.env[key] === value),
    "main environment unchanged",
  )
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"])
    assert.equal(local.environment[key as keyof typeof local.environment], local.url)
  assert.equal(local.environment.NODE_USE_ENV_PROXY, "1")
  assert.equal(local.environment.NO_PROXY, "127.0.0.1,localhost,::1,[::1]")
  assert.equal(local.environment.no_proxy, local.environment.NO_PROXY)
})
