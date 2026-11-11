import { createHash, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { basename, extname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { Option, Schema } from "effect"
import { Binding, Snapshot, SnapshotRequest, TableSample } from "../contract/snapshot.ts"

function json(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(JSON.stringify(data))
}

async function body(request: IncomingMessage) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw Error("Expected application/json")
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 1024) throw Error("Snapshot exceeds 1 MiB")
    chunks.push(chunk)
  }
  return Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(Buffer.concat(chunks).toString())
}

function appKey(input: unknown) {
  const binding = Schema.decodeUnknownSync(Binding, { onExcessProperty: "preserve" })(input)
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

async function snapshot(input: unknown, projectRoot: string, publishRoot: string): Promise<typeof Snapshot.Type> {
  const decoded = Schema.decodeUnknownOption(SnapshotRequest, { onExcessProperty: "preserve" })(input)
  if (Option.isNone(decoded)) throw Error("Invalid node, table or parameters")
  const data = decoded.value
  const key = appKey(data.binding)
  // Accept the previous client's payload while bootstrap and Node are rolled out.
  let sample: unknown = data.sample === undefined ? { schema: data.schema, rows: data.rows } : data.sample
  let tableSource: typeof Snapshot.Type.tableSource = sample === null ? "unavailable" : "live"
  if (sample === null) {
    try {
      const dir = join(publishRoot, key)
      const binding = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
        await readFile(join(dir, "binding.json"), "utf8"),
      )
      if (appKey(binding) !== key) throw Error("Published example binding differs")
      sample = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(await readFile(join(dir, "sample.json"), "utf8"))
      tableSource = "published-example"
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error
    }
  }
  const table = Schema.decodeUnknownOption(TableSample, { onExcessProperty: "preserve" })(
    sample === null ? { schema: [], rows: [] } : sample,
  )
  if (Option.isNone(table)) throw Error("Invalid node, table or parameters")
  const schema = table.value.schema
  const rows = table.value.rows
  const id = randomUUID()
  const sourceDir = join(projectRoot, "dashboard/apps", key)
  const script = join(projectRoot, "dashboard/publish.mjs").replaceAll("'", "'\\''")
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

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
}

async function serveApp(response: ServerResponse, publishRoot: string, key: string, asset: string) {
  const requested = asset || "index.html"
  if (requested.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    return json(response, 400, { error: "Invalid asset path" })
  }
  try {
    const root = await realpath(publishRoot)
    const dir = await realpath(join(root, key))
    if (!dir.startsWith(root + sep)) return json(response, 404, { error: "Not found" })
    const file = await realpath(join(dir, requested))
    if (!file.startsWith(dir + sep)) return json(response, 404, { error: "Not found" })
    if (["binding.json", "sample.json"].some((name) => requested === name || file === join(dir, name))) {
      return json(response, 404, { error: "Not found" })
    }
    const data = await readFile(file)
    response.writeHead(200, {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
      "cache-control": file.endsWith("index.html") ? "no-store" : "no-cache",
      "x-content-type-options": "nosniff",
    })
    response.end(data)
  } catch (error) {
    if (error instanceof Error && "code" in error && ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(error.code)))
      return json(response, 404, { error: "Not found" })
    throw error
  }
}

type Options = {
  projectRoot: string
  publishRoot: string
  maxSnapshots?: number
  allowCurrent?: boolean
  allowedHosts?: string[]
}

export function dashboardServer({
  projectRoot,
  publishRoot,
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
        return json(response, 200, { key, exists: existsSync(join(publishRoot, key, "binding.json")) })
      }
      if (request.method === "POST" && path === "/dashboard/targets") {
        const target = await snapshot(await body(request), projectRoot, publishRoot)
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
        const app = path?.match(/^\/dashboard\/apps\/([a-f0-9]{64})\/(.*)$/)
        if (app) return await serveApp(response, publishRoot, app[1]!, decodeURIComponent(app[2]!))
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
  const server = dashboardServer({
    projectRoot:
      env.DASHBOARD_PROJECT_ROOT ??
      resolve(import.meta.dirname, basename(import.meta.dirname) === "dist" ? "../../.." : "../../../.."),
    publishRoot: env.DASHBOARD_PUBLISH_ROOT ?? "/workdir/dashboard-app/apps",
    allowCurrent: env.DASHBOARD_ALLOW_CURRENT === "1",
    allowedHosts: env.DASHBOARD_PUBLIC_HOSTS?.split(",").map((host) => host.trim()),
  })
  server.listen(Number(env.DASHBOARD_PORT ?? 8100), env.DASHBOARD_HOST ?? "127.0.0.1")
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startDashboard()
