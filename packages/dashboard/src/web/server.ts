import { realpathSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { homedir } from "node:os"
import { join } from "node:path"
import { Option, Schema } from "effect"
import { bindingKey, LookupRequest, Snapshot, SnapshotRequest } from "../contract/snapshot.ts"
import { appHost, type Mode } from "./apps.ts"

export { appHeaders, appHost } from "./apps.ts"
export { bindingKey } from "../contract/snapshot.ts"

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(JSON.stringify(data))
}

async function body(request: IncomingMessage, max: number): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw Error("Expected application/json")
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > max) throw Error("Request body exceeds limit")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

type Options = {
  buildsRoot: string
  appOrigin: string
  mode: Mode
  clientOrigins: string[]
  cliButton?: boolean
  maxSnapshots?: number
  ttlMs?: number
  allowedHosts?: string[]
}

export function dashboardServer({
  buildsRoot,
  appOrigin,
  mode,
  clientOrigins,
  cliButton = false,
  maxSnapshots = 100,
  ttlMs = 15 * 60 * 1000,
  allowedHosts,
}: Options) {
  const snapshots = new Map<string, { snapshot: typeof Snapshot.Type; expires: number }>()
  return createServer(async (request, response) => {
    try {
      const hosts =
        allowedHosts ?? ["localhost", "127.0.0.1", "[::1]"].map((host) => `${host}:${request.socket.localPort}`)
      if (!hosts.some((host) => host.toLowerCase() === request.headers.host?.toLowerCase())) {
        return json(response, 403, { error: "Forbidden host" })
      }
      const path = request.url!.split("?")[0]
      if (request.method === "POST" && path === "/dashboard/lookup") {
        const binding = Schema.decodeUnknownOption(LookupRequest, { onExcessProperty: "error" })(await body(request, 65_536))
        if (Option.isNone(binding)) return json(response, 400, { error: "Invalid Loginom binding" })
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
        if (origin !== undefined && !clientOrigins.includes(origin)) return json(response, 403, { error: "Forbidden origin" })
        const input = Schema.decodeUnknownOption(SnapshotRequest, { onExcessProperty: "error" })(await body(request, 655_360))
        if (Option.isNone(input) || Buffer.byteLength(JSON.stringify(input.value.sample)) > 524_288)
          return json(response, 400, { error: "Invalid snapshot" })
        const now = Date.now()
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
    } catch (error) {
      const code = error instanceof Error && "code" in error && error.code
      json(response, code ? 500 : 400, {
        error: code ? "Could not serve dashboard" : error instanceof Error ? error.message : String(error),
      })
    }
  })
}

// Loopback by default. The stand sets DASHBOARD_HOST=0.0.0.0 because Apache runs in another container.
export function startDashboard(env: NodeJS.ProcessEnv = process.env) {
  const requested = env.DASHBOARD_MODE ?? "normal"
  if (requested !== "normal" && requested !== "strict") throw Error("DASHBOARD_MODE must be normal or strict")
  const mode = requested === "strict" ? "strict" : "normal"
  const appOrigin = requireOrigin(env.DASHBOARD_APP_ORIGIN ?? "http://dashboards.localhost:32769")
  const clientOrigins = (env.DASHBOARD_CLIENT_ORIGINS ?? "http://127.0.0.1:32768,http://localhost:32768")
    .split(",")
    .map((origin) => requireOrigin(origin.trim()))
  const buildsRoot = env.DASHBOARD_BUILDS ?? join(homedir(), "loginom-dashboard", "builds")
  const host = env.DASHBOARD_HOST ?? "127.0.0.1"
  const api = dashboardServer({
    buildsRoot,
    appOrigin,
    mode,
    clientOrigins,
    cliButton: env.DASHBOARD_CLI_BUTTON === "1",
    allowedHosts:
      env.DASHBOARD_CLIENT_ORIGINS === undefined ? undefined : clientOrigins.map((origin) => new URL(origin).host),
  })
  const apps = appHost({
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
    appOrigin, clientOrigins, mode,
  })
  api.listen(Number(env.DASHBOARD_PORT ?? 8100), host)
  apps.listen(Number(env.DASHBOARD_APP_PORT ?? 8101), host)
  return { api, apps }
}

function requireOrigin(value: string) {
  const url = URL.parse(value)
  // URL.origin lowercases the host, so a configured origin may differ only by case.
  if (!url || url.origin.toLowerCase() !== value.toLowerCase() || (url.protocol !== "http:" && url.protocol !== "https:"))
    throw Error("Dashboard origin must be an http(s) origin")
  return url.origin
}
