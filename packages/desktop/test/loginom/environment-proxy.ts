import { spawn } from "node:child_process"
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http"
import https from "node:https"
import { connect } from "node:net"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"
import { superviseKnowledge } from "../../../loginom-host/src/supervisor"
import { knowledgeServer } from "../../../loginom-runtime/client/test/support/knowledge-server.mjs"

export async function environmentProxy(handler?: (req: IncomingMessage, res: ServerResponse) => void, targetHost = "127.0.0.1") {
  // Real Node HTTP, fetch and TLS CONNECT, without global fetch stubs.
  const directory = await mkdtemp(join(tmpdir(), "loginom-proxy-test-"))
  const cert = join(directory, "cert.pem")
  const key = join(directory, "key.pem")
  const generate = spawn(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=proxy-target.test",
      "-addext",
      `subjectAltName=DNS:proxy-target.test,IP:127.0.0.1,IP:${targetHost}`,
    ],
    { stdio: "ignore" },
  )
  if ((await once(generate, "exit"))[0]) throw Error("TEST_CERTIFICATE_FAILED")
  const proxyRequests: string[] = []
  const targetRequests: string[] = []
  const upstreamPorts = new Set<number>()
  let directTargetRequests = 0
  const observe = (req: IncomingMessage) => {
    targetRequests.push(req.url!)
    if (upstreamPorts.has(req.socket.remotePort!) || req.headers["x-loginom-test-proxy"] === "relayed")
      proxyRequests.push(req.url!)
    else directTargetRequests++
  }
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    observe(req)
    if (handler) return handler(req, res)
    res.end("encrypted" in req.socket && req.socket.encrypted ? "TLS target" : "HTTP proxy")
  }
  const target = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, handle)
  const httpTarget = createServer(handle)
  const local = createServer((_req, res) => res.end("local bypass"))
  const requests: string[] = []
  const tunnels: string[] = []
  const proxy = createServer((req, res) => {
    requests.push(req.url!)
    const url = new URL(req.url!)
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: port(httpTarget),
        path: url.pathname + url.search,
        method: req.method,
        headers: { ...req.headers, "x-loginom-test-proxy": "relayed" },
      },
      (response) => {
        res.writeHead(response.statusCode!, response.headers)
        response.pipe(res)
      },
    )
    upstream.on("error", () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  const tlsProxy = createServer()
  const sockets = new Set<import("node:net").Socket>()
  for (const server of [target, httpTarget, local, proxy, tlsProxy]) {
    server.on("connection", (socket) => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    server.listen(0, server === target ? targetHost : "127.0.0.1")
    await once(server, "listening")
  }
  const port = (server: typeof local) => {
    const address = server.address()
    if (!address || typeof address === "string") throw Error("TEST_LISTEN_FAILED")
    return address.port
  }
  for (const server of [proxy, tlsProxy])
    server.on("connect", (req, socket, head) => {
      tunnels.push(req.url!)
      const authority = new URL(`http://${req.url}`)
      const destination =
        (authority.hostname === "127.0.0.1" || authority.hostname === targetHost)
          ? Number(authority.port)
          : port(authority.port === "443" ? target : httpTarget)
      const upstream = connect(destination, authority.hostname === targetHost ? targetHost : "127.0.0.1", () => {
        upstreamPorts.add(upstream.localPort!)
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      })
      socket.on("error", () => upstream.destroy())
      upstream.on("error", () => socket.destroy())
      socket.on("close", () => upstream.destroy())
    })
  return {
    directory,
    cert,
    proxy,
    tlsProxy,
    local,
    target,
    httpTarget,
    port,
    requests,
    tunnels,
    observe,
    proxyRequests,
    targetRequests,
    get directTargetRequests() {
      return directTargetRequests
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      for (const server of [target, httpTarget, local, proxy, tlsProxy]) {
        server.closeAllConnections()
        server.close()
      }
      await rm(directory, { recursive: true, force: true })
    },
  }
}

if (import.meta.main) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the bundled Node binary")
  const fixture = await environmentProxy()
  const { cert, proxy, tlsProxy, local, port, requests, tunnels } = fixture
  try {
    const env = {
      ...process.env,
      NODE_EXTRA_CA_CERTS: cert,
      HTTP_PROXY: `http://127.0.0.1:${port(proxy)}`,
      http_proxy: `http://127.0.0.1:${port(proxy)}`,
      HTTPS_PROXY: `http://127.0.0.1:${port(tlsProxy)}`,
      https_proxy: `http://127.0.0.1:${port(tlsProxy)}`,
      ALL_PROXY: "",
      all_proxy: "",
      NO_PROXY: "localhost,127.0.0.1,::1",
      no_proxy: "localhost,127.0.0.1,::1",
      NODE_USE_ENV_PROXY: "1",
    }
    const run = async (code: string, environment = env) => {
      const child = spawn(node, ["--input-type=module", "-e", code], {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20000,
      })
      const output: Buffer[] = []
      const errors: Buffer[] = []
      child.stdout.on("data", (chunk) => output.push(chunk))
      child.stderr.on("data", (chunk) => errors.push(chunk))
      const [status] = await once(child, "exit")
      const stdout = Buffer.concat(output).toString()
      const stderr = Buffer.concat(errors).toString()
      if (status !== 0)
        throw Error(
          `NODE_PROXY_CHECK_FAILED: status=${status}; ${stderr}; requests=${JSON.stringify(requests)}; tunnels=${JSON.stringify(tunnels)}`,
        )
      return stdout.trim()
    }
    const output = await run(`import http from 'node:http'; http.setGlobalProxyFromEnv();
const result = [];
result.push(await (await fetch('http://proxy-target.test/a')).text());
result.push(await (await fetch('https://proxy-target.test/b')).text());
result.push(await (await fetch('http://127.0.0.1:${port(local)}/c')).text());
result.push(await new Promise((resolve, reject) => http.get('http://proxy-target.test/d', res => { let text=''; res.on('data', chunk => text+=chunk); res.on('end',()=>resolve(text)); }).on('error', reject)));
console.log(JSON.stringify(result));`)
    if (output !== JSON.stringify(["HTTP proxy", "TLS target", "local bypass", "HTTP proxy"]))
      throw Error(`WRONG_ROUTE: ${output}; requests=${JSON.stringify(requests)}; tunnels=${JSON.stringify(tunnels)}`)
    if (
      requests.length + tunnels.filter((url) => url === "proxy-target.test:80").length !== 2 ||
      !tunnels.includes("proxy-target.test:443")
    )
      throw Error("PROXY_NOT_USED")
    const failed = await run(
      `import http from 'node:http'; http.setGlobalProxyFromEnv();
try { await fetch('http://127.0.0.1:${port(local)}/must-not-fallback',{signal:AbortSignal.timeout(3000)}); process.exitCode=1; }
catch { console.log('NO_DIRECT_FALLBACK'); }`,
      { ...env, HTTP_PROXY: "http://127.0.0.1:1", http_proxy: "http://127.0.0.1:1", NO_PROXY: "", no_proxy: "" },
    )
    if (failed !== "NO_DIRECT_FALLBACK") throw Error("SILENT_DIRECT_FALLBACK")
    const cleanup: (() => void | Promise<void>)[] = []
    const help = await knowledgeServer(
      { after: (callback) => cleanup.push(callback) },
      {
        request: async (_body, request) => {
          fixture.observe(request)
          return false
        },
      },
    )
    const runtime = await superviseKnowledge({
      node,
      entry: join(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
      stateDir: join(fixture.directory, "help"),
      generation: 1,
      endpoint: help.endpoint,
      apiKey: "UNIT-NONSECRET",
      environment: { HTTP_PROXY: env.HTTP_PROXY },
      deadline: Date.now() + 5000,
    })
    try {
      const catalog = await runtime.request("list", undefined, 5000)
      if (
        !catalog ||
        typeof catalog !== "object" ||
        !("tools" in catalog) ||
        !Array.isArray(catalog.tools) ||
        catalog.tools.length !== 7
      )
        throw Error("HELP_CATALOG_MISSING")
      if (!fixture.proxyRequests.includes("/mcp")) throw Error("HELP_PROXY_NOT_USED")
      if (fixture.directTargetRequests !== 0)
        throw Error(
          `DIRECT_TARGET_REQUEST ${fixture.directTargetRequests} targets=${JSON.stringify(fixture.targetRequests)} proxied=${JSON.stringify(fixture.proxyRequests)}`,
        )
    } finally {
      await runtime.close()
      for (const close of cleanup) await close()
    }
    console.log(
      JSON.stringify({
        status: "PASS",
        http: true,
        httpsConnect: true,
        helpInitializeList: true,
        directTargetRequests: fixture.directTargetRequests,
        nodeHttp: true,
        loopbackBypass: true,
        noDirectFallback: true,
      }),
    )
  } finally {
    await fixture.close()
  }
}
