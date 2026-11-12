import { createHash, randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Option, Schema } from "effect"
import { Binding, Snapshot, SnapshotRequest, TableSample } from "../contract/snapshot.ts"
import { appHost, type Mode } from "./apps.ts"

export { appHeaders, appHost } from "./apps.ts"

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(JSON.stringify(data))
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw Error("Expected application/json")
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 1024) throw Error("Snapshot exceeds 1 MiB")
    chunks.push(chunk)
  }
  // Native JSON errors are part of the M0 HTTP response. Schemas validate the parsed values below.
  return JSON.parse(Buffer.concat(chunks).toString())
}

function appKey(input: unknown) {
  const decoded = Schema.decodeUnknownOption(Binding, { onExcessProperty: "preserve" })(input)
  if (Option.isNone(decoded)) throw Error("Invalid Loginom binding")
  const binding = decoded.value
  const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
  if (
    !guid.test(binding.workflowGuid) ||
    !guid.test(binding.nodeGuid) ||
    !binding.packagePath.startsWith("/") ||
    !/^https?:\/\//.test(binding.server) ||
    new URL(binding.server).origin !== binding.server
  )
    throw Error("Invalid Loginom binding")
  return createHash("sha256")
    .update(
      JSON.stringify([
        binding.server,
        binding.packagePath,
        binding.workflowGuid.toLowerCase(),
        binding.nodeGuid.toLowerCase(),
        binding.port,
      ]),
    )
    .digest("hex")
}

async function snapshot(input: unknown, projectRoot: string, buildsRoot: string): Promise<typeof Snapshot.Type> {
  const raw = input as Record<string, unknown>
  const key = appKey(raw.binding)
  // Accept the previous client's payload while bootstrap and Node are rolled out.
  let sample: unknown = raw.sample === undefined ? { schema: raw.schema, rows: raw.rows } : raw.sample
  let tableSource: typeof Snapshot.Type.tableSource = sample === null ? "unavailable" : "live"
  if (sample === null) {
    try {
      const dir = join(buildsRoot, key)
      const binding: unknown = JSON.parse(await readFile(join(dir, "binding.json"), "utf8"))
      if (appKey(binding) !== key) throw Error("Published example binding differs")
      sample = JSON.parse(await readFile(join(dir, "sample.json"), "utf8"))
      tableSource = "published-example"
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
  }
  const decoded = Schema.decodeUnknownOption(SnapshotRequest, { onExcessProperty: "preserve" })(input)
  if (Option.isNone(decoded)) throw Error("Invalid node, table or parameters")
  const data = decoded.value
  const table = Schema.decodeUnknownOption(TableSample, { onExcessProperty: "preserve" })(
    sample === null ? { schema: [], rows: [] } : sample,
  )
  if (Option.isNone(table)) throw Error("Invalid node, table or parameters")
  const schema = table.value.schema
  const rows = table.value.rows
  const id = randomUUID()
  const sourceDir = join(projectRoot, "dashboard/apps", key)
  const script = join(projectRoot, "packages/dashboard/script/publish.mjs").replaceAll("'", "'\\''")
  const publish = `node '${script}' ${id}`
  return {
    id,
    key,
    sourceDir,
    binding: data.binding,
    nodeName: data.nodeName,
    schema,
    rows,
    tableSource,
    parameters: data.parameters,
    adapter:
      "window.frameElement.dashboard.state(), change(value: number, name?: string), run() return Promise<{value: number|null, parameters: {name:string,value:number|null}[], table: {schema: {name: string, type: number|string}[], rows: (string|number|boolean|null)[][]}|null, error: string|null}>. Read the screen's data from this adapter. Snapshot rows are examples. Use native change on Enter/blur or slider release; reject invalid thresholds. Optional name chooses a numeric variable; value is the first variable. Pending submitted values finish in order even if the iframe closes. state() waits for pending Loginom calculations. Use the installed React/TypeScript/Vite/Recharts template. Keep the control editable during recalculation; ignore outdated replies when changes overlap. Show «Идёт расчёт» while waiting. On error, show the actual value plus the last successful table labelled «расчёт при пороге N». On every opening, the Loginom bootstrap executes an inactive node or retries a saved error before loading the iframe; an active node without an error reuses its result. The app only calls state() on mount: do not add an initial «Выполнить» button or call run() automatically. An empty table is a successful result. For ROI use two decimal places and — for an undefined ratio.",
    commands: { init: publish + " --init", typecheck: "npm run typecheck", build: "npm run build", publish },
  }
}

type Options = {
  projectRoot: string
  buildsRoot: string
  appOrigin: string
  mode: Mode
  maxSnapshots?: number
  allowCurrent?: boolean
  allowedHosts?: string[]
}

export function dashboardServer({
  projectRoot,
  buildsRoot,
  appOrigin,
  mode,
  maxSnapshots = 100,
  allowCurrent = false,
  allowedHosts,
}: Options) {
  const snapshots = new Map<string, typeof Snapshot.Type>()
  let current: typeof Snapshot.Type | undefined
  return createServer(async (request, response) => {
    try {
      const hosts =
        allowedHosts ?? ["localhost", "127.0.0.1", "[::1]"].map((host) => `${host}:${request.socket.localPort}`)
      if (!hosts.some((host) => host.toLowerCase() === request.headers.host?.toLowerCase())) {
        return json(response, 403, { error: "Forbidden host" })
      }
      const path = request.url!.split("?")[0]
      if (request.method === "POST" && path === "/dashboard/lookup") {
        const key = appKey(await body(request))
        const hash = await currentBuild(buildsRoot, key)
        return json(response, 200, { key, exists: hash !== null, hash, appOrigin, mode })
      }
      if (request.method === "POST" && path === "/dashboard/targets") {
        const target = await snapshot(await body(request), projectRoot, buildsRoot)
        snapshots.set(target.id, target)
        current = target
        if (snapshots.size > maxSnapshots) snapshots.delete(snapshots.keys().next().value!)
        return json(response, 201, target)
      }
      if (request.method === "GET") {
        const id = path?.match(/^\/dashboard\/targets\/([^/]+)$/)?.[1]
        const target =
          path === "/dashboard/current"
            ? allowCurrent && /^(?:127\.|::ffff:127\.|::1$)/.test(request.socket.remoteAddress ?? "") && current
            : id && snapshots.get(id)
        if (target) return json(response, 200, target)
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
    projectRoot:
      env.DASHBOARD_PROJECT_ROOT ??
      resolve(import.meta.dirname, basename(import.meta.dirname) === "dist" ? "../../.." : "../../../.."),
    buildsRoot,
    appOrigin,
    mode,
    allowCurrent: env.DASHBOARD_ALLOW_CURRENT === "1",
    allowedHosts:
      env.DASHBOARD_CLIENT_ORIGINS === undefined ? undefined : clientOrigins.map((origin) => new URL(origin).host),
  })
  const apps = appHost({ buildsRoot, appOrigin, clientOrigins, mode })
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
