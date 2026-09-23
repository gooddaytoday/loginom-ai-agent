import { HttpsProxyAgent } from "https-proxy-agent"
import { ProxyEnv } from "./proxy-env"

export function websocketTransport(url: string, runtime: "bun" | "node" = typeof Bun === "undefined" ? "node" : "bun") {
  const proxy = ProxyEnv.getProxyForUrl(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"))
  if (!proxy) return {}
  // Пакет ws под Node задаёт свой createConnection и не читает HTTP(S)_PROXY.
  if (runtime === "bun") return { proxy }
  return { agent: new HttpsProxyAgent(proxy) }
}
