import { compareCsv } from "./oracle"
import { coverageOutputFields, nodeCase } from "./node-cases"

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

function tableCsv(output: ObjectValue, execution: string, node: ObjectValue, id: string, completeReread=false): string | null {
  const contract = nodeCase(id)
  if (output.status !== "complete" || output.execution_id !== execution || !Array.isArray(output.ports)) return null
  const port = output.ports.find((p: ObjectValue) => p.port === 0)
  if (!port || port.fresh !== true || port.execution_id !== execution || port.precision?.numbers_verified !== true || !Array.isArray(port.schema)) return null
  const native = port.exact_table?.complete === true
  if ((port.precision?.limitations ?? []).some((limit: string) => !native || !["no_server_snapshot", "unobserved_aba_risk"].includes(limit))) return null
  const rows = port.exact_table?.complete === true ? port.exact_table.rows : port.sample_complete === true ? port.sample : null
  if (!Array.isArray(rows) || rows.length !== port.row_count || (!port.exact_table && port.sample_rows !== rows.length)) return null
  const names = port.schema.map((c: ObjectValue) => c.name)
  if (new Set(names).size !== names.length || !contract.keys.every(n => names.includes(n))) return null
  if (contract.coverage) {
    const fields = coverageOutputFields(id)
    if (!native || port.sample_complete !== true || port.sample_rows !== port.row_count || port.sample?.length !== port.row_count ||
      names.length !== fields.length + 1 || port.schema.some((c: ObjectValue) => c.type !== (c.name === "Region" ? "string" : fields.find(f => f.name === c.name)?.type)) ||
      port.category_fields?.length !== fields.length || !fields.every(f => port.category_fields.filter((c: ObjectValue) =>
        c.field === f.name && c.fact === f.fact && c.function === f.fn && c.type === f.type && c.category_kind === "value" &&
        c.label === port.schema.find((s: ObjectValue) => s.name === f.name)?.label &&
        (f.categories.length === 1 ? c.category === f.categories[0] : c.categories?.length === 2 && c.categories.every((d: ObjectValue, i: number) =>
          d.dimension === contract.dimensions[i] && d.caption === f.categories[i] && d.value === f.categories[i] && d.kind === "value"))).length === 1)) return null
  } else if (contract.native) {
    // dock_node_read has no coverage=full option. Its complete fresh sample is
    // used only after the initial native full read, source change and same-node checks below.
    if ((!native && !completeReread) || port.sample_complete!==true || port.sample_rows!==port.row_count || port.sample?.length!==port.row_count ||
      port.schema.some((c:ObjectValue)=>c.type!==(contract.keys.includes(c.name)?"string":"real"))) return null
    const categories=id==="crosstable-sliding-source-refresh" && names.includes("C")?["B","C"]:["A","B"]
    const fields=categories.flatMap(category=>contract.functions.map(fn=>({category,fn,field:contract.functions.length>1?`${category}_${fn}`:category})))
    if (names.length!==contract.keys.length+fields.length || !fields.every(f=>names.includes(f.field)) || port.category_fields?.length!==fields.length ||
      !fields.every(f=>port.category_fields.filter((c:ObjectValue)=>c.category===f.category && c.category_kind==="value" && c.fact==="Amount" && c.function===f.fn && c.field===f.field && c.type==="real" && c.label===port.schema.find((s:ObjectValue)=>s.name===f.field)?.label).length===1)) return null
  } else if(names.length!==3 || !["Region","A","B"].every(n=>names.includes(n))) return null
  if(completeReread && !native && (output.workflow_returned!==true || !port.port_guid || port.table?.port_guid!==port.port_guid)) return null
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
      if (contract.coverage && cell?.is_null === true) {
        if (id !== "crosstable-column-cartesian" || !["A_shop", "B_web"].includes(names[cells.length]) || cell.value !== null ||
          cell.type !== port.schema[cells.length].type || cell.precision !== "exact_native" || cell.native?.tag !== 1 || cell.native.encoding !== "null") return null
        cells.push(""); continue
      }
      if (!cell || cell.is_null !== false || !["string", "number"].includes(typeof cell.value)) return null
      if (native) {
        const proof = cell.native
        if (cell.precision !== "exact_native" || !proof) return null
        const expectedType = contract.coverage ? port.schema[cells.length].type : contract.keys.includes(names[cells.length]) ? "string" : "real"
        if (contract.coverage && (cell.type !== expectedType || proof.tag !== ({ string: 8, integer: 20, real: 5 } as Record<string, number>)[expectedType])) return null
        if (proof.encoding !== (expectedType === "string" ? "utf8" : expectedType === "integer" ? "signed-int64-le" : "ieee754-binary64-le")) return null
        if (proof.encoding === "utf8") {
          if (typeof proof.utf8_hex !== "string" || !/^(?:[\da-f]{2})*$/i.test(proof.utf8_hex) || Buffer.from(proof.utf8_hex, "hex").toString("utf8") !== cell.value) return null
        } else if (proof.encoding === "signed-int64-le" && proof.bits === 64 && /^[\da-f]{16}$/i.test(proof.bytes_le ?? "") && /^-?\d+$/.test(String(cell.value))) {
          if (Buffer.from(proof.bytes_le, "hex").readBigInt64LE() !== BigInt(cell.value)) return null
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
  const contract = nodeCase(id)
  const { receipts, failures } = operationReceipts(events)
  const applications = receipts.filter(pair => pair.request.tool.endsWith("node_apply") && pair.request.input.target?.type === "transform.cross_table")
  const creation = applications.find(pair => {
    const node = pair.receipt.output.node, configuration = pair.receipt.output.configuration
    return pair.request.input.target.kind === "new" && configuration?.status === "applied" && configuration.readback?.kind === "crosstable" &&
      node?.node_id === crossId && identity(node) !== null && identity(node) === identity(configuration.readback.node) &&
      pair.request.input.document_id === node.document_id && pair.request.input.workflow_ref?.workflow_id === node.workflow_id
  })
  if (!creation) failures.push("sequence: fresh CrossTable creation proof required")
  if (contract.coverage && creation) {
    const p = creation.request.input.parameters
    const dimensions = p?.columns ?? (p?.column ? [p.column] : [])
    if (creation.request.input.mode !== "pivot" || creation.request.input.inputs?.length !== 1 ||
      JSON.stringify(p?.row_keys?.map((f: ObjectValue) => [f.kind, f.name])) !== JSON.stringify(contract.keys.map(name => ["input_field", name])) ||
      JSON.stringify(dimensions.map((f: ObjectValue) => [f.kind, f.name])) !== JSON.stringify(contract.dimensions.map(name => ["input_field", name])) ||
      JSON.stringify(p?.facts?.map((f: ObjectValue) => [f.field?.kind, f.field?.name, [...(f.functions ?? [])].sort()])) !== JSON.stringify(contract.facts.map(f => ["input_field", f.name, [...f.functions].sort()])) ||
      p?.category_mode !== contract.mode || (contract.mode === "fixed" ? p.include_null !== false || p.include_other !== false : p.include_null !== undefined || p.include_other !== undefined))
      failures.push("sequence: full assigned initial CrossTable configuration required")
  }
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
    const completeReread=id==="crosstable-sliding-source-refresh" && pair.request.tool.endsWith("node_read") && pair.request.input.read?.require_exact_numbers===true &&
      r.execution?.status==="completed" && r.output?.ports?.[0]?.port_guid===creation?.receipt.output.output?.ports?.[0]?.port_guid
    const csv = tableCsv(r.output ?? {}, execution, node, id, completeReread)
    if (csv && application) reads.push({ ...pair, application, config, execution, csv })
  }
  const aggregate = contract.functions
  const mode = contract.mode
  function matches(read: typeof reads[number], expectedAggregate: string | string[], expected: string) {
    const c = read.config
    if (contract.coverage) return c.category_mode === contract.mode &&
      JSON.stringify(c.row_keys?.map((f: ObjectValue) => [f.name, f.type, f.order])) === JSON.stringify(contract.keys.map((name, order) => [name, "string", order])) &&
      JSON.stringify(c.columns?.map((f: ObjectValue) => [f.name, f.type, f.order])) === JSON.stringify(contract.dimensions.map((name, order) => [name, "string", order])) &&
      JSON.stringify(c.facts?.map((f: ObjectValue) => [f.name, f.type, f.order, [...f.functions].sort()])) === JSON.stringify(contract.facts.map((f, order) => [f.name, f.type, order, [...f.functions].sort()])) &&
      c.options?.include_null === false && c.options?.include_other === false && c.options?.min_values === 0 &&
      (id === "crosstable-local-variable-bindings" ? c.options.limit === 1 && c.options.unique_names === true && c.options.separator === "." &&
        Object.keys(c.options.variable_bindings ?? {}).sort().join(",") === "limit,separator,unique_names" : c.options.limit === 0 && Object.keys(c.options.variable_bindings ?? {}).length === 0) &&
      compareCsv(expected, read.csv, 0).passed
    const functions=typeof expectedAggregate==="string"?[expectedAggregate]:expectedAggregate
    return c.category_mode === mode && c.row_keys?.length === contract.keys.length && c.row_keys.every((key:ObjectValue,index:number)=>key.name===contract.keys[index] && (!contract.native || key.type==="string" && key.order===index)) &&
      c.column?.name === "Category" && c.facts?.length === 1 && c.facts[0].name === "Amount" &&
      JSON.stringify([...c.facts[0].functions].sort()) === JSON.stringify([...functions].sort()) &&
      (!contract.native || c.column.type==="string" && c.columns?.length===1 && c.columns[0].name==="Category" && c.facts[0].type==="real") &&
      c.options?.include_null === false && c.options?.include_other === false &&
      Object.keys(c.options?.variable_bindings ?? {}).length === 0 && compareCsv(expected, read.csv, 0).passed
  }
  const final = reads.filter(read => matches(read, aggregate, finalCsv)).at(-1)
  if (!final) failures.push("sequence: complete fresh final CrossTable read missing")
  if (id === "crosstable-reconfigure") {
    const avgApplications = applications.filter(a => identity(a.receipt.output.node) === identity(final?.config.node) &&
      a.receipt.output.configuration?.readback?.facts?.some((fact: { functions?: string[] }) => fact.functions?.includes("avg")))
    const initial = reads.find(read => initialCsv && matches(read, "sum", initialCsv) && final &&
      after(final.request, read.receipt) && read.execution !== final.execution &&
      identity(read.receipt.output.node) === identity(final.receipt.output.node ?? final.config.node))
    const avg = avgApplications[0]
    const facts = avg?.request.input.parameters?.facts
    if (!initial || !avg || avgApplications.some(a => !after(a.request, initial.receipt)) || avg.request.input.target?.kind !== "existing" ||
      facts?.length !== 1 || facts[0].field?.name !== "Amount" || JSON.stringify(facts[0].functions) !== JSON.stringify(["avg"]))
      failures.push("sequence: initial sum/read before same-node avg with new execution required")
  }
  if(id==="crosstable-sliding-source-refresh") {
    const initial=reads.find(read=>initialCsv && matches(read,"sum",initialCsv) && read.application===creation)
    const imported=receipts.find(p=>p.request.input.target?.type==="imports.text" && p.request.input.target.kind==="new" &&
      p.receipt.output.execution?.status==="completed" && p.receipt.output.node?.document_id===creation?.receipt.output.node?.document_id && p.receipt.output.node?.workflow_id===creation?.receipt.output.node?.workflow_id)
    const changed=receipts.find(p=>p.request.input.target?.type==="imports.text" && p.request.input.target.kind==="existing" &&
      identity(p.request.input.target.ref)===identity(imported?.receipt.output.node) && identity(p.receipt.output.node)===identity(imported?.receipt.output.node) &&
      p.receipt.output.execution?.status==="completed" && p.request.input.parameters?.source &&
      p.receipt.output.configuration?.readback?.source?.source_path!==imported?.receipt.output.configuration?.readback?.source?.source_path)
    const repeats=events.calls.filter(c=>c.tool.endsWith("node_apply") && c.input.target?.type==="transform.cross_table" && initial && after(c,initial.receipt))
    if(!initial || !imported || !changed || !final || !after(creation!.request,imported.receipt) || !after(changed.request,initial.receipt) || !after(final.request,changed.receipt) ||
      final.execution===initial.execution || !final.request.tool.endsWith("node_read") || final.request.input.source_operation_id!==creation?.request.input.operation_id || repeats.length ||
      reads.some(read=>read.config.options?.unique_names!==true || read.config.output_mapping))
      failures.push("sequence: initial full read → same import source change → new same CrossTable reread without apply required")
  }
  return { failures, final }
}
