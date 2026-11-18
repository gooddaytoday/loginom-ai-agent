import { realpathSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { lookup } from "node:dns/promises"
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { isIP, SocketAddress } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { Option, Schema } from "effect"
import { bindingKey, LookupRequest, Snapshot, SnapshotRequest } from "../contract/snapshot.ts"
import { createEventLog, type EventWriter } from "../log.ts"
import { appHost, type Mode } from "./apps.ts"
import { tlsForwarder } from "./tls.ts"

export { appHeaders, appHost } from "./apps.ts"
export { bindingKey } from "../contract/snapshot.ts"

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(JSON.stringify(data))
}

function normalizeIp(address: string) {
  const family = isIP(address)
  if (family === 4) return address
  if (family === 6) return new SocketAddress({ address, family: "ipv6" }).address.replace(/^::ffff:(?=\d+\.)/, "")
}

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

async function body(request: IncomingMessage, max: number) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") return Option.none()
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > max) return Option.none()
    chunks.push(chunk)
  }
  return decodeJson(Buffer.concat(chunks).toString())
}

type Options = {
  shell: Uint8Array
  buildsRoot: string
  appOrigin: string
  mode: Mode
  clientOrigins: string[]
  cliButton?: boolean
  maxSnapshots?: number
  ttlMs?: number
  allowedHosts?: string[]
  studioProxy?: string
  events?: EventWriter
}

export function dashboardServer({
  shell,
  buildsRoot,
  appOrigin,
  mode,
  clientOrigins,
  cliButton = false,
  maxSnapshots = 100,
  ttlMs = 15 * 60 * 1000,
  allowedHosts,
  studioProxy,
  events,
}: Options) {
  const snapshots = new Map<string, { snapshot: typeof Snapshot.Type; expires: number }>()
  const snapshotRates = new Map<string, number>()
  let snapshotWindowEnds = 0
  return createServer(async (request, response) => {
    const reject = (status: number, message: string, code: string) => {
      events?.("request_rejected", { code })
      return json(response, status, { error: message })
    }
    try {
      const hosts =
        allowedHosts ?? ["localhost", "127.0.0.1", "[::1]"].map((host) => `${host}:${request.socket.localPort}`)
      if (!hosts.some((host) => host.toLowerCase() === request.headers.host?.toLowerCase()))
        return reject(403, "Forbidden host", "host")
      const path = request.url!.split("?")[0]
      if (request.method === "GET" && path === "/dashboard/health") return json(response, 200, { ok: true })
      if (request.method === "GET" && path === "/dashboard/shell.js") {
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
        return response.end(shell)
      }
      if (request.method === "POST" && path === "/dashboard/lookup") {
        const input = await body(request, 65_536)
        if (Option.isNone(input)) return reject(400, "Invalid request body", "body")
        const binding = Schema.decodeUnknownOption(LookupRequest, { onExcessProperty: "error" })(input.value)
        if (Option.isNone(binding)) return reject(400, "Invalid Loginom binding", "schema")
        const key = await bindingKey(binding.value)
        const state: Record<string, { sourceHash?: string; key?: string; status: "pending" | "building" | "ready" | "failed"; buildHash?: string; error?: string }> = await readFile(join(buildsRoot, "state.json"), "utf8").then(JSON.parse).catch(error => {
          if (error.code === "ENOENT") return {}
          throw error
        })
        const prefix = `${binding.value.packagePath}.dashboards/${binding.value.nodeGuid}/`
        const statuses = Object.entries(state).filter(([path]) => path.startsWith(prefix) && /^\d{8}T\d{6}Z\.json$/.test(path.slice(prefix.length)))
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([path, entry]) => ({ name: path.slice(prefix.length), sourceHash: entry.sourceHash ?? null, key: entry.key, status: entry.status,
            ...(entry.status === "ready" && entry.key === key ? { buildHash: entry.buildHash } : {}),
            ...(entry.status === "failed" ? { error: entry.error } : {}),
          }))
        const current = statuses.find(entry => entry.key === key && entry.status === "ready" && entry.buildHash)
        const status = (entry: typeof statuses[number] | undefined) => entry ? { name: entry.name, sourceHash: entry.sourceHash, status: entry.status,
          ...(entry.buildHash ? { buildHash: entry.buildHash } : {}), ...(entry.error ? { error: entry.error } : {}) } : null
        const own = binding.value.publication && statuses.find(entry => entry.name === binding.value.publication && (!entry.key || entry.key === key))
        const hash = current?.buildHash ?? null
        return json(response, 200, { key, exists: hash !== null, hash, appOrigin, mode, cliButton,
          currentVersion: current ? { name: current.name, sourceHash: current.sourceHash } : null,
          latest: status(statuses[0]), publication: binding.value.publication ? status(own || undefined) ?? { name: binding.value.publication, sourceHash: null, status: "pending" } : null,
        })
      }
      if (request.method === "POST" && path === "/dashboard/snapshots") {
        const origin = request.headers.origin
        if (origin === undefined ? studioProxy !== undefined : !clientOrigins.includes(origin))
          return reject(403, "Forbidden origin", "origin")
        const content = await body(request, 655_360)
        if (Option.isNone(content)) return reject(400, "Invalid request body", "body")
        const input = Schema.decodeUnknownOption(SnapshotRequest, { onExcessProperty: "error" })(content.value)
        if (Option.isNone(input) || Buffer.byteLength(JSON.stringify(input.value.sample)) > 524_288)
          return reject(400, "Invalid snapshot", "schema")
        let address = normalizeIp(request.socket.remoteAddress ?? "") ?? ""
        if (studioProxy !== undefined) {
          const forwarded = request.headers["x-loginom-dashboard-client-ip"]
          const client = typeof forwarded === "string" && normalizeIp(forwarded)
          if (!client) return reject(403, "Forbidden proxy", "snapshot_proxy")
          // Resolve the installed Studio on the shared container network so recreation can change its IP.
          const peers = await lookup(studioProxy, { all: true }).catch(() => [])
          if (!peers.some(peer => normalizeIp(peer.address) === address))
            return reject(403, "Forbidden proxy", "snapshot_proxy")
          address = client
        }
        const now = Date.now()
        if (now >= snapshotWindowEnds) {
          snapshotRates.clear()
          snapshotWindowEnds = now + 60_000
        }
        const count = snapshotRates.get(address) ?? 0
        if (count >= 10 || (count === 0 && snapshotRates.size >= 1024))
          return reject(429, "Too many snapshot requests", "snapshot_rate")
        snapshotRates.set(address, count + 1)
        snapshots.forEach((item, id) => item.expires <= now && snapshots.delete(id))
        const id = randomUUID()
        snapshots.set(id, { snapshot: { id, created: new Date(now).toISOString(), ...input.value }, expires: now + ttlMs })
        if (snapshots.size > maxSnapshots) snapshots.delete(snapshots.keys().next().value!)
        return json(response, 201, { id })
      }
      const id = request.method === "GET" && path?.match(/^\/dashboard\/snapshots\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/)?.[1]
      if (id) {
        const item = snapshots.get(id)
        snapshots.delete(id)
        if (item && item.expires > Date.now()) return json(response, 200, item.snapshot)
      }
      json(response, 404, { error: "Not found" })
    } catch {
      events?.("request_failed", { code: "internal" })
      json(response, 500, { error: "Could not serve dashboard" })
    }
  })
}

// Loopback by default. The stand sets DASHBOARD_HOST=0.0.0.0 because Apache runs in another container.
export function startDashboard(env: NodeJS.ProcessEnv, shell: Uint8Array) {
  const requested = env.DASHBOARD_MODE ?? "normal"
  if (requested !== "normal" && requested !== "strict") throw Error("DASHBOARD_MODE must be normal or strict")
  const mode = requested === "strict" ? "strict" : "normal"
  const appOrigin = requireOrigin(env.DASHBOARD_APP_ORIGIN ?? "http://dashboards.localhost:32769")
  const clientOrigins = (env.DASHBOARD_CLIENT_ORIGINS ?? "http://127.0.0.1:32768,http://localhost:32768")
    .split(",")
    .map((origin) => requireOrigin(origin.trim()))
  const upstream = appOrigin.startsWith("https:") ? URL.parse(`tcp://${env.DASHBOARD_TLS_UPSTREAM ?? ""}`) : null
  if (appOrigin.startsWith("https:") && (!upstream || !upstream.hostname || !upstream.port || upstream.username || upstream.password || upstream.pathname || upstream.search || upstream.hash || !Number(upstream.port)))
    throw Error("DASHBOARD_TLS_UPSTREAM must be an Apache host:port")
  const tls = upstream ? tlsForwarder({ host: upstream.hostname, port: Number(upstream.port) }) : undefined
  const buildsRoot = env.DASHBOARD_BUILDS ?? join(homedir(), "loginom-dashboard", "builds")
  const host = env.DASHBOARD_HOST ?? "127.0.0.1"
  const events = createEventLog("web")
  const api = dashboardServer({
    shell,
    buildsRoot,
    appOrigin,
    mode,
    clientOrigins,
    studioProxy: env.DASHBOARD_STUDIO_PROXY,
    events,
    cliButton: env.DASHBOARD_CLI_BUTTON === "1",
    allowedHosts:
      env.DASHBOARD_CLIENT_ORIGINS === undefined ? undefined : clientOrigins.map((origin) => new URL(origin).host),
  })
  const apps = appHost({
    verifyHash: true,
    builds: key => {
      try {
        const root = realpathSync(buildsRoot)
        const dir = join(root, key)
        return realpathSync(dir) === dir ? dir : undefined
      } catch (error) {
        if (error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR"].includes(String(error.code))) return
        throw error
      }
    },
    appOrigin, clientOrigins, mode, events,
  })
  api.listen(Number(env.DASHBOARD_PORT ?? 8100), host)
  apps.listen(Number(env.DASHBOARD_APP_PORT ?? (tls ? 8102 : 8101)), host)
  tls?.listen(8101, host)
  return { api, apps, tls }
}

function requireOrigin(value: string) {
  const url = URL.parse(value)
  // URL.origin lowercases the host, so a configured origin may differ only by case.
  if (!url || url.origin.toLowerCase() !== value.toLowerCase() || (url.protocol !== "http:" && url.protocol !== "https:"))
    throw Error("Dashboard origin must be an http(s) origin")
  return url.origin
}
