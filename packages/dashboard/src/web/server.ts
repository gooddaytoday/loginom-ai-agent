import { realpathSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Option, Schema } from "effect"
import { bindingKey, Binding, Snapshot, SnapshotRequest } from "../contract/snapshot.ts"
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
        const binding = Schema.decodeUnknownOption(Binding, { onExcessProperty: "error" })(await body(request, 65_536))
        if (Option.isNone(binding)) return json(response, 400, { error: "Invalid Loginom binding" })
        const key = await bindingKey(binding.value)
        const hash = await currentBuild(buildsRoot, key)
        return json(response, 200, { key, exists: hash !== null, hash, appOrigin, mode, cliButton })
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

async function currentBuild(root: string, key: string) {
  try {
    const hash = (await readFile(join(root, key, "current"), "utf8")).trim()
    return /^[a-f0-9]{64}$/.test(hash) ? hash : null
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startDashboard()
