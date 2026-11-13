export type DashboardTable = {
  schema: { name: string; type: number | string }[]
  rows: (string | number | boolean | null)[][]
  truncated: boolean
  totalRows: number
}
export type DashboardState = {
  parameters: { name: string; value: number | null }[]
  table: DashboardTable | null
  error: string | null
  busy: boolean
}

const listeners = new Set<(state: DashboardState) => void>()
let last: DashboardState | undefined

export function onState(listener: (state: DashboardState) => void) {
  listeners.add(listener)
  if (last) listener(last)
  return () => {
    listeners.delete(listener)
  }
}

export function close() {
  parent.postMessage({ type: "loginom-dashboard/close", version: 1 }, "*")
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const cell = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value)

export function isState(value: unknown): value is DashboardState & { type: "state" } {
  if (!record(value) || !exact(value, ["type", "parameters", "table", "error", "busy"]) || value.type !== "state") return false
  if (typeof value.busy !== "boolean" || (value.error !== null && typeof value.error !== "string")) return false
  const parameters = value.parameters
  if (
    !Array.isArray(parameters) ||
    !Array.from(parameters).every(
      (p) => record(p) && exact(p, ["name", "value"]) && typeof p.name === "string" && (p.value === null || typeof p.value === "number"),
    )
  )
    return false
  const table = value.table
  if (table === null) return true
  if (!record(table) || !exact(table, ["schema", "rows", "truncated", "totalRows"])) return false
  if (typeof table.truncated !== "boolean" || typeof table.totalRows !== "number") return false
  const schema = table.schema
  const rows = table.rows
  return (
    Array.isArray(schema) &&
    Array.from(schema).every((c) => record(c) && exact(c, ["name", "type"]) && typeof c.name === "string" && ["number", "string"].includes(typeof c.type)) &&
    Array.isArray(rows) &&
    Array.from(rows).every((row) => Array.isArray(row) && row.length === schema.length && Array.from(row).every(cell))
  )
}

// Node imports this file for the contract test; only a browser connects.
if (typeof window === "object") {
  let port: MessagePort | undefined
  window.addEventListener("message", (event) => {
    const data: unknown = event.data
    if (port || event.source !== parent || event.ports.length !== 1) return
    if (!record(data) || !exact(data, ["type", "version"]) || data.type !== "loginom-dashboard/init" || data.version !== 1) return
    port = event.ports[0]!
    port.onmessage = (message) => {
      if (!isState(message.data)) return console.warn("Loginom dashboard: invalid state ignored")
      const state = message.data
      last = { parameters: state.parameters, table: state.table, error: state.error, busy: state.busy }
      listeners.forEach((listener) => listener(last!))
    }
  })
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close()
  })
  parent.postMessage({ type: "loginom-dashboard/ready", version: 1 }, "*")
}
