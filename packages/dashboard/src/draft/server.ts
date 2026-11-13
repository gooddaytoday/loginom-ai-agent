import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { Snapshot } from "../contract/snapshot.ts"
import { appHost } from "../web/apps.ts"

export type DraftEntry = {
  key: string
  builds: string
  hash: string
  data: Pick<typeof Snapshot.Type, "nodeName" | "created" | "sample"> & { parameters: { name: string; value: number | null }[] }
}

const page = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Черновик dashboard</title><link rel="icon" href="data:,"><body style="margin:0;font:14px system-ui"><script src="/draft.js"></script></body></html>'

export async function draftServer(pageScript: string) {
  const script = await readFile(pageScript)
  const entries = new Map<string, DraftEntry>()
  const pages = createServer({ requireHostHeader: false })
  const apps = createServer({ requireHostHeader: false })
  for (const server of [pages, apps]) server.on("connection", socket => socket.unref())
  const close = () => Promise.all([pages, apps].map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
    server.closeAllConnections()
  }))).then(() => undefined)
  pages.listen(0, "127.0.0.1")
  await once(pages, "listening")
  apps.listen(0, "127.0.0.1")
  await once(apps, "listening").catch(async error => {
    await close()
    throw error
  })
  const pagePort = (pages.address() as AddressInfo).port
  const pageOrigins = [`http://localhost:${pagePort}`, `http://127.0.0.1:${pagePort}`]
  const appOrigin = `http://dashboards.localhost:${(apps.address() as AddressInfo).port}`
  const headers = {
    "content-security-policy": `frame-src ${appOrigin}; object-src 'none'; frame-ancestors 'none'`,
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "cache-control": "no-store",
  }
  pages.on("request", (request, response) => {
    const send = (status: number, type: string, body: string | Buffer) => {
      response.writeHead(status, { ...headers, "content-type": type })
      response.end(body)
    }
    if (!pageOrigins.some(origin => new URL(origin).host === request.headers.host?.toLowerCase()))
      return send(403, "text/plain; charset=utf-8", "Forbidden host")
    const match = request.method === "GET" && request.url?.match(/^\/(?:(draft\.js)|([a-f0-9]{64})\/(data|hash)?)$/)
    const entry = match && match[2] ? entries.get(match[2]) : undefined
    if (match && match[1]) return send(200, "text/javascript; charset=utf-8", script)
    if (!entry) return send(404, "text/plain; charset=utf-8", "Not found")
    if (match && match[3] === "hash") return send(200, "application/json", JSON.stringify({ hash: entry.hash }))
    if (match && match[3] === "data")
      return send(200, "application/json", JSON.stringify({ ...entry.data, hash: entry.hash, appUrl: `${appOrigin}/apps/${entry.key}/${entry.hash}/` }))
    return send(200, "text/html; charset=utf-8", page)
  })
  pages.on("checkExpectation", (_request, response) => {
    response.writeHead(417, headers)
    response.end("Expectation failed")
  })
  pages.on("clientError", (_error, socket) => socket.destroy())
  // Backend stdout belongs to the CLI output, rather than stand diagnostics.
  appHost({ server: apps, builds: key => entries.get(key)?.builds, appOrigin, clientOrigins: pageOrigins, mode: "normal", log: () => undefined })
  pages.unref()
  apps.unref()
  return {
    publish(entry: DraftEntry) {
      entries.set(entry.key, entry)
      return `${pageOrigins[0]}/${entry.key}/`
    },
    pageOrigin: pageOrigins[0]!,
    appOrigin,
    close,
  }
}
