import { createHash, randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, realpath } from "node:fs/promises"
import { createServer } from "node:http"
import { extname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

function json(response, status, data) {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"})
  response.end(JSON.stringify(data))
}

async function body(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") throw Error("Expected application/json")
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 1024) throw Error("Snapshot exceeds 1 MiB")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString())
}

function appKey(binding) {
  const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
  if (!binding || !guid.test(binding.workflowGuid) || !guid.test(binding.nodeGuid) || binding.port !== 0 ||
      typeof binding.packagePath !== "string" || !binding.packagePath.startsWith("/") ||
      !/^https?:\/\//.test(binding.server) || new URL(binding.server).origin !== binding.server) {
    throw Error("Invalid Loginom binding")
  }
  return createHash("sha256").update(JSON.stringify([
    binding.server, binding.packagePath, binding.workflowGuid.toLowerCase(), binding.nodeGuid.toLowerCase(), binding.port,
  ])).digest("hex")
}

async function snapshot(data, projectRoot, publishRoot) {
  const key = appKey(data.binding)
  // Accept the previous client's payload while bootstrap and Node are rolled out.
  let sample = data.sample === undefined ? { schema: data.schema, rows: data.rows } : data.sample
  let tableSource = sample === null ? "unavailable" : "live"
  if (sample === null) {
    try {
      const dir = join(publishRoot, key)
      const binding = JSON.parse(await readFile(join(dir, "binding.json"), "utf8"))
      if (appKey(binding) !== key) throw Error("Published example binding differs")
      sample = JSON.parse(await readFile(join(dir, "sample.json"), "utf8"))
      tableSource = "published-example"
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  const schema = sample === null ? [] : sample.schema
  const rows = sample === null ? [] : sample.rows
  const scalar = value => value === null || ["string", "number", "boolean"].includes(typeof value)
  if (typeof data.nodeName !== "string" || !data.nodeName ||
      !Array.isArray(schema) || !schema.every(c => c && typeof c.name === "string" && ["string", "number"].includes(typeof c.type)) ||
      !Array.isArray(rows) || !rows.every(r => Array.isArray(r) && r.length === schema.length && r.every(scalar)) ||
      !Array.isArray(data.parameters) || !data.parameters.every(p => p && typeof p.name === "string" && scalar(p.value))) {
    throw Error("Invalid node, table or parameters")
  }
  const id = randomUUID()
  const sourceDir = join(projectRoot, "dashboard/apps", key)
  const script = join(projectRoot, "dashboard/publish.mjs").replaceAll("'", "'\\''")
  const publish = `node '${script}' ${id}`
  return {
    id, key, sourceDir, binding: data.binding, nodeName: data.nodeName, schema, rows, tableSource,
    parameters: data.parameters,
    adapter: "window.frameElement.dashboard.state(), change(value: number, name?: string), run() return Promise<{value: number|null, parameters: {name:string,value:number|null}[], table: {schema: {name: string, type: number|string}[], rows: (string|number|boolean|null)[][]}|null, error: string|null}>. Read the screen's data from this adapter. Snapshot rows are examples. Use native change on Enter/blur or slider release; reject invalid thresholds. Optional name chooses a numeric variable; value is the first variable. Pending submitted values finish in order even if the iframe closes. state() waits for pending Loginom calculations. Use the installed React/TypeScript/Vite/Recharts template. Keep the control editable during recalculation; ignore outdated replies when changes overlap. Show «Идёт расчёт» while waiting. On error, show the actual value plus the last successful table labelled «расчёт при пороге N». On every opening, the Loginom bootstrap executes an inactive node or retries a saved error before loading the iframe; an active node without an error reuses its result. The app only calls state() on mount: do not add an initial «Выполнить» button or call run() automatically. An empty table is a successful result. For ROI use two decimal places and — for an undefined ratio.",
    commands: {init: publish + " --init", typecheck: "npm run typecheck", build: "npm run build", publish},
  }
}

const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
}

async function serveApp(response, publishRoot, key, asset) {
  const requested = asset || "index.html"
  if (requested.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\"))) {
    return json(response, 400, {error: "Invalid asset path"})
  }
  try {
    const root = await realpath(publishRoot)
    const dir = await realpath(join(root, key))
    if (!dir.startsWith(root + sep)) return json(response, 404, {error: "Not found"})
    const file = await realpath(join(dir, requested))
    if (!file.startsWith(dir + sep)) return json(response, 404, {error: "Not found"})
    const data = await readFile(file)
    response.writeHead(200, {
      "content-type": mime[extname(file)] ?? "application/octet-stream",
      "cache-control": file.endsWith("index.html") ? "no-store" : "no-cache",
      "x-content-type-options": "nosniff",
    })
    response.end(data)
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) return json(response, 404, {error: "Not found"})
    throw error
  }
}

export function dashboardServer({projectRoot, publishRoot}) {
  const snapshots = new Map()
  let current
  return createServer(async (request, response) => {
    try {
      const path = request.url.split("?")[0]
      if (request.method === "POST" && path === "/dashboard/lookup") {
        const key = appKey(await body(request))
        return json(response, 200, {key, exists: existsSync(join(publishRoot, key, "binding.json"))})
      }
      if (request.method === "POST" && path === "/dashboard/targets") {
        const target = await snapshot(await body(request), projectRoot, publishRoot)
        snapshots.set(target.id, target)
        current = target
        return json(response, 201, target)
      }
      if (request.method === "GET") {
        const target = path === "/dashboard/current" ? current : snapshots.get(path.match(/^\/dashboard\/targets\/([^/]+)$/)?.[1])
        if (target) return json(response, 200, target)
        const app = path.match(/^\/dashboard\/apps\/([a-f0-9]{64})\/(.*)$/)
        if (app) return await serveApp(response, publishRoot, app[1], decodeURIComponent(app[2]))
      }
      json(response, 404, {error: "Not found"})
    } catch (error) {
      json(response, error.code ? 500 : 400, {error: error.code ? "Could not serve dashboard" : error.message})
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dashboardServer({
    projectRoot: process.env.DASHBOARD_PROJECT_ROOT ?? resolve(import.meta.dirname, ".."),
    publishRoot: process.env.DASHBOARD_PUBLISH_ROOT ?? "/workdir/dashboard-app/apps",
  }).listen(8100)
}
