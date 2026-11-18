import { readFile, realpath } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server } from "node:http"
import { join } from "node:path"
import { Option, Schema } from "effect"
import { assetContentType } from "../contract/asset.ts"
import { createEventLog, type EventWriter } from "../log.ts"

export type Mode = "normal" | "strict"

export function appHeaders(appOrigin: string, clientOrigins: string[], connectionAllowlist = true) {
  return {
    "content-security-policy":
      `default-src 'none'; script-src ${appOrigin}; style-src ${appOrigin}; img-src ${appOrigin} data: blob:; ` +
      `font-src ${appOrigin}; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; ` +
      `manifest-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'; ` +
      `frame-ancestors ${clientOrigins.join(" ")}; sandbox allow-scripts; report-uri ${appOrigin}/_reports`,
    ...(connectionAllowlist && { "connection-allowlist": "(response-origin); report-to=dashboard" }),
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=(), " +
      "fullscreen=(), payment=(), publickey-credentials-get=(), identity-credentials-get=(), usb=(), serial=(), hid=(), bluetooth=()",
    "x-dns-prefetch-control": "off",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "reporting-endpoints": `dashboard="${appOrigin}/_reports"`,
  }
}

const cspDirective = Schema.Literals([
  "default-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-elem", "style-src-attr",
  "img-src", "font-src", "connect-src", "frame-src", "worker-src", "object-src", "manifest-src", "media-src",
  "base-uri", "form-action", "frame-ancestors", "sandbox",
])
const disposition = Schema.Literals(["enforce", "report"])
const decodeNativeReport = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({
  "csp-report": Schema.Struct({ "document-uri": Schema.String, "effective-directive": cspDirective, disposition }),
})))
const decodeReportingBatch = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Union([
  Schema.Struct({
    type: Schema.Literal("csp-violation"),
    body: Schema.Struct({ documentURL: Schema.String, effectiveDirective: cspDirective, disposition }),
  }),
  Schema.Struct({
    type: Schema.Literal("connection-allowlist"),
    body: Schema.Struct({ url: Schema.String, disposition }),
  }),
]))))

const probeScript = `function blocked() {
  if (typeof RTCPeerConnection !== "function") return false
  let rtc
  try { rtc = new RTCPeerConnection() }
  catch (error) { return error instanceof DOMException && error.name === "NotAllowedError" }
  try {
    // Chromium 154 permits construction but administratively discards ICE candidates.
    // Without remote SDP this reserved-address candidate cannot initiate a connection.
    const candidate = rtc.addIceCandidate({ candidate: "candidate:1 1 UDP 1 192.0.2.1 9 typ host", sdpMid: "0" })
    candidate?.catch(() => {})
    return candidate === undefined
  } catch { return false }
  finally { rtc.close() }
}
let answered = false
addEventListener("message", event => {
  const data = event.data
  if (answered || event.source !== parent || event.ports.length !== 1 || typeof data !== "object" || data === null ||
      Array.isArray(data) || Object.keys(data).length !== 2 || data.type !== "loginom-dashboard/init" || data.version !== 1) return
  answered = true
  event.ports[0].postMessage({ type: "probe", ok: blocked() })
})
parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*")
`

export function appHost(options: {
  server?: Server
  builds: (key: string) => string | undefined
  appOrigin: string
  clientOrigins: string[]
  mode: Mode
  connectionAllowlist?: boolean
  log?: (line: string) => void
  events?: EventWriter
}) {
  const headers = {
    ...appHeaders(options.appOrigin, options.clientOrigins, options.connectionAllowlist),
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
  }
  const appUrl = new URL(options.appOrigin)
  const events = options.events ?? createEventLog("web", options.log)
  const server = options.server ?? createServer({ requireHostHeader: false })
  server.on("request", async (request, response) => {
    const send = (status: number, body: string | Buffer, extra: Record<string, string> = {}) => {
      response.writeHead(status, {
        ...headers,
        ...extra,
      })
      response.end(body)
    }
    try {
      if (request.headers.host?.toLowerCase() !== appUrl.host) {
        events("request_rejected", { code: "host" })
        return send(403, "Forbidden host")
      }
      const path = request.url!.split("?")[0] ?? ""
      if (options.mode === "strict" && request.method === "GET" && path === "/_probe/")
        return send(200, '<!doctype html><meta charset="utf-8"><script src="probe.js"></script>', { "content-type": "text/html; charset=utf-8" })
      if (options.mode === "strict" && request.method === "GET" && path === "/_probe/probe.js")
        return send(200, probeScript, { "content-type": "text/javascript; charset=utf-8" })
      if (path === "/_reports" && request.method === "OPTIONS")
        return send(204, "", {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST",
          "access-control-allow-headers": "content-type",
        })
      if (path === "/_reports" && request.method === "POST") {
        const report = await limited(request, 64 * 1024)
        if (report === undefined) {
          events("report_rejected", { code: "body" })
          return send(413, "Report exceeds 64 KiB")
        }
        const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase()
        const reports = parseReports(report, mediaType)
        if (!reports?.length) {
          events("report_rejected", { code: "schema" })
          return send(400, "Invalid report", { "access-control-allow-origin": "*" })
        }
        const violations = reports.map(entry => {
          const csp = entry.type === "csp-violation"
          const binding = reportBinding(csp ? entry.body.documentURL : entry.body.url, appUrl.origin)
          if (!binding) return
          return {
            event: csp ? "csp_violation" : "connection_violation",
            fields: { ...binding, directive: csp ? entry.body.effectiveDirective : undefined, disposition: entry.body.disposition },
          } as const
        })
        if (!violations.every(entry => entry !== undefined)) {
          events("report_rejected", { code: "document" })
          return send(400, "Invalid report", { "access-control-allow-origin": "*" })
        }
        for (const violation of violations) events(violation.event, violation.fields)
        return send(204, "", { "access-control-allow-origin": "*" })
      }
      const app =
        request.method === "GET" &&
        path.match(/^\/apps\/([a-f0-9]{64})\/([a-f0-9]{64})\/(?:assets\/([^/]+))?$/)
      if (!app) return send(404, "Not found")
      let asset: string | undefined
      try {
        if (app[3]) asset = decodeURIComponent(app[3])
      } catch {
        return send(404, "Not found")
      }
      const type = asset ? assetContentType(asset) : "text/html; charset=utf-8"
      const dir = options.builds(app[1]!)
      const data = type && dir && (await buildFile(dir, app[2]!, asset ? join("assets", asset) : "index.html"))
      if (!data) return send(404, "Not found")
      if (!asset) return send(200, data, { "content-type": type })
      return send(200, data, {
        "content-type": type,
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
      })
    } catch {
      events("request_failed", { code: "internal" })
      send(500, "Could not serve dashboard")
    }
  })
  server.on("checkExpectation", (_request, response) => {
    response.writeHead(417, headers)
    response.end("Expectation failed")
  })
  // Malformed HTTP must not produce Node's default document without isolation headers.
  server.on("clientError", (_error, socket) => socket.destroy())
  return server
}

function parseReports(content: string, mediaType: string | undefined) {
  if (mediaType === "application/csp-report") {
    const decoded = decodeNativeReport(content)
    if (Option.isNone(decoded)) return
    const body = decoded.value["csp-report"]
    return [{ type: "csp-violation" as const, body: {
      documentURL: body["document-uri"], effectiveDirective: body["effective-directive"], disposition: body.disposition,
    } }]
  }
  if (mediaType !== "application/reports+json") return
  const decoded = decodeReportingBatch(content)
  if (Option.isSome(decoded)) return decoded.value
}

function reportBinding(documentUrl: string, origin: string) {
  if (!documentUrl.startsWith(origin) || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(documentUrl)) return
  const path = documentUrl.slice(origin.length).split(/[?#]/, 1)[0]
  const build = path?.match(/^\/apps\/([a-f0-9]{64})\/([a-f0-9]{64})\/$/)
  if (!build) return
  return { key: build[1], buildHash: build[2] }
}

async function buildFile(root: string, hash: string, name: string) {
  try {
    const builds = await realpath(root)
    const dir = await realpath(join(builds, hash))
    const file = await realpath(join(dir, name))
    if (dir !== join(builds, hash) || file !== join(dir, name)) return
    return await readFile(file)
  } catch (error) {
    if (error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(error.code))) return
    throw error
  }
}

async function limited(request: IncomingMessage, max: number) {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > max) return
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString()
}
