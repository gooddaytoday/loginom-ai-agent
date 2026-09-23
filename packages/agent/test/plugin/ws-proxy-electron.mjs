import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { connect } from "node:net"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { once } from "node:events"
import { WebSocketServer } from "ws"

const electron = resolve(
  import.meta.dirname,
  "../../../desktop/node_modules/electron/dist/electron",
)
const directory = await mkdtemp(join(tmpdir(), "loginom-ws-proxy-"))
const tunnels = []
const proxy = createServer()
proxy.on("connect", (request, socket, head) => {
  tunnels.push(request.url)
  const upstream = connect(targetPort, "127.0.0.1", () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  socket.on("error", () => upstream.destroy())
  upstream.on("error", () => socket.destroy())
})
const target = new WebSocketServer({ host: "127.0.0.1", port: 0 })
await once(target, "listening")
const targetPort = target.address().port
target.on("connection", (socket) => {
  socket.send("ready")
  socket.close()
})
proxy.listen(0, "127.0.0.1")
await once(proxy, "listening")
const proxyPort = proxy.address().port
const script = join(directory, "client.mjs")
const agentPackage = resolve(import.meta.dirname, "../../package.json")
await writeFile(
  script,
  `import { createRequire } from "node:module"
const require = createRequire(${JSON.stringify(agentPackage)})
const WebSocket = require("ws")
const { HttpsProxyAgent } = require("https-proxy-agent")
const socket = new WebSocket("ws://api.openai.test:${targetPort}/responses", { agent: new HttpsProxyAgent("http://127.0.0.1:${proxyPort}") })
socket.on("message", () => { socket.close(); process.exit(0) })
socket.on("error", (error) => { console.error(error); process.exit(1) })
`,
)
const child = spawn(electron, ["--experimental-strip-types", script], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
})
let stderr = ""
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString()
})
const code = await new Promise((resolvePromise) => child.once("exit", resolvePromise))
proxy.close()
target.close()
await rm(directory, { recursive: true, force: true })
if (code !== 0 || !tunnels.includes(`api.openai.test:${targetPort}`)) {
  console.error(stderr)
  throw new Error(`WS_PROXY_FAILED code=${code} tunnels=${tunnels.join(",")}`)
}
console.log(JSON.stringify({ status: "PASS", tunnel: tunnels[0] }))
