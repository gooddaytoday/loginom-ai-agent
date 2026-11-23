import { createServer } from "node:http"
import { once } from "node:events"

const nodeHttp = await import("node:http")

const seen = []
const proxy = createServer((request, response) => {
  seen.push(request.url ?? "")
  response.end("proxy")
})
proxy.on("connect", (request, socket) => {
  seen.push(request.url ?? "")
  socket.end("HTTP/1.1 502 Tunnel\r\n\r\n")
})
proxy.listen(0, "127.0.0.1")
await once(proxy, "listening")
const address = proxy.address()
if (!address || typeof address === "string") throw new Error("PORT")
process.env.HTTP_PROXY = `http://127.0.0.1:${address.port}`
process.env.http_proxy = process.env.HTTP_PROXY
process.env.HTTPS_PROXY = process.env.HTTP_PROXY
process.env.https_proxy = process.env.HTTP_PROXY
process.env.NO_PROXY = "loginom-proxy-contract.test,.loginom-proxy-contract.test"
process.env.no_proxy = process.env.NO_PROXY
process.env.NODE_USE_ENV_PROXY = "1"
if (typeof nodeHttp.setGlobalProxyFromEnv === "function") nodeHttp.setGlobalProxyFromEnv()
const signal = () => AbortSignal.timeout(2000)
const direct = await fetch("http://loginom-proxy-contract.test/direct", { signal: signal() }).then(
  () => "reached",
  () => "bypassed",
)
const child = await fetch("http://api.loginom-proxy-contract.test/child", { signal: signal() }).then(
  () => "reached",
  () => "bypassed",
)
const proxied = await fetch("http://notexample.test/model", { signal: signal() }).then(
  async (response) => response.text(),
  (error) => `error:${error instanceof Error ? error.name : "unknown"}`,
)
proxy.close()
if (direct !== "bypassed" || child !== "bypassed" || !seen.some((url) => url.includes("notexample.test"))) {
  throw new Error(`NO_PROXY_CONTRACT direct=${direct} child=${child} body=${proxied} seen=${seen.join(",")}`)
}
console.log(JSON.stringify({ status: "PASS", runtime: process.versions.bun ? "bun" : "node", node: process.versions.node }))
