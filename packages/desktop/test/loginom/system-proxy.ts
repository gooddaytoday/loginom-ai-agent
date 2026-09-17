import { spawn } from "node:child_process"
import { createServer } from "node:http"
import https from "node:https"
import { connect } from "node:net"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"
import { systemProxyEnvironment } from "../../src/main/system-proxy.ts"

// Real Node HTTP, fetch and TLS CONNECT, without global fetch stubs.
const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the bundled Node binary")
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
    "subjectAltName=DNS:proxy-target.test",
  ],
  { stdio: "ignore" },
)
if ((await once(generate, "exit"))[0]) throw Error("TEST_CERTIFICATE_FAILED")
const target = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, (_req, res) =>
  res.end("TLS target"),
)
const httpTarget = createServer((_req, res) => res.end("HTTP proxy"))
const local = createServer((_req, res) => res.end("local bypass"))
const requests: string[] = []
const tunnels: string[] = []
const proxy = createServer((req, res) => {
  requests.push(req.url!)
  res.end("HTTP proxy")
})
const tlsProxy = createServer()
for (const server of [target, httpTarget, local, proxy, tlsProxy]) {
  server.listen(0, "127.0.0.1")
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
    const upstream = connect(port(req.url?.endsWith(":443") ? target : httpTarget), "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    socket.on("error", () => upstream.destroy())
    upstream.on("error", () => socket.destroy())
    socket.on("close", () => upstream.destroy())
  })
try {
  const settings = `org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy use-same-proxy false
org.gnome.system.proxy ignore-hosts ['localhost,127.0.0.0/8,::1']
org.gnome.system.proxy.http host '127.0.0.1'
org.gnome.system.proxy.http port ${port(proxy)}
org.gnome.system.proxy.https host '127.0.0.1'
org.gnome.system.proxy.https port ${port(tlsProxy)}`
  const env = systemProxyEnvironment(settings, { ...process.env, NODE_EXTRA_CA_CERTS: cert })!
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
  console.log(
    JSON.stringify({
      status: "PASS",
      http: true,
      httpsConnect: true,
      nodeHttp: true,
      loopbackBypass: true,
      noDirectFallback: true,
    }),
  )
} finally {
  for (const server of [target, httpTarget, local, proxy, tlsProxy]) {
    server.closeAllConnections()
    server.close()
  }
  await rm(directory, { recursive: true, force: true })
}
