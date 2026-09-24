import { connect } from "node:net"

export type ProbeStatus = "http" | "other" | "closed" | "timeout"

export function probeProxyPort(host: string, port: number, timeoutMs = 1000): Promise<ProbeStatus> {
  return probeSocket(host, port, timeoutMs, true)
}

export async function probeProxyUrl(url: string, timeoutMs = 1000): Promise<ProbeStatus> {
  if (!URL.canParse(url)) return "other"
  const parsed = new URL(url)
  const secure = parsed.protocol === "https:"
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  const port = Number(parsed.port) || (secure ? 443 : 80)
  // TLS-прокси ждёт рукопожатие и молчит на открытый CONNECT, поэтому для него проверяем только TCP.
  return probeSocket(host, port, timeoutMs, !secure)
}

function probeSocket(host: string, port: number, timeoutMs: number, handshake: boolean): Promise<ProbeStatus> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (status: ProbeStatus) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(status)
    }
    const socket = connect({ host, port })
    const timer = setTimeout(() => finish("timeout"), timeoutMs)
    socket.once("error", (error: NodeJS.ErrnoException) => finish(error.code === "ECONNREFUSED" ? "closed" : "other"))
    socket.once("end", () => finish("other"))
    socket.once("close", () => finish("other"))
    socket.once("connect", () => {
      if (!handshake) return finish("other")
      socket.write("CONNECT proxy-probe.invalid:443 HTTP/1.1\r\nHost: proxy-probe.invalid:443\r\n\r\n")
    })
    socket.once("data", (chunk) => {
      const code = Number(/^HTTP\/\d(?:\.\d)? (\d+)/.exec(chunk.toString("utf8"))?.[1])
      finish([200, 403, 407, 502, 503, 504].includes(code) ? "http" : "other")
    })
  })
}
