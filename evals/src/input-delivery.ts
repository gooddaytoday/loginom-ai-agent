import path from "node:path"
import { after, operationReceipts, readNodeEvents, successful, type NodeCall } from "./node-events"
import type { Task } from "./task"

const nodeTools = new Set(["loginom_dock_node_apply", "loginom_dock_node_wait", "loginom_dock_node_resume",
  "loginom_dock_node_read", "loginom_dock_node_status"])
const deliveryTools = new Set(["loginom_dock_artifact_deliver", "loginom_dock_artifact_delivery_resume",
  "loginom_dock_artifact_delivery_status"])
const tools = new Set(["loginom_dock_prepare", ...nodeTools, ...deliveryTools])

export async function inputDelivery(task: Task, artifactDir: string, sessionId: string) {
  const file = task.id === "age-pressure-correlation" ? "data/dataset.csv"
    : task.id === "observed-purchase-cohort-retention-business" ? "data/purchase_lines.csv" : undefined
  if (!file || !task.inputs.includes(file)) return

  // The attempt keeps its full tool stream beside artifact/, including during rejudge.
  const source = await Bun.file(path.join(artifactDir, "..", "events.jsonl")).text().catch(() => "")
  const data = await Bun.file(path.join(task.dir, file)).bytes().catch(() => undefined)
  if (!source || !data) return
  const events = (() => {
    try {
      return readNodeEvents(source, { sessionId, tools })
    } catch {
      return undefined
    }
  })()
  if (!events) return
  const nodes = operationReceipts({ ...events, calls: events.calls.filter(call => nodeTools.has(call.tool)) }, undefined,
    call => successful(call) || call.output.status === "FAILED" && call.output.cleanup_complete === true &&
      call.output.configuration?.status === "applied")
  const deliveries = operationReceipts({ ...events, calls: events.calls.filter(call => deliveryTools.has(call.tool)) },
    call => call.tool === "loginom_dock_artifact_deliver")
  if (nodes.failures.length || deliveries.failures.length) return
  const input = path.basename(file)
  const sha256 = new Bun.CryptoHasher("sha256").update(data).digest("hex")
  const bytes = data.length
  const settled = nodes.receipts.filter(pair => boundResult(pair.receipt, pair.request))
  const importsChanged = settled.filter(({ request, receipt }) => {
    const node = receipt.output.node
    const target = request.input.target
    return request.tool === "loginom_dock_node_apply" && target?.type === "imports.text" &&
      node && safeId(node.document_id) && safeId(node.workflow_id) && isUuid(node.node_id) &&
      request.input.document_id === node.document_id && request.input.workflow_ref?.workflow_id === node.workflow_id &&
      (target.kind === "new" || target.kind === "existing" && sameNode(node, target.ref)) &&
      (receipt.output.configuration?.status === "applied" || preservesImportSource(request))
  })
  const applied = importsChanged.filter(({ receipt }) => receipt.output.configuration?.status === "applied")
  const sources = applied.flatMap(pair => {
    if (!successful(pair.receipt)) return []
    const readback = pair.receipt.output.configuration.readback
    const parameters = pair.request.input.parameters?.source
    if (parameters?.kind !== "verified_delivery" || readback?.kind !== "text_import" ||
      !sameNode(pair.receipt.output.node, readback.node)) return []
    const destination = readback.source?.source_path
    if (typeof destination !== "string" || !path.posix.isAbsolute(destination) ||
      path.posix.normalize(destination) !== destination || /[\x00-\x1f\x7f\\]/.test(destination)) return []
    const name = path.posix.basename(destination)
    if (name !== input && !name.endsWith(`-${input}`)) return []
    const verified = deliveries.receipts.some(delivery => {
      const output = delivery.receipt.output.output
      return boundResult(delivery.receipt, delivery.request) && output?.status === "SUCCEEDED" &&
        output.cleanup_complete === true && output.upload_completion_verified === true &&
        output.sha256 === sha256 && output.bytes === bytes && output.destination === destination &&
        after(pair.request, delivery.receipt) && isUuid(delivery.request.input.artifact_id) &&
        delivery.request.input.artifact_id === parameters.artifact_id && typeof output.upload_operation_id === "string" &&
        output.upload_operation_id.length > 0 && output.upload_operation_id === parameters.upload_operation_id &&
        events.calls.some(prepare => prepare.tool === "loginom_dock_prepare" && prepare.output.prepared === true &&
          after(delivery.request, prepare) && Array.isArray(prepare.output.input_artifacts) &&
          prepare.output.input_artifacts.some((item: { name?: string; artifact_id?: string; sha256?: string; bytes?: number; upload?: { grant_id?: string; destination?: string } }) =>
            item?.name === name && item.artifact_id === delivery.request.input.artifact_id && item.sha256 === sha256 && item.bytes === bytes &&
            isUuid(delivery.request.input.upload_grant_id) && item.upload?.grant_id === delivery.request.input.upload_grant_id && item.upload?.destination === destination))
    })
    return verified ? [{ ...pair, destination }] : []
  })

  const proofs = importsChanged.flatMap(pair => {
    const result = pair.receipt.output
    const node = result.node
    const execution = result.execution
    if (!successful(pair.receipt) || execution?.status !== "completed" || !safeId(execution.execution_id) ||
      importsChanged.some(change => change.request.index > pair.request.index && sameNode(node, change.receipt.output.node))) return []
    const source = result.configuration?.status === "applied" ? sources.find(source => source.receipt === pair.receipt) :
      result.configuration?.status === "not_requested" && sources.findLast(source =>
        sameNode(node, source.receipt.output.node) && after(pair.request, source.receipt) &&
        !applied.some(change => change.request.index > source.request.index && change.request.index < pair.request.index &&
          sameNode(node, change.receipt.output.node)))
    if (!source) return []
    const readback = result.configuration?.readback
    if (readback && (readback.kind !== "text_import" || !sameNode(node, readback.node) ||
      readback.source?.source_path !== source.destination)) return []

    const cohort_sample = input === "purchase_lines.csv" ? [result, ...settled
      .filter(read => read.request.tool === "loginom_dock_node_read" && successful(read.receipt) && after(read.request, pair.receipt) &&
        (read.request.input.execution === undefined || read.request.input.execution === "existing") &&
        read.request.input.source_operation_id === pair.request.input.operation_id &&
        sameNode(node, read.receipt.output.node) && read.receipt.output.execution?.status === "completed" &&
        read.receipt.output.execution.execution_id === execution.execution_id)
      .map(read => read.receipt.output)]
      .map(output => freshPort(output, execution.execution_id))
      .map(port => port && cohortSample(port))
      .find(sample => sample !== undefined) : undefined
    return [{ input, bytes, sha256, destination: source.destination,
      node: { document_id: node.document_id, workflow_id: node.workflow_id, node_id: node.node_id },
      execution_id: execution.execution_id, cohort_sample }]
  })
  const latest = new Map<string, (typeof proofs)[number]>()
  for (const proof of proofs) {
    const key = JSON.stringify(proof.node)
    const previous = latest.get(key)
    if (!previous?.cohort_sample || proof.cohort_sample || proof.execution_id !== previous.execution_id) latest.set(key, proof)
  }
  const imports = [...latest.values()]
  return imports.length > 1 ? { imports } : imports[0]
}

// Dock executes an existing text import with this exact empty patch without configuring a source.
function preservesImportSource(request: NodeCall) {
  const input = request.input
  const parameters = input.parameters
  return input.target.kind === "existing" && typeof input.target.label === "string" && input.target.label.trim().length > 0 &&
    input.mode === "delimited" && input.finish === "execute" && !input.bindings?.length &&
    Array.isArray(input.inputs) && input.inputs.length === 0 && Array.isArray(input.mappings) && input.mappings.length === 0 &&
    parameters && Object.keys(parameters).join() === "settings" && parameters.settings && typeof parameters.settings === "object" &&
    !Array.isArray(parameters.settings) && Object.keys(parameters.settings).length === 0 &&
    Array.isArray(input.read?.ports) && input.read.ports.length === 1 && input.read.ports[0] === 0
}

function boundResult(receipt: NodeCall, request: NodeCall) {
  return receipt.input.operation_id === request.input.operation_id && (receipt === request || after(receipt, request))
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[\w:.-]{1,128}$/.test(value)
}

function sameNode(node: { document_id: string; workflow_id: string; node_id: string }, ref: typeof node | undefined) {
  return node.document_id === ref?.document_id && node.workflow_id === ref.workflow_id && node.node_id === ref.node_id
}

function freshPort(result: { output?: { status?: string; execution_id?: string; ports?: Port[] } }, execution: string) {
  const output = result.output
  if (output?.execution_id !== execution || !["complete", "partial"].includes(output.status ?? "") || !Array.isArray(output.ports)) return
  return output.ports.find(port => port?.port === 0 && port.fresh === true && port.execution_id === execution &&
    port.freshness_basis === "completed_execution_port_source")
}

type Cell = { type: string; value: unknown; is_null: boolean; precision: string }
type Port = {
  port: number
  fresh: boolean
  execution_id: string
  freshness_basis: string
  schema?: { name: string; type: string }[]
  sample?: Cell[][]
}

function cohortSample(port: Port) {
  if (!Array.isArray(port.schema) || !Array.isArray(port.sample)) return
  const fields = port.schema.map(field => field?.name)
  const invoice = fields.indexOf("invoice_id")
  const customer = fields.indexOf("customer_id")
  if (invoice < 0 || customer < 0 || fields.lastIndexOf("invoice_id") !== invoice || fields.lastIndexOf("customer_id") !== customer ||
    port.schema[invoice]?.type !== "string" || port.schema[customer]?.type !== "string") return
  const rows = port.sample.filter(row => Array.isArray(row) && row[invoice]?.value === "I08")
  if (rows.length !== 1) return
  const invoiceCell = rows[0]?.[invoice]
  const customerCell = rows[0]?.[customer]
  if (invoiceCell?.type !== "string" || invoiceCell.is_null !== false || invoiceCell.precision !== "source_text" ||
    customerCell?.type !== "string" || customerCell.is_null !== true || customerCell.value !== null ||
    customerCell.precision !== "exact_null") return
  return {
    invoice_id: { type: "string", value: "I08", is_null: false },
    customer_id: { type: "string", value: null, is_null: true, precision: "exact_null" },
  }
}
