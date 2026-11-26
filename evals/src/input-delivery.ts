import path from "node:path"
import { after, operationReceipts, readNodeEvents, successful } from "./node-events"
import type { Task } from "./task"

const tools = new Set(["loginom_dock_prepare", "loginom_dock_artifact_deliver", "loginom_dock_node_apply",
  "loginom_dock_node_wait", "loginom_dock_node_resume"])

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
  const calls = events.calls
  const { receipts, failures } = operationReceipts(events)
  if (failures.length) return
  const input = path.basename(file)
  const sha256 = new Bun.CryptoHasher("sha256").update(data).digest("hex")
  const bytes = data.length
  const proofs = []

  for (const { request, receipt } of receipts) {
    if (request.tool !== "loginom_dock_node_apply" ||
      receipt.input.operation_id !== request.input.operation_id || (receipt !== request && !after(receipt, request))) continue
    const result = receipt.output
    const node = result.node
    const readback = result.configuration?.readback
    const execution = result.execution
    const parameters = request.input.parameters?.source
    if (request.input.target?.type !== "imports.text" || parameters?.kind !== "verified_delivery" ||
      result.configuration?.status !== "applied" || readback?.kind !== "text_import" ||
      execution?.status !== "completed" || !node || !safeId(node.document_id) || !isUuid(node.node_id) || !safeId(node.workflow_id) ||
      request.input.document_id !== node.document_id || request.input.workflow_ref?.workflow_id !== node.workflow_id ||
      !safeId(execution.execution_id)) continue

    const port = freshPort(result, execution.execution_id)
    if (!sameNode(node, readback.node) || request.input.target.kind === "existing" && !sameNode(node, request.input.target.ref)) continue

    for (const delivery of calls) {
      const output = delivery.output.output
      if (delivery.tool !== "loginom_dock_artifact_deliver" || !successful(delivery) ||
        delivery.output.state !== "settled" || typeof delivery.input.operation_id !== "string" ||
        delivery.output.operation_id !== delivery.input.operation_id ||
        output?.status !== "SUCCEEDED" || output.cleanup_complete !== true || output.upload_completion_verified !== true ||
        output.sha256 !== sha256 || output.bytes !== bytes || !after(request, delivery) ||
        !isUuid(delivery.input.artifact_id) || delivery.input.artifact_id !== parameters.artifact_id ||
        typeof output.upload_operation_id !== "string" || !output.upload_operation_id || output.upload_operation_id !== parameters.upload_operation_id) continue

      const destination = output.destination
      if (typeof destination !== "string" || destination !== readback.source?.source_path || !path.posix.isAbsolute(destination) ||
        path.posix.normalize(destination) !== destination || /[\x00-\x1f\x7f\\]/.test(destination)) continue
      const name = path.posix.basename(destination)
      if (name !== input && !name.endsWith(`-${input}`)) continue
      const prepared = calls.some(prepare => prepare.tool === "loginom_dock_prepare" && prepare.output.prepared === true &&
        after(delivery, prepare) && Array.isArray(prepare.output.input_artifacts) &&
        prepare.output.input_artifacts.some((item: { name?: string; artifact_id?: string; sha256?: string; bytes?: number; upload?: { grant_id?: string; destination?: string } }) =>
          item?.name === name && item.artifact_id === delivery.input.artifact_id && item.sha256 === sha256 && item.bytes === bytes &&
          isUuid(delivery.input.upload_grant_id) && item.upload?.grant_id === delivery.input.upload_grant_id && item.upload?.destination === destination))
      if (!prepared) continue
      proofs.push({ input, bytes, sha256, destination, node: { document_id: node.document_id, workflow_id: node.workflow_id, node_id: node.node_id },
        execution_id: execution.execution_id, cohort_sample: input === "purchase_lines.csv" && port ? cohortSample(port) : undefined })
    }
  }
  return proofs.findLast(proof => proof.cohort_sample) ?? proofs.at(-1)
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
