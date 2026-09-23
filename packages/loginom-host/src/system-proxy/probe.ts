import { connect } from "node:net"

import { proxyHostPort } from "./address"

export type ProbeStatus = "http" | "other" | "closed" | "timeout"

export function probeProxyPort(host: string, port: number, timeoutMs = 1000): Promise<ProbeStatus> {
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
    socket.once("connect", () => {
      socket.write("CONNECT proxy-probe.invalid:443 HTTP/1.1\r\nHost: proxy-probe.invalid:443\r\n\r\n")
    })
    socket.once("data", (chunk) => finish(chunk.toString("utf8").startsWith("HTTP/") ? "http" : "other"))
  })
}

export async function probeProxyUrl(url: string, timeoutMs = 1000): Promise<ProbeStatus> {
  const shown = proxyHostPort(url)
  if (!shown) return "other"
  const parsed = split(shown)
  if (!parsed) return "other"
  return probeProxyPort(parsed.host, parsed.port, timeoutMs)
}

function split(value: string) {
  if (value.startsWith("[")) {
    const end = value.indexOf("]")
    if (end < 0) return undefined
    const host = value.slice(1, end)
    const port = Number(value.slice(end + 2))
    if (!Number.isInteger(port)) return undefined
    return { host, port }
  }
  const index = value.lastIndexOf(":")
  if (index < 0) return { host: value, port: 80 }
  const port = Number(value.slice(index + 1))
  if (!Number.isInteger(port)) return undefined
  return { host: value.slice(0, index), port }
}
