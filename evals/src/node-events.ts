import { compareCsv } from "./oracle"

// Public tool protocol is heterogeneous; inspect complete raw tool-parts, never truncated nodeReceipts.
type ObjectValue = Record<string, any>
export type NodeCall = { index: number; start: number; end: number; tool: string; input: ObjectValue; output: ObjectValue }
export type NodeEvents = { calls: NodeCall[]; failures: string[] }

function firstObject(source: string): ObjectValue {
  let depth = 0, quoted = false, escaped = false
  const start = source.indexOf("{")
  if (start < 0) return {}
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') quoted = false
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return JSON.parse(source.slice(start, i + 1))
  }
  throw Error("Incomplete tool output JSON")
}

export function readNodeEvents(source: string): NodeEvents {
  const calls: NodeCall[] = [], failures: string[] = [], seen = new Map<string, string>()
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const event = JSON.parse(line), part = event.part, state = part?.state
    if (event.type !== "tool_use" || !part.tool?.startsWith("loginom_") || state?.status !== "completed") continue
    const key = part.id ?? part.callID
    if (!key) { failures.push("events: tool-part identity missing"); continue }
    const payload = JSON.stringify({ tool: part.tool, input: state.input, output: state.output, time: state.time })
    if (seen.has(key)) {
      if (seen.get(key) !== payload) failures.push("events: contradictory duplicate tool-part")
      continue
    }
    seen.set(key, payload)
    const start = state.time?.start, end = state.time?.end
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) failures.push("events: tool call timing missing/invalid")
    calls.push({ index, start, end, tool: part.tool, input: state.input ?? {}, output: typeof state.output === "string" ? firstObject(state.output) : state.output ?? {} })
  }
  return { calls, failures }
}

export function after(later: NodeCall, earlier: NodeCall) {
  return later.index > earlier.index && later.start >= earlier.end
}

export function successful(call: NodeCall) {
  return call.output.status === "SUCCEEDED" && call.output.cleanup_complete === true && call.output.error == null
}

export function operationReceipts(events: NodeEvents) {
  const requests = new Map<string, NodeCall>()
  const receipts: { request: NodeCall; receipt: NodeCall }[] = []
  const failures = [...events.failures]
  for (const call of events.calls) {
    if (call.tool.endsWith("node_apply") || call.tool.endsWith("node_read")) {
      const op = call.input.operation_id
      if (typeof op !== "string") { failures.push("events: missing operation_id"); continue }
      const previous = requests.get(op)
      if (previous && JSON.stringify(previous.input) !== JSON.stringify(call.input)) failures.push("events: conflicting operation request")
      else if (!previous) requests.set(op, call)
    }
    const request = requests.get(call.output.operation_id)
    if (request && successful(call) && call.output.state === "settled") receipts.push({ request, receipt: call })
  }
  return { receipts, failures }
}

function identity(node: ObjectValue | undefined) {
  return node && [node.document_id, node.workflow_id, node.node_id].every(v => typeof v === "string" && v.length)
    ? JSON.stringify([node.document_id, node.workflow_id, node.node_id]) : null
}

function tableCsv(output: ObjectValue, execution: string, node: ObjectValue): string | null {
  if (output.status !== "complete" || output.execution_id !== execution || !Array.isArray(output.ports)) return null
  const port = output.ports.find((p: ObjectValue) => p.port === 0)
  if (!port || port.fresh !== true || port.execution_id !== execution || port.precision?.numbers_verified !== true || !Array.isArray(port.schema)) return null
  const native = port.exact_table?.complete === true
  if ((port.precision?.limitations ?? []).some((limit: string) => !native || !["no_server_snapshot", "unobserved_aba_risk"].includes(limit))) return null
  const rows = port.exact_table?.complete === true ? port.exact_table.rows : port.sample_complete === true ? port.sample : null
  if (!Array.isArray(rows) || rows.length !== port.row_count || (!port.exact_table && port.sample_rows !== rows.length)) return null
  const names = port.schema.map((c: ObjectValue) => c.name)
  if (names.length !== 3 || new Set(names).size !== 3 || !["Region", "A", "B"].every(n => names.includes(n))) return null
  if (native && (identity(port.binding) !== identity(node) || port.binding?.port_guid !== port.port_guid ||
    port.binding?.execution?.execution_id !== execution || port.binding?.execution?.status !== "completed" ||
    port.read_coverage?.table_complete !== true || port.read_coverage.rows_read !== rows.length ||
    port.read_coverage.columns_read !== names.length || port.read_coverage.cells_read !== rows.length * names.length ||
    port.read_consistency?.changed !== false || port.read_consistency?.exclusive_operation !== true ||
    port.read_consistency?.stability_basis !== "owned_static_completed_fixture")) return null
  const csv = [names]
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== names.length) return null
    const cells: string[] = []
    for (const cell of row) {
      if (!cell || cell.is_null !== false || !["string", "number"].includes(typeof cell.value)) return null
      if (native) {
        const proof = cell.native
        if (cell.precision !== "exact_native" || !proof) return null
        if (proof.encoding !== (names[cells.length] === "Region" ? "utf8" : "ieee754-binary64-le")) return null
        if (proof.encoding === "utf8") {
          if (typeof proof.utf8_hex !== "string" || !/^(?:[\da-f]{2})*$/i.test(proof.utf8_hex) || Buffer.from(proof.utf8_hex, "hex").toString("utf8") !== cell.value) return null
        } else if (proof.encoding === "ieee754-binary64-le" && proof.bits === 64 && /^[\da-f]{16}$/i.test(proof.bytes_le ?? "")) {
          const value = Buffer.from(proof.bytes_le, "hex").readDoubleLE()
          if (!Number.isFinite(value) || value !== Number(cell.value)) return null
        } else return null
      }
      cells.push(String(cell.value))
    }
    csv.push(cells)
  }
  return csv.map(row => row.map((v: string) => JSON.stringify(v)).join(",")).join("\n") + "\n"
}

export function checkNodeSequence(events: NodeEvents, id: string, crossId: string, finalCsv: string, initialCsv?: string) {
  const { receipts, failures } = operationReceipts(events)
  const applications = receipts.filter(pair => pair.request.tool.endsWith("node_apply") && pair.request.input.target?.type === "transform.cross_table")
  const creation = applications.find(pair => {
    const node = pair.receipt.output.node, configuration = pair.receipt.output.configuration
    return pair.request.input.target.kind === "new" && configuration?.status === "applied" && configuration.readback?.kind === "crosstable" &&
      node?.node_id === crossId && identity(node) !== null && identity(node) === identity(configuration.readback.node) &&
      pair.request.input.document_id === node.document_id && pair.request.input.workflow_ref?.workflow_id === node.workflow_id
  })
  if (!creation) failures.push("sequence: fresh CrossTable creation proof required")
  const reads: { request: NodeCall; receipt: NodeCall; application: { request: NodeCall; receipt: NodeCall }; config: ObjectValue; execution: string; csv: string }[] = []
  for (const pair of receipts) {
    const r = pair.receipt.output
    const application = pair.request.tool.endsWith("node_apply") ? pair : applications.find(a =>
      a.request.input.operation_id === pair.request.input.source_operation_id && after(pair.request, a.receipt))
    const config = application?.receipt.output.configuration?.readback
    if (!config || config.kind !== "crosstable") continue
    const execution = r.execution?.execution_id ?? r.output?.execution_id
    const node = r.node ?? config.node
    if (node?.node_id !== crossId || identity(node) !== identity(config.node)) { failures.push("sequence: node identity differs"); continue }
    const request = application!.request.input
    if (request.document_id !== node.document_id || request.workflow_ref?.workflow_id !== node.workflow_id ||
      request.target?.kind === "existing" && identity(request.target.ref) !== identity(node)) {
      failures.push("sequence: request/receipt owner differs"); continue
    }
    if (!creation || identity(node) !== identity(creation.receipt.output.node) ||
      request.operation_id !== creation.request.input.operation_id && !after(application!.request, creation.receipt)) continue
    if (application?.receipt.output.execution?.status !== "completed" || r.output?.execution_id !== execution) continue
    if (pair.request.tool.endsWith("node_apply") && config.execution_id && config.execution_id !== execution) continue
    const csv = tableCsv(r.output ?? {}, execution, node)
    if (csv && application) reads.push({ ...pair, application, config, execution, csv })
  }
  const aggregate = id === "crosstable-fixed-sum" ? "sum" : "avg"
  const mode = id === "crosstable-sliding-average" ? "sliding" : "fixed"
  function matches(read: typeof reads[number], expectedAggregate: string, expected: string) {
    const c = read.config
    return c.category_mode === mode && c.row_keys?.length === 1 && c.row_keys[0].name === "Region" &&
      c.column?.name === "Category" && c.facts?.length === 1 && c.facts[0].name === "Amount" &&
      JSON.stringify(c.facts[0].functions) === JSON.stringify([expectedAggregate]) &&
      c.options?.include_null === false && c.options?.include_other === false &&
      Object.keys(c.options?.variable_bindings ?? {}).length === 0 && compareCsv(expected, read.csv, 0).passed
  }
  const final = reads.filter(read => matches(read, aggregate, finalCsv)).at(-1)
  if (!final) failures.push("sequence: complete fresh final CrossTable read missing")
  if (id === "crosstable-reconfigure") {
    const avgApplications = applications.filter(a => a.receipt.output.configuration?.readback?.facts?.[0]?.functions?.[0] === "avg")
    const initial = reads.find(read => initialCsv && matches(read, "sum", initialCsv) && final &&
      after(final.request, read.receipt) && read.execution !== final.execution &&
      identity(read.receipt.output.node) === identity(final.receipt.output.node ?? final.config.node))
    const avg = avgApplications.find(a => final && a.request.input.operation_id === final.application.request.input.operation_id)
    if (!initial || !avg || !after(avg.request, initial.receipt) || avg.request.input.target?.kind !== "existing")
      failures.push("sequence: initial sum/read before same-node avg with new execution required")
  }
  return { failures, final }
}
